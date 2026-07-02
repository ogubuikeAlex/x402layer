import { describe, expect, it } from 'vitest';

import { casperAccountHash, deriveDid, formatDid, isValidDid, parseDid } from './did.js';
import { tierForScore } from './trust.js';

// A fixed 32-byte ed25519 public key (tagged with 01) for deterministic checks.
const ED25519_TAGGED = '01' + '11'.repeat(32);

describe('casperAccountHash', () => {
  it('is deterministic for a fixed key', () => {
    const a = casperAccountHash(ED25519_TAGGED);
    const b = casperAccountHash(ED25519_TAGGED);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats tagged and untagged ed25519 keys identically', () => {
    const tagged = casperAccountHash(ED25519_TAGGED);
    const untagged = casperAccountHash('11'.repeat(32));
    expect(tagged).toBe(untagged);
  });
});

describe('deriveDid / parseDid', () => {
  it('derives a deterministic casper DID', () => {
    const did = deriveDid('casper', ED25519_TAGGED);
    expect(did.startsWith('did:fourotwo:casper:')).toBe(true);
    const again = deriveDid('casper', ED25519_TAGGED);
    expect(did).toBe(again);
  });

  it('round-trips through parseDid', () => {
    const did = formatDid('casper', 'aabbcc');
    const parsed = parseDid(did);
    expect(parsed).not.toBeNull();
    expect(parsed?.network).toBe('casper');
    expect(parsed?.address).toBe('aabbcc');
  });

  it('rejects malformed DIDs', () => {
    expect(isValidDid('did:other:casper:abc')).toBe(false);
    expect(isValidDid('not-a-did')).toBe(false);
    expect(isValidDid('did:fourotwo:casper:')).toBe(false);
  });
});

describe('tierForScore', () => {
  it('maps scores to the documented tier bands', () => {
    expect(tierForScore(95)).toBe('ELITE');
    expect(tierForScore(80)).toBe('VERIFIED');
    expect(tierForScore(50)).toBe('STANDARD');
    expect(tierForScore(10)).toBe('RESTRICTED');
    expect(tierForScore(0)).toBe('BLOCKED');
  });
});
