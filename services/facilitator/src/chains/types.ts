import type { PaymentPayload } from '@fourotwo/types';

/** Status of an on-chain transaction. */
export type TxState = 'pending' | 'confirmed' | 'failed' | 'unknown';

export interface TxStatus {
  txHash: string;
  state: TxState;
  blockHeight?: number;
}

export interface SettlementResult {
  /** On-chain transaction / deploy hash. */
  txHash: string;
  state: TxState;
  /** Settlement mode actually used (direct, for M1). */
  mode: 'direct';
}

export interface ChainAdapter {
  readonly network: PaymentPayload['network'];

  /** Verify the payment signature against the declared payer. */
  verifySignature(payload: PaymentPayload): Promise<boolean>;

  /** Check the payer holds at least `amount` (smallest unit) of the token. */
  checkBalance(address: string, amount: bigint): Promise<boolean>;

  /** Broadcast a direct on-chain settlement for a verified payment. */
  settleDirect(payload: PaymentPayload): Promise<SettlementResult>;

  /** Look up the on-chain status of a previously broadcast settlement. */
  getTransactionStatus(txHash: string): Promise<TxStatus>;
}
