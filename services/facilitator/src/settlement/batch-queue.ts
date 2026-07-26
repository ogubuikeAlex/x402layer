import { randomBytes } from 'node:crypto';

import type { Collection, MongoClient } from 'mongodb';
import type { PaymentPayload, SettlementReceipt } from '@fourotwo/types';

import { metrics } from '../metrics.js';
import type { SettlementReporter } from '../kyx/settlements.js';
import type { VaultRecorder } from './vault-recorder.js';

export interface BatchJob {
  settlementId: string;
  payload: PaymentPayload;
  receipt: SettlementReceipt;
  trustScore: number;
}

export interface BatchFlushResult {
  batchId: string;
  flushed: number;
  reason: 'window' | 'size' | 'manual';
  totalMotes: string;
  vaultRecorded: boolean;
  vaultTx?: string;
  at: string;
}

export interface BatchStatus {
  batchId: string;
  pending: number;
  totalPendingMotes: string;
  windowMs: number;
  maxPending: number;
  lastFlush: BatchFlushResult | null;
}

export interface BatchJobStore {
  add(job: BatchJob & { batchId: string }): Promise<void>;
  claim(flushId: string): Promise<BatchJob[]>;
  remove(flushId: string): Promise<void>;
  release(flushId: string): Promise<void>;
  pending(): Promise<{ count: number; totalMotes: string }>;
  init?(): Promise<void>;
  close?(): Promise<void>;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

export class InMemoryBatchJobStore implements BatchJobStore {
  private jobs: (BatchJob & { batchId: string; flushId?: string })[] = [];

  async add(job: BatchJob & { batchId: string }): Promise<void> {
    this.jobs.push({ ...job });
  }

  async claim(flushId: string): Promise<BatchJob[]> {
    const claimed = this.jobs.filter((j) => j.flushId === undefined);
    for (const j of claimed) j.flushId = flushId;
    return claimed.map(({ flushId: _f, batchId: _b, ...job }) => job);
  }

  async remove(flushId: string): Promise<void> {
    this.jobs = this.jobs.filter((j) => j.flushId !== flushId);
  }

  async release(flushId: string): Promise<void> {
    for (const j of this.jobs) if (j.flushId === flushId) j.flushId = undefined;
  }

  async pending(): Promise<{ count: number; totalMotes: string }> {
    const open = this.jobs.filter((j) => j.flushId === undefined);
    const total = open.reduce((sum, j) => sum + BigInt(j.receipt.amount), 0n);
    return { count: open.length, totalMotes: total.toString() };
  }
}

interface BatchDoc extends BatchJob {
  _id: string;
  batchId: string;
  enqueuedAt: Date;
  flushId?: string;
}

export class MongoBatchJobStore implements BatchJobStore {
  private collection!: Collection<BatchDoc>;

  constructor(
    private readonly client: MongoClient,
    private readonly dbName: string,
  ) {}

  async init(): Promise<void> {
    this.collection = this.client.db(this.dbName).collection<BatchDoc>('batch_jobs');
    await this.collection.createIndex({ flushId: 1 });
  }

  async add(job: BatchJob & { batchId: string }): Promise<void> {
    try {
      await this.collection.insertOne({ _id: job.settlementId, ...job, enqueuedAt: new Date() });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  async claim(flushId: string): Promise<BatchJob[]> {
    await this.collection.updateMany({ flushId: { $exists: false } }, { $set: { flushId } });
    const docs = await this.collection.find({ flushId }).toArray();
    return docs.map((d) => ({
      settlementId: d.settlementId,
      payload: d.payload,
      receipt: d.receipt,
      trustScore: d.trustScore,
    }));
  }

  async remove(flushId: string): Promise<void> {
    await this.collection.deleteMany({ flushId });
  }

  async release(flushId: string): Promise<void> {
    await this.collection.updateMany({ flushId }, { $unset: { flushId: '' } });
  }

  async pending(): Promise<{ count: number; totalMotes: string }> {
    const docs = await this.collection
      .find({ flushId: { $exists: false } }, { projection: { 'receipt.amount': 1 } })
      .toArray();
    const total = docs.reduce((sum, d) => sum + BigInt(d.receipt.amount), 0n);
    return { count: docs.length, totalMotes: total.toString() };
  }
}

export class BatchQueue {
  private batchId = newId('bat');
  private lastFlush: BatchFlushResult | null = null;
  private flushing: Promise<BatchFlushResult | null> | null = null;

  constructor(
    private readonly opts: {
      windowMs: number;
      maxPending: number;
      vaultRecorder: VaultRecorder;
      settlementReporter: SettlementReporter;
      store: BatchJobStore;
    },
  ) {
    const timer = setInterval(() => {
      void this.flush('window');
    }, opts.windowMs);
    timer.unref?.();
  }

  async init(): Promise<void> {
    await this.opts.store.init?.();
  }

  get currentBatchId(): string {
    return this.batchId;
  }

  async enqueue(job: BatchJob): Promise<{ batchId: string; position: number }> {
    const batchId = this.batchId;
    await this.opts.store.add({ ...job, batchId });
    const { count } = await this.opts.store.pending();
    if (count >= this.opts.maxPending) void this.flush('size');
    return { batchId, position: count };
  }

  async status(): Promise<BatchStatus> {
    const { count, totalMotes } = await this.opts.store.pending();
    return {
      batchId: this.batchId,
      pending: count,
      totalPendingMotes: totalMotes,
      windowMs: this.opts.windowMs,
      maxPending: this.opts.maxPending,
      lastFlush: this.lastFlush,
    };
  }

  async flush(reason: BatchFlushResult['reason']): Promise<BatchFlushResult | null> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush(reason).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(reason: BatchFlushResult['reason']): Promise<BatchFlushResult | null> {
    const flushId = newId('flush');
    const jobs = await this.opts.store.claim(flushId);
    if (jobs.length === 0) return null;
    const flushedBatchId = this.batchId;
    this.batchId = newId('bat');

    const totalMotes = jobs.reduce((sum, j) => sum + BigInt(j.receipt.amount), 0n);
    const recipients = new Set(jobs.map((j) => j.payload.paymentRequired.recipient));

    let vault: { recorded: boolean; detail?: string };
    try {
      // One vault record for the whole batch - the gas saving vs per-payment records.
      vault = await this.opts.vaultRecorder.record({
        did: `batch:${jobs.length}payments`,
        amount: totalMotes.toString(),
        recipient: recipients.size === 1 ? [...recipients][0]! : `multiple(${recipients.size})`,
        settlementId: flushId,
        trustScore: 0,
      });
    } catch (err) {
      // Unexpected recorder failure: return the jobs to the queue so a later flush retries.
      await this.opts.store.release(flushId);
      console.error(`[batch] flush ${flushId} aborted, jobs re-queued: ${(err as Error).message}`);
      throw err;
    }

    
    const reportedStatus: 'confirmed' | 'failed' = vault.recorded ? 'confirmed' : 'failed';
    for (const job of jobs) {
      void this.opts.settlementReporter
        .report({
          payload: job.payload,
          receipt: { ...job.receipt, txHash: vault.recorded ? vault.detail : undefined },
          status: reportedStatus,
        })
        .catch((err: Error) =>
          console.error(`[batch] settlement report failed for ${job.settlementId}: ${err.message}`),
        );
    }
    if (!vault.recorded) {
      console.error(
        `[batch] vault write failed for ${flushId}; ${jobs.length} settlement(s) reported as failed`,
      );
    }

    await this.opts.store.remove(flushId);

    metrics.inc('batches_flushed_total', { reason });
    metrics.inc('batched_settlements_total', undefined, jobs.length);

    this.lastFlush = {
      batchId: flushedBatchId,
      flushed: jobs.length,
      reason,
      totalMotes: totalMotes.toString(),
      vaultRecorded: vault.recorded,
      ...(vault.recorded && vault.detail ? { vaultTx: vault.detail } : {}),
      at: new Date().toISOString(),
    };
    console.log(
      `[batch] flushed ${jobs.length} settlement(s) in ${flushedBatchId} (${reason}) total ${totalMotes} motes`,
    );
    return this.lastFlush;
  }
}
