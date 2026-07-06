import type {
  PaymentPayload,
  PaymentRequired,
  AgentTrustSummary,
  VerifyRequest,
  VerifyResponse,
} from '@fourotwo/types';
import { decodeEnvelope, base64Decode, isValidDid, parseDid } from '@fourotwo/types';

import type { AppContext } from '../context.js';
import { verificationId } from '../util/ids.js';

export interface VerifyOutcome {
  status: number;
  body: VerifyResponse;
}

interface SignatureEnvelope {
  payer: string;
  signature: string;
}

/** `payment_signature` is base64 of `{ payer, signature }` (see .env.example / README). */
function decodeSignatureEnvelope(b64: string): SignatureEnvelope | null {
  try {
    const json = new TextDecoder().decode(base64Decode(b64));
    const parsed = JSON.parse(json) as Partial<SignatureEnvelope>;
    if (typeof parsed.payer !== 'string' || typeof parsed.signature !== 'string') return null;
    return { payer: parsed.payer, signature: parsed.signature };
  } catch {
    return null;
  }
}

function fail(reason: Parameters<typeof makeFail>[0], detail: string): VerifyOutcome {
  return { status: 400, body: makeFail(reason, detail) };
}

function makeFail(
  reason:
    | 'SIGNATURE_INVALID'
    | 'AMOUNT_MISMATCH'
    | 'EXPIRED'
    | 'INSUFFICIENT_BALANCE'
    | 'AGENT_NOT_REGISTERED'
    | 'AGENT_BLOCKED'
    | 'REPLAYED'
    | 'UNSUPPORTED_NETWORK'
    | 'MALFORMED_PAYLOAD',
  detail: string,
): VerifyResponse {
  return { valid: false, reason, detail };
}

export async function runVerify(ctx: AppContext, req: VerifyRequest): Promise<VerifyOutcome> {
  // (0) Basic request shape
  if (!req || typeof req.payment_required !== 'string' || typeof req.payment_signature !== 'string') {
    return fail('MALFORMED_PAYLOAD', 'Missing payment_required or payment_signature');
  }
  if (!isValidDid(req.agent_did)) {
    return fail('MALFORMED_PAYLOAD', `agent_did is not a valid fourotwo DID: ${req.agent_did}`);
  }

  // (1) Decode envelope
  let envelope: PaymentRequired;
  try {
    envelope = decodeEnvelope(req.payment_required);
  } catch {
    return fail('MALFORMED_PAYLOAD', 'payment_required is not a valid base64 envelope');
  }
  const sigEnv = decodeSignatureEnvelope(req.payment_signature);
  if (!sigEnv) return fail('MALFORMED_PAYLOAD', 'payment_signature must be base64 of {payer,signature}');

  const parsedDid = parseDid(req.agent_did)!;
  if (parsedDid.network !== envelope.network) {
    return fail('MALFORMED_PAYLOAD', 'agent_did network does not match envelope network');
  }

  const adapter = ctx.adapters.get(envelope.network);
  if (!adapter) {
    return fail('UNSUPPORTED_NETWORK', `No adapter for network "${envelope.network}"`);
  }

  // (1b) Expiry
  const nowSec = Math.floor(Date.now() / 1000);
  if (envelope.expiry && envelope.expiry < nowSec) {
    return fail('EXPIRED', `Payment expired at ${envelope.expiry}, now ${nowSec}`);
  }

  const payload: PaymentPayload = {
    network: envelope.network,
    payer: sigEnv.payer,
    agentDid: req.agent_did,
    signature: sigEnv.signature,
    paymentRequired: envelope,
  };

  // (2) Signature
  const sigOk = await adapter.verifySignature(payload);
  if (!sigOk) return fail('SIGNATURE_INVALID', 'Signature does not verify against payer');

  // (3) Replay
  if (ctx.replayCache.has(envelope.network, envelope.nonce)) {
    return fail('REPLAYED', `Nonce ${envelope.nonce} already used within the replay window`);
  }

  // (4) Trust resolution
  let trust: AgentTrustSummary | null;
  try {
    trust = await ctx.trustClient.getTrustSummary(req.agent_did);
  } catch {
    trust = {
      did: req.agent_did,
      trust_score: null,
      trust_tier: null,
      operator_kyc: false,
      transaction_count: 0,
      completion_rate: 0,
      flags: ['trust_unavailable'],
      trust_unavailable: true,
    };
  }
  if (trust === null) {
    return fail('AGENT_NOT_REGISTERED', `DID ${req.agent_did} is not registered`);
  }
  if (trust.trust_tier === 'BLOCKED') {
    return fail('AGENT_BLOCKED', `DID ${req.agent_did} is BLOCKED`);
  }
  if (
    envelope.minTrustScore !== undefined &&
    trust.trust_score !== null &&
    trust.trust_score < envelope.minTrustScore
  ) {
    return fail(
      'AGENT_BLOCKED',
      `Trust score ${trust.trust_score} below merchant minimum ${envelope.minTrustScore}`,
    );
  }

  // (5) Balance (best-effort: a node/config failure must not break the demo)
  try {
    const ok = await adapter.checkBalance(payload.payer, BigInt(envelope.amount));
    if (!ok) return fail('INSUFFICIENT_BALANCE', 'Payer balance below required amount');
  } catch {
    if (!trust.flags.includes('balance_check_skipped')) trust.flags.push('balance_check_skipped');
  }

  // Success - record replay + verification, return enriched result
  ctx.replayCache.record(envelope.network, envelope.nonce);
  const vid = verificationId();
  ctx.verifications.put({ verificationId: vid, payload, trustScore: trust.trust_score });

  return {
    status: 200,
    body: {
      valid: true,
      agent_trust: trust,
      settlement_recommendation: 'direct',
      verification_id: vid,
    },
  };
}
