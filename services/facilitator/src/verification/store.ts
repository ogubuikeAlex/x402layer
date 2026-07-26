import type { Collection, MongoClient } from 'mongodb';
import type { PaymentPayload } from '@fourotwo/types';

/** A verification result held between /verify and /settle. */
export interface VerificationRecord {
  verificationId: string;
  payload: PaymentPayload;
  trustScore: number | null;
  createdAt: number;
  settled: boolean;
}

export interface VerificationStore {
  put(record: Omit<VerificationRecord, 'createdAt' | 'settled'>): Promise<void>;
  get(verificationId: string): Promise<VerificationRecord | undefined>;
  claim(verificationId: string): Promise<VerificationRecord | undefined>;
  unclaim(verificationId: string): Promise<void>;
  markSettled(verificationId: string): Promise<void>;
  init?(): Promise<void>;
  close?(): Promise<void>;
}

export class InMemoryVerificationStore implements VerificationStore {
  private readonly records = new Map<string, VerificationRecord>();

  constructor(
    private readonly ttlMs = 300_000,
    private readonly now: () => number = Date.now,
  ) {}

  async put(record: Omit<VerificationRecord, 'createdAt' | 'settled'>): Promise<void> {
    this.records.set(record.verificationId, {
      ...record,
      createdAt: this.now(),
      settled: false,
    });
  }

  async get(verificationId: string): Promise<VerificationRecord | undefined> {
    const rec = this.records.get(verificationId);
    if (!rec) return undefined;
    if (this.now() - rec.createdAt > this.ttlMs) {
      this.records.delete(verificationId);
      return undefined;
    }
    return rec;
  }

  async claim(verificationId: string): Promise<VerificationRecord | undefined> {
    const rec = await this.get(verificationId);
    if (!rec || rec.settled) return undefined;
    rec.settled = true;
    return rec;
  }

  async unclaim(verificationId: string): Promise<void> {
    const rec = this.records.get(verificationId);
    if (rec) rec.settled = false;
  }

  async markSettled(verificationId: string): Promise<void> {
    const rec = this.records.get(verificationId);
    if (rec) rec.settled = true;
  }
}

interface VerificationDoc {
  _id: string;
  payload: PaymentPayload;
  trustScore: number | null;
  settled: boolean;
  createdAt: Date;
}

function toRecord(doc: VerificationDoc): VerificationRecord {
  return {
    verificationId: doc._id,
    payload: doc.payload,
    trustScore: doc.trustScore,
    createdAt: doc.createdAt.getTime(),
    settled: doc.settled,
  };
}
export class MongoVerificationStore implements VerificationStore {
  private collection!: Collection<VerificationDoc>;

  constructor(
    private readonly client: MongoClient,
    private readonly dbName: string,
    private readonly ttlMs = 300_000,
  ) {}

  async init(): Promise<void> {
    this.collection = this.client.db(this.dbName).collection<VerificationDoc>('verifications');
    await this.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: Math.ceil(this.ttlMs / 1000) },
    );
  }

  async put(record: Omit<VerificationRecord, 'createdAt' | 'settled'>): Promise<void> {
    await this.collection.insertOne({
      _id: record.verificationId,
      payload: record.payload,
      trustScore: record.trustScore,
      settled: false,
      createdAt: new Date(),
    });
  }

  async get(verificationId: string): Promise<VerificationRecord | undefined> {
    const doc = await this.collection.findOne({ _id: verificationId });
    return doc ? toRecord(doc) : undefined;
  }

  async claim(verificationId: string): Promise<VerificationRecord | undefined> {
    const doc = await this.collection.findOneAndUpdate(
      { _id: verificationId, settled: false },
      { $set: { settled: true } },
      { returnDocument: 'after' },
    );
    return doc ? toRecord(doc) : undefined;
  }

  async unclaim(verificationId: string): Promise<void> {
    await this.collection.updateOne({ _id: verificationId }, { $set: { settled: false } });
  }

  async markSettled(verificationId: string): Promise<void> {
    await this.collection.updateOne({ _id: verificationId }, { $set: { settled: true } });
  }
}
