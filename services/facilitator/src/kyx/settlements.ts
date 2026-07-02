import type { PaymentPayload, SettlementReceipt } from '@fourotwo/types';

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
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async report(args: {
    payload: PaymentPayload;
    receipt: SettlementReceipt;
    status: 'pending' | 'confirmed' | 'failed';
  }): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/settlements`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
