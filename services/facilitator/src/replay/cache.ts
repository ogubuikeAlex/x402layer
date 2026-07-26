import type { Collection, MongoClient } from 'mongodb';

export interface ReplayStore {
  has(network: string, nonce: string): Promise<boolean>;
  /** Atomically reserve a nonce. Returns `true` if newly recorded, `false` if already seen. */
  record(network: string, nonce: string): Promise<boolean>;
  init?(): Promise<void>;
  close?(): Promise<void>;
}

function replayKey(network: string, nonce: string): string {
  return `${network}:${nonce}`;
}

/** In-memory replay cache (single process; state is lost on restart). */
export class ReplayCache implements ReplayStore {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 120_000,
    private readonly now: () => number = Date.now,
  ) {}

  private sweep(): void {
    const cutoff = this.now();
    for (const [k, expiry] of this.seen) {
      if (expiry <= cutoff) this.seen.delete(k);
    }
  }

  async has(network: string, nonce: string): Promise<boolean> {
    const key = replayKey(network, nonce);
    const expiry = this.seen.get(key);
    if (expiry === undefined) return false;
    if (expiry <= this.now()) {
      this.seen.delete(key);
      return false;
    }
    return true;
  }

  async record(network: string, nonce: string): Promise<boolean> {
    this.sweep();
    const key = replayKey(network, nonce);
    const expiry = this.seen.get(key);
    if (expiry !== undefined && expiry > this.now()) return false;
    this.seen.set(key, this.now() + this.ttlMs);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

interface ReplayDoc {
  _id: string;
  expireAt: Date;
}

export class MongoReplayCache implements ReplayStore {
  private collection!: Collection<ReplayDoc>;

  constructor(
    private readonly client: MongoClient,
    private readonly dbName: string,
    private readonly ttlMs = 120_000,
    private readonly now: () => number = Date.now,
  ) {}

  async init(): Promise<void> {
    this.collection = this.client.db(this.dbName).collection<ReplayDoc>('replay_nonces');
    await this.collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
  }

  async has(network: string, nonce: string): Promise<boolean> {
    const doc = await this.collection.findOne({ _id: replayKey(network, nonce) });
    return !!doc && doc.expireAt.getTime() > this.now();
  }

  async record(network: string, nonce: string): Promise<boolean> {
    const key = replayKey(network, nonce);
    const nowMs = this.now();
    const expireAt = new Date(nowMs + this.ttlMs);
    // Reclaim an already-expired slot atomically…
    const reclaimed = await this.collection.updateOne(
      { _id: key, expireAt: { $lte: new Date(nowMs) } },
      { $set: { expireAt } },
    );
    if (reclaimed.modifiedCount === 1) return true;
    try {
      await this.collection.insertOne({ _id: key, expireAt });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }
}
