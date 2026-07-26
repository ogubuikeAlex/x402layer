import type {
  PaymentPayload,
  PaymentRequired,
  AgentTrustSummary,
  VerifyRequest,
  VerifyResponse,
} from '@fourotwo/types';
import { decodeEnvelope, base64Decode, isValidDid, parseDid, deriveAddress } from '@fourotwo/types';

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

type FailReason =
  | 'SIGNATURE_INVALID'
  | 'AMOUNT_MISMATCH'
  | 'EXPIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'AGENT_NOT_REGISTERED'
  | 'AGENT_BLOCKED'
  | 'DID_KEY_MISMATCH'
  | 'TRUST_UNAVAILABLE'
  | 'BALANCE_UNAVAILABLE'
  | 'REPLAYED'
  | 'UNSUPPORTED_NETWORK'
  | 'MALFORMED_PAYLOAD';

function fail(reason: FailReason, detail: string, status = 400): VerifyOutcome {
  return { status, body: makeFail(reason, detail) };
}

function makeFail(reason: FailReason, detail: string): VerifyResponse {
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

  const nowSec = Math.floor(Date.now() / 1000);
  if (!envelope.expiry || !Number.isFinite(envelope.expiry)) {
    return fail('MALFORMED_PAYLOAD', 'payment_required.expiry is required');
  }
  if (envelope.expiry < nowSec) {
    return fail('EXPIRED', `Payment expired at ${envelope.expiry}, now ${nowSec}`);
  }

  const payload: PaymentPayload = {
    network: envelope.network,
    payer: sigEnv.payer,
    agentDid: req.agent_did,
    signature: sigEnv.signature,
    paymentRequired: envelope,
  };


  const sigOk = await adapter.verifySignature(payload);
  if (!sigOk) return fail('SIGNATURE_INVALID', 'Signature does not verify against payer');

  let derivedAddress: string;
  try {
    derivedAddress = deriveAddress(envelope.network, sigEnv.payer);
  } catch {
    return fail('MALFORMED_PAYLOAD', 'payer public key is not valid for this network');
  }
  if (derivedAddress.toLowerCase() !== parsedDid.address.toLowerCase()) {
    return fail('DID_KEY_MISMATCH', 'agent_did does not belong to the signing key');
  }

  if (await ctx.replayCache.has(envelope.network, envelope.nonce)) {
    return fail('REPLAYED', `Nonce ${envelope.nonce} already used within the replay window`);
  }

  let trust: AgentTrustSummary | null;
  try {
    trust = await ctx.trustClient.getTrustSummary(req.agent_did);
  } catch (err) {
    return fail(
      'TRUST_UNAVAILABLE',
      `Trust registry unavailable: ${(err as Error).message}`,
      503,
    );
  }
  if (trust === null) {
    return fail('AGENT_NOT_REGISTERED', `DID ${req.agent_did} is not registered`);
  }
  if (trust.trust_tier === 'BLOCKED') {
    return fail('AGENT_BLOCKED', `DID ${req.agent_did} is BLOCKED`);
  }
  if (envelope.minTrustScore !== undefined) {
    if (trust.trust_score === null || trust.trust_score < envelope.minTrustScore) {
      return fail(
        'AGENT_BLOCKED',
        `Trust score ${trust.trust_score ?? 'unscored'} below merchant minimum ${envelope.minTrustScore}`,
      );
    }
  }

  try {
    const ok = await adapter.checkBalance(payload.payer, BigInt(envelope.amount));
    if (!ok) return fail('INSUFFICIENT_BALANCE', 'Payer balance below required amount');
  } catch (err) {
    return fail(
      'BALANCE_UNAVAILABLE',
      `Could not verify payer balance: ${(err as Error).message}`,
      503,
    );
  }

  const reserved = await ctx.replayCache.record(envelope.network, envelope.nonce);
  if (!reserved) {
    return fail('REPLAYED', `Nonce ${envelope.nonce} already used within the replay window`);
  }
  const vid = verificationId();
  await ctx.verifications.put({ verificationId: vid, payload, trustScore: trust.trust_score });

  const { autoThresholdMotes } = ctx.config.batch;
  return {
    status: 200,
    body: {
      valid: true,
      agent_trust: trust,
      settlement_recommendation:
        autoThresholdMotes > 0n && BigInt(envelope.amount) <= autoThresholdMotes ? 'batch' : 'direct',
      verification_id: vid,
    },
  };
}
