import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Collection, MongoClient } from 'mongodb';

export interface FeeEntry {
  settlementId: string;
  did: string;
  merchant: string;
  amountMotes: string;
  feeMotes: string;
  mode: string;
  at: string;
  collected?: boolean;
  collectedTxHash?: string;
  collectedAt?: string;
}

export interface FeeSummary {
  feeBps: number;
  feeRecipient: string | null;
  count: number;
  totalVolumeMotes: string;
  totalFeesMotes: string;
  collectedFeesMotes: string;
  uncollectedFeesMotes: string;
  byMerchant: { merchant: string; count: number; feesMotes: string }[];
  recent: FeeEntry[];
}

export interface UncollectedFees {
  recipient: string | undefined;
  totalMotes: string;
  entryIds: string[];
}

export interface ChargeArgs {
  settlementId: string;
  did: string;
  merchant: string;
  amountMotes: string;
  mode: string;
}

export interface FeeLedgerStore {
  readonly bps: number;
  readonly recipient: string | undefined;
  charge(args: ChargeArgs): Promise<string>;
  summary(): Promise<FeeSummary>;
  uncollected(): Promise<UncollectedFees>;
  markCollected(entryIds: string[], txHash: string): Promise<void>;
  init?(): Promise<void>;
  close?(): Promise<void>;
}

function feeFor(amountMotes: string, feeBps: number): bigint {
  return (BigInt(amountMotes) * BigInt(feeBps)) / 10_000n;
}

function summarize(entries: FeeEntry[], feeBps: number, feeRecipient: string | undefined): FeeSummary {
  let volume = 0n;
  let fees = 0n;
  let collected = 0n;
  const merchants = new Map<string, { count: number; fees: bigint }>();
  for (const entry of entries) {
    volume += BigInt(entry.amountMotes);
    const feeMotes = BigInt(entry.feeMotes);
    fees += feeMotes;
    if (entry.collected) collected += feeMotes;
    const m = merchants.get(entry.merchant) ?? { count: 0, fees: 0n };
    m.count += 1;
    m.fees += feeMotes;
    merchants.set(entry.merchant, m);
  }
  return {
    feeBps,
    feeRecipient: feeRecipient ?? null,
    count: entries.length,
    totalVolumeMotes: volume.toString(),
    totalFeesMotes: fees.toString(),
    collectedFeesMotes: collected.toString(),
    uncollectedFeesMotes: (fees - collected).toString(),
    byMerchant: [...merchants.entries()]
      .map(([merchant, m]) => ({ merchant, count: m.count, feesMotes: m.fees.toString() }))
      .sort((a, b) => Number(BigInt(b.feesMotes) - BigInt(a.feesMotes)))
      .slice(0, 20),
    recent: entries.slice(-25).reverse(),
  };
}

function uncollectedFrom(entries: FeeEntry[], recipient: string | undefined): UncollectedFees {
  let total = 0n;
  const entryIds: string[] = [];
  for (const e of entries) {
    if (e.collected) continue;
    const fee = BigInt(e.feeMotes);
    if (fee <= 0n) continue;
    total += fee;
    entryIds.push(e.settlementId);
  }
  return { recipient, totalMotes: total.toString(), entryIds };
}

export class FeeLedger implements FeeLedgerStore {
  private entries: FeeEntry[] = [];

  constructor(
    private readonly feeBps: number,
    private readonly feeRecipient: string | undefined,
    private readonly dataFile?: string,
  ) {
    if (dataFile && existsSync(dataFile)) {
      try {
        this.entries = JSON.parse(readFileSync(dataFile, 'utf8')) as FeeEntry[];
      } catch {
        this.entries = [];
      }
    }
  }

  get bps(): number {
    return this.feeBps;
  }

  get recipient(): string | undefined {
    return this.feeRecipient;
  }

  async charge(args: ChargeArgs): Promise<string> {
    const fee = feeFor(args.amountMotes, this.feeBps);
    this.entries.push({
      settlementId: args.settlementId,
      did: args.did,
      merchant: args.merchant,
      amountMotes: args.amountMotes,
      feeMotes: fee.toString(),
      mode: args.mode,
      at: new Date().toISOString(),
    });
    this.persist();
    return fee.toString();
  }

  async summary(): Promise<FeeSummary> {
    return summarize(this.entries, this.feeBps, this.feeRecipient);
  }

  async uncollected(): Promise<UncollectedFees> {
    return uncollectedFrom(this.entries, this.feeRecipient);
  }

  async markCollected(entryIds: string[], txHash: string): Promise<void> {
    const ids = new Set(entryIds);
    const at = new Date().toISOString();
    for (const e of this.entries) {
      if (ids.has(e.settlementId) && !e.collected) {
        e.collected = true;
        e.collectedTxHash = txHash;
        e.collectedAt = at;
      }
    }
    this.persist();
  }

  private persist(): void {
    if (!this.dataFile) return;
    try {
      mkdirSync(dirname(this.dataFile), { recursive: true });
      writeFileSync(this.dataFile, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[fees] could not persist fee ledger: ${(err as Error).message}`);
    }
  }
}

interface FeeDoc extends FeeEntry {
  _id: string;
}

export class MongoFeeLedger implements FeeLedgerStore {
  private collection!: Collection<FeeDoc>;

  constructor(
    private readonly client: MongoClient,
    private readonly dbName: string,
    private readonly feeBps: number,
    private readonly feeRecipient: string | undefined,
  ) {}

  get bps(): number {
    return this.feeBps;
  }

  get recipient(): string | undefined {
    return this.feeRecipient;
  }

  async init(): Promise<void> {
    this.collection = this.client.db(this.dbName).collection<FeeDoc>('fees');
    await this.collection.createIndex({ _id: 1 });
  }

  async charge(args: ChargeArgs): Promise<string> {
    const fee = feeFor(args.amountMotes, this.feeBps);
    const entry: FeeDoc = {
      _id: args.settlementId,
      settlementId: args.settlementId,
      did: args.did,
      merchant: args.merchant,
      amountMotes: args.amountMotes,
      feeMotes: fee.toString(),
      mode: args.mode,
      at: new Date().toISOString(),
    };
    try {
      await this.collection.insertOne(entry);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    return fee.toString();
  }

  async summary(): Promise<FeeSummary> {
    const entries = await this.collection
      .find({}, { projection: { _id: 0 } })
      .sort({ at: 1 })
      .toArray();
    return summarize(entries, this.feeBps, this.feeRecipient);
  }

  async uncollected(): Promise<UncollectedFees> {
    const entries = await this.collection.find({ collected: { $ne: true } }).toArray();
    return uncollectedFrom(entries, this.feeRecipient);
  }

  async markCollected(entryIds: string[], txHash: string): Promise<void> {
    if (entryIds.length === 0) return;
    await this.collection.updateMany(
      { _id: { $in: entryIds }, collected: { $ne: true } },
      { $set: { collected: true, collectedTxHash: txHash, collectedAt: new Date().toISOString() } },
    );
  }
}
