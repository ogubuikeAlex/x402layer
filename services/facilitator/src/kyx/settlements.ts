import type { PaymentPayload, SettlementReceipt } from '@fourotwo/types';
import { fetchWithTimeout } from '@fourotwo/types';

export interface SettlementReporter {
  report(args: {
    payload: PaymentPayload;
    receipt: SettlementReceipt;
    status: 'pending' | 'confirmed' | 'failed';
  }): Promise<void>;
}

export class NoopSettlementReporter implements SettlementReporter {
  async report(): Promise<void> {}
}

export class HttpSettlementReporter implements SettlementReporter {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined = undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async report(args: {
    payload: PaymentPayload;
    receipt: SettlementReceipt;
    status: 'pending' | 'confirmed' | 'failed';
  }): Promise<void> {
    const res = await fetchWithTimeout(this.fetchImpl, `${this.baseUrl}/settlements`, {
      method: 'POST',
      timeoutMs: 8_000,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        settlement_id: args.receipt.settlementId,
        did: args.receipt.did,
        amount: args.receipt.amount,
        token: args.receipt.token,
        network: args.receipt.network,
        recipient: args.payload.paymentRequired.recipient,
        status: args.status,
        trust_score: args.receipt.trustScore,
        settled_at: args.receipt.settledAt,
        tx_hash: args.receipt.txHash,
      }),
    });
    if (!res.ok) throw new Error(`KYX settlement report failed: ${res.status}`);
  }
}
