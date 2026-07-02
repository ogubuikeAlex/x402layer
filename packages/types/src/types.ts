/**
 * Shared data models for fourotwo. Mirrors the product spec (Section 7) so the
 * facilitator, SDK, KYX registry, and dashboard never drift on shapes.
 */

export type ChainNetwork = 'base' | 'casper' | 'solana' | 'stellar' | 'polygon';
export type TrustTier = 'ELITE' | 'VERIFIED' | 'STANDARD' | 'RESTRICTED' | 'BLOCKED';
export type SettlementMode = 'direct' | 'batch' | 'channel' | 'l2';
export type VolumeTier = 'MICRO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'ENTERPRISE';

/** Networks that have a `ChainAdapter` implementation in the MVP facilitator. */
export type SupportedNetwork = Extract<ChainNetwork, 'casper' | 'base'>;

export interface AgentDid {
  did: string;
  operatorId: string;
  agentName: string;
  network: ChainNetwork;
  walletAddress: string;
  publicKey: string;
  registeredAt: string;
  isActive: boolean;
  kycVerified: boolean;
}

export interface TrustDimensions {
  completionRate: number; // 0–1
  behavioralConsistency: number; // 0–1
  operatorVerified: boolean;
  volumeTier: VolumeTier;
  disputeRate: number; // 0–1
}

export interface TrustHistory {
  totalTransactions: number;
  totalVolumeUsd: number;
  oldestTransaction: string | null;
  activeSinceDays: number;
}

export type TrustFlag = string;

export interface TrustScore {
  did: string;
  score: number; // 0–100
  tier: TrustTier;
  dimensions: TrustDimensions;
  history: TrustHistory;
  flags: TrustFlag[];
  lastUpdated: string;
}

export interface SettlementReceipt {
  settlementId: string;
  did: string;
  amount: string; // token smallest unit
  token: string;
  network: ChainNetwork;
  settlementMode: SettlementMode;
  txHash?: string;
  batchId?: string;
  channelId?: string;
  trustScore: number; // score at time of settlement
  settledAt: string;
  facilitatorSignature: string;
}

/* ---------------------------------------------------------------------------
 * x402 payment envelopes
 * ------------------------------------------------------------------------- */

/**
 * Decoded `PAYMENT-REQUIRED` envelope a merchant sends with a 402 response.
 * Carried base64-encoded in the `payment_required` field on the wire.
 */
export interface PaymentRequired {
  /** Amount owed, in the token's smallest unit (e.g. USDC has 6 decimals). */
  amount: string;
  /** Recipient address (merchant payout wallet). */
  recipient: string;
  network: ChainNetwork;
  token: string;
  /** Unix epoch seconds after which this payment request is no longer valid. */
  expiry: number;
  /** Unique per-request nonce; used for replay protection. */
  nonce: string;
  /** Facilitator that should verify/settle this payment. */
  facilitator?: string;
  /** Optional: merchant requires at least this trust score to be served. */
  minTrustScore?: number;
}

/**
 * The payment payload an agent's SDK produces and a merchant forwards to the
 * facilitator. The signature is over the canonical `PaymentRequired` envelope.
 */
export interface PaymentPayload {
  network: ChainNetwork;
  /** Payer (agent) public key / address used to verify the signature. */
  payer: string;
  agentDid: string;
  /** Hex/base64 signature over the canonical envelope. */
  signature: string;
  paymentRequired: PaymentRequired;
}

/* ---------------------------------------------------------------------------
 * Facilitator API contracts (product spec Section 8)
 * ------------------------------------------------------------------------- */

export interface VerifyRequest {
  payment_signature: string; // base64
  payment_required: string; // base64 PaymentRequired envelope
  agent_did: string;
}

export interface AgentTrustSummary {
  did: string;
  trust_score: number | null;
  trust_tier: TrustTier | null;
  operator_kyc: boolean;
  transaction_count: number;
  completion_rate: number;
  flags: TrustFlag[];
  /** True when the trust scoring service hasn't produced a score yet (M1 stub). */
  trust_pending?: boolean;
  /** True when payment verification continued while the KYX registry was unavailable. */
  trust_unavailable?: boolean;
}

export type VerifyRejectionReason =
  | 'SIGNATURE_INVALID'
  | 'AMOUNT_MISMATCH'
  | 'EXPIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'AGENT_NOT_REGISTERED'
  | 'AGENT_BLOCKED'
  | 'REPLAYED'
  | 'UNSUPPORTED_NETWORK'
  | 'MALFORMED_PAYLOAD';

export interface VerifySuccess {
  valid: true;
  agent_trust: AgentTrustSummary;
  settlement_recommendation: SettlementMode;
  verification_id: string;
}

export interface VerifyFailure {
  valid: false;
  reason: VerifyRejectionReason;
  detail: string;
}

export type VerifyResponse = VerifySuccess | VerifyFailure;

export interface SettleRequest {
  verification_id: string;
  settlement_mode?: 'auto' | SettlementMode;
}

export interface SettleResponse {
  settlement_id: string;
  status: 'pending' | 'confirmed';
  mode: SettlementMode;
  estimated_confirmation_ms: number;
  receipt: SettlementReceipt;
  vault_recorded?: boolean;
  /** Deploy/transaction hash of the on-chain SettlementVault record, when broadcast (M1-T9). */
  vault_tx?: string;
  warning?: string;
}

export interface SupportedNetworkEntry {
  network: ChainNetwork;
  tokens: string[];
}

export interface SupportedResponse {
  facilitator: string;
  version: string;
  networks: SupportedNetworkEntry[];
  features: string[];
  minimum_trust_score_enforcement: boolean;
}
