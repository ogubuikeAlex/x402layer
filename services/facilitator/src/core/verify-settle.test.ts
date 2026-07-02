import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type PaymentRequired,
  type VerifyRequest,
  type VerifySuccess,
  canonicalPaymentBytes,
  base64Encode,
  deriveDid,
  encodeEnvelope,
} from '@fourotwo/types';

import { loadConfig } from '../config.js';
import { buildContext, type AppContext } from '../context.js';
import { AdapterRegistry } from '../chains/registry.js';
import { CasperAdapter, type CasperRpcClient } from '../chains/casper.js';
import { StubTrustClient } from '../kyx/client.js';
import { runVerify } from './verify.js';
import { runSettle } from './settle.js';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// Deterministic agent keypair.
const SECRET = new Uint8Array(32).fill(7);
const PUBLIC = ed25519.getPublicKey(SECRET);
const TAGGED_PUB = '01' + bytesToHex(PUBLIC);
const AGENT_DID = deriveDid('casper', TAGGED_PUB);

function mockCasperClient(balance = 10_000_000_000n): CasperRpcClient {
  return {
    async getBalanceMotes() {
      return balance;
    },
    async broadcastTransfer() {
      return { deployHash: 'deploy-hash-test-0001' };
    },
    async getDeployStatus(deployHash) {
      return { txHash: deployHash, state: 'confirmed' };
    },
  };
}

function buildTestContext(client = mockCasperClient()): AppContext {
  const config = loadConfig();
  const adapters = new AdapterRegistry([new CasperAdapter(client)]);
  // Inject a deterministic trust client so the round-trip tests don't depend on
  // ambient .env (which may enable the on-chain/HTTP trust clients that make
  // network calls). Matches the M1 stub behaviour these tests assert.
  return buildContext(config, { adapters, trustClient: new StubTrustClient() });
}

function makeEnvelope(overrides: Partial<PaymentRequired> = {}): PaymentRequired {
  return {
    amount: '5000',
    recipient: 'account-hash-merchant',
    network: 'casper',
    token: 'CSPR',
    expiry: Math.floor(Date.now() / 1000) + 600,
    nonce: 'nonce-' + Math.random().toString(36).slice(2),
    ...overrides,
  };
}

function signedRequest(envelope: PaymentRequired): VerifyRequest {
  const signature = bytesToHex(ed25519.sign(canonicalPaymentBytes(envelope), SECRET));
  const sigEnvelope = base64Encode(
    new TextEncoder().encode(JSON.stringify({ payer: TAGGED_PUB, signature })),
  );
  return {
    payment_signature: sigEnvelope,
    payment_required: encodeEnvelope(envelope),
    agent_did: AGENT_DID,
  };
}

describe('verify → settle round trip (M1-T8 / M1-T9)', () => {
  let ctx: AppContext;
  beforeEach(() => {
    ctx = buildTestContext();
  });

  it('verifies a valid hand-crafted payment', async () => {
    const out = await runVerify(ctx, signedRequest(makeEnvelope()));
    expect(out.status).toBe(200);
    expect(out.body.valid).toBe(true);
    const body = out.body as VerifySuccess;
    expect(body.verification_id).toMatch(/^vrf_/);
    expect(body.settlement_recommendation).toBe('direct');
    // M1: trust scoring not live yet
    expect(body.agent_trust.trust_pending).toBe(true);
  });

  it('rejects a tampered signature with SIGNATURE_INVALID', async () => {
    const req = signedRequest(makeEnvelope());
    const tampered = { ...makeEnvelope({ amount: '9999' }) };
    // Reuse the old signature but a different envelope -> signature must fail.
    req.payment_required = encodeEnvelope(tampered);
    const out = await runVerify(ctx, req);
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ valid: false, reason: 'SIGNATURE_INVALID' });
  });

  it('rejects a replayed nonce', async () => {
    const req = signedRequest(makeEnvelope());
    const first = await runVerify(ctx, req);
    expect(first.body.valid).toBe(true);
    const second = await runVerify(ctx, req);
    expect(second.body).toMatchObject({ valid: false, reason: 'REPLAYED' });
  });

  it('rejects an expired payment', async () => {
    const out = await runVerify(ctx, signedRequest(makeEnvelope({ expiry: 1 })));
    expect(out.body).toMatchObject({ valid: false, reason: 'EXPIRED' });
  });

  it('rejects insufficient balance', async () => {
    const poor = buildTestContext(mockCasperClient(1n));
    const out = await runVerify(poor, signedRequest(makeEnvelope({ amount: '5000' })));
    expect(out.body).toMatchObject({ valid: false, reason: 'INSUFFICIENT_BALANCE' });
  });

  it('settles a verified payment and returns a signed receipt', async () => {
    const verify = await runVerify(ctx, signedRequest(makeEnvelope()));
    const vid = (verify.body as VerifySuccess).verification_id;

    const settle = await runSettle(ctx, { verification_id: vid });
    expect(settle.status).toBe(200);
    const body = settle.body as Extract<typeof settle.body, { settlement_id: string }>;
    expect(body.settlement_id).toMatch(/^stl_/);
    expect(body.mode).toBe('direct');
    expect(body.receipt.facilitatorSignature).toMatch(/^[0-9a-f]+$/);
    expect(body.receipt.txHash).toBe('deploy-hash-test-0001');
    expect(ctx.receiptSigner.verify(body.receipt)).toBe(true);
  });

  it('rejects double settlement', async () => {
    const verify = await runVerify(ctx, signedRequest(makeEnvelope()));
    const vid = (verify.body as VerifySuccess).verification_id;
    await runSettle(ctx, { verification_id: vid });
    const again = await runSettle(ctx, { verification_id: vid });
    expect(again.status).toBe(409);
  });

  it('404s settling an unknown verification id', async () => {
    const out = await runSettle(ctx, { verification_id: 'vrf_unknown' });
    expect(out.status).toBe(404);
  });
});
