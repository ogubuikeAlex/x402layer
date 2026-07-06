import type { PaymentPayload } from '@fourotwo/types';

/** A verification result held between /verify and /settle. */
export interface VerificationRecord {
  verificationId: string;
  payload: PaymentPayload;
  trustScore: number | null;
  createdAt: number;
  settled: boolean;
}

/**
 * Maps a verification_id to its verified payment, so /settle can settle exactly
 * what was verified. TTL-bounded.
 */
export class VerificationStore {
  private readonly records = new Map<string, VerificationRecord>();

  constructor(
    private readonly ttlMs = 300_000,
    private readonly now: () => number = Date.now,
  ) {}

  put(record: Omit<VerificationRecord, 'createdAt' | 'settled'>): void {
    this.records.set(record.verificationId, {
      ...record,
      createdAt: this.now(),
      settled: false,
    });
  }

  get(verificationId: string): VerificationRecord | undefined {
    const rec = this.records.get(verificationId);
    if (!rec) return undefined;
    if (this.now() - rec.createdAt > this.ttlMs) {
      this.records.delete(verificationId);
      return undefined;
    }
    return rec;
  }

  markSettled(verificationId: string): void {
    const rec = this.records.get(verificationId);
    if (rec) rec.settled = true;
  }
}
