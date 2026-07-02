import { NextResponse } from 'next/server';
import { sha512 } from '@noble/hashes/sha2';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import {
  type PaymentRequired,
  canonicalPaymentBytes,
  base64Encode,
  deriveDid,
  encodeEnvelope,
} from '@fourotwo/types';

import { FACILITATOR_URL } from '@/lib/facilitator';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export const dynamic = 'force-dynamic';

interface TraceStep {
  label: string;
  request?: unknown;
  status?: number;
  response?: unknown;
  ok: boolean;
}

/**
 * Runs a full x402 demo loop against the live facilitator:
 * craft a signed Casper payment → POST /verify → POST /settle.
 * This is the visual counterpart of the M1 curl test.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { amount?: string };
  const amount = body.amount && /^\d+$/.test(body.amount) ? body.amount : '5000';

  // Deterministic demo agent keypair (matches the facilitator craft script).
  const secret = new Uint8Array(32).fill(7);
  const publicKey = ed25519.getPublicKey(secret);
  const taggedPub = '01' + bytesToHex(publicKey);
  const did = deriveDid('casper', taggedPub);

  // Recipient must be a valid Casper account-hash so the live SettlementVault
  // record (record_settlement) can encode it as a Key. Defaults to the demo
  // agent's own account hash; override with DEMO_RECIPIENT_ACCOUNT_HASH.
  const recipient =
    process.env.DEMO_RECIPIENT_ACCOUNT_HASH ??
    'account-hash-3d5de8c609159a0954e773dd686fb7724428316cb30e00bdc899976127747f55';

  const envelope: PaymentRequired = {
    amount,
    recipient,
    network: 'casper',
    token: 'CSPR',
    expiry: Math.floor(Date.now() / 1000) + 600,
    nonce: `demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  };

  const signature = bytesToHex(ed25519.sign(canonicalPaymentBytes(envelope), secret));
  const verifyBody = {
    payment_signature: base64Encode(
      new TextEncoder().encode(JSON.stringify({ payer: taggedPub, signature })),
    ),
    payment_required: encodeEnvelope(envelope),
    agent_did: did,
  };

  const trace: TraceStep[] = [];

  try {
    // 1. /verify
    const vRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(verifyBody),
      cache: 'no-store',
    });
    const vJson = await vRes.json();
    trace.push({
      label: 'POST /verify',
      request: { agent_did: did, envelope },
      status: vRes.status,
      response: vJson,
      ok: vRes.ok && vJson.valid === true,
    });

    if (!vRes.ok || !vJson.valid) {
      return NextResponse.json({ did, trace, settled: false });
    }

    // 2. /settle
    const sRes = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verification_id: vJson.verification_id }),
      cache: 'no-store',
    });
    const sJson = await sRes.json();
    trace.push({
      label: 'POST /settle',
      request: { verification_id: vJson.verification_id },
      status: sRes.status,
      response: sJson,
      ok: sRes.ok,
    });

    return NextResponse.json({ did, trace, settled: sRes.ok });
  } catch (err) {
    trace.push({ label: 'error', response: (err as Error).message, ok: false });
    return NextResponse.json(
      { did, trace, settled: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
