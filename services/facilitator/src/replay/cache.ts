/** A payment is keyed by network + nonce; the 120s TTL is the protocol minimum. */
export class ReplayCache {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 120_000,
    private readonly now: () => number = Date.now,
  ) {}

  private static key(network: string, nonce: string): string {
    return `${network}:${nonce}`;
  }

  private sweep(): void {
    const cutoff = this.now();
    for (const [k, expiry] of this.seen) {
      if (expiry <= cutoff) this.seen.delete(k);
    }
  }

  /** True if this (network, nonce) was already recorded within the TTL window. */
  has(network: string, nonce: string): boolean {
    const expiry = this.seen.get(ReplayCache.key(network, nonce));
    if (expiry === undefined) return false;
    if (expiry <= this.now()) {
      this.seen.delete(ReplayCache.key(network, nonce));
      return false;
    }
    return true;
  }

  /** Record a payment as seen. */
  record(network: string, nonce: string): void {
    this.sweep();
    this.seen.set(ReplayCache.key(network, nonce), this.now() + this.ttlMs);
  }

  get size(): number {
    return this.seen.size;
  }
}
