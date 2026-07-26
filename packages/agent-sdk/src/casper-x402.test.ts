import { describe, expect, it } from 'vitest';

import { keypairFromPrivateKey } from './did.js';
import {
  casperAccountAddress,
  createCasperX402Payment,
  type CasperX402PaymentRequirements,
} from './casper-x402.js';

// Deterministic ed25519 seed + fixed nonce/clock so the output is reproducible.
const SEED = '11'.repeat(32);
const FIXED_NONCE = new Uint8Array(32).fill(7);
const NOW = () => 1_800_000_000;

const REQUIREMENTS: CasperX402PaymentRequirements = {
  scheme: 'exact',
  network: 'casper:casper-test',
  payTo: '00' + 'ab'.repeat(32), // 00 + 64-hex account hash
  amount: '10000',
  asset: '9824d60dc3a5c44a20b9fd260a412437933835b52fc683d8ae36e4ec2114843e',
  maxTimeoutSeconds: 900,
  extra: { name: 'Cep18x402', version: '1', decimals: '2', symbol: 'CSPR' },
};

describe('createCasperX402Payment', () => {
  const keypair = keypairFromPrivateKey(SEED);

  it('produces a well-formed, schema-shaped payload', () => {
    const p = createCasperX402Payment({
      paymentRequirements: REQUIREMENTS,
      keypair,
      nowSec: NOW,
      nonce: FIXED_NONCE,
      resourceUrl: 'https://api.example.com/data',
    });

    expect(p.x402Version).toBe(2);
    expect(p.resource.url).toBe('https://api.example.com/data');
    expect(p.accepted).toMatchObject({ scheme: 'exact', network: 'casper:casper-test', amount: '10000' });

    // 65-byte signature: algorithm byte (01 = ed25519) + 64-byte ed25519 sig.
    expect(p.payload.signature).toMatch(/^[0-9a-f]{130}$/);
    expect(p.payload.signature.slice(0, 2)).toBe('01');
    // Tagged ed25519 public key.
    expect(p.payload.publicKey).toBe(keypair.taggedPublicKeyHex);

    // Authorization mirrors EIP-3009 fields; from = 00 + account hash.
    const a = p.payload.authorization;
    expect(a.from).toBe(casperAccountAddress(keypair.taggedPublicKeyHex));
    expect(a.from).toMatch(/^00[0-9a-f]{64}$/);
    expect(a.to).toBe('00' + 'ab'.repeat(32)); // payTo carries the 00 account tag
    expect(a.value).toBe('10000');
    expect(a.validAfter).toBe(String(NOW() - 600));
    expect(a.validBefore).toBe(String(NOW() + 900));
    expect(a.nonce).toBe('07'.repeat(32));
  });

  it('is deterministic for a fixed key, nonce and clock', () => {
    const opts = { paymentRequirements: REQUIREMENTS, keypair, nowSec: NOW, nonce: FIXED_NONCE };
    expect(createCasperX402Payment(opts).payload.signature).toBe(
      createCasperX402Payment(opts).payload.signature,
    );
  });

  it('requires token name and version in extra', () => {
    expect(() =>
      createCasperX402Payment({
        paymentRequirements: { ...REQUIREMENTS, extra: { name: '', version: '1' } },
        keypair,
        nonce: FIXED_NONCE,
      }),
    ).toThrow(/name is required/);
  });
});
