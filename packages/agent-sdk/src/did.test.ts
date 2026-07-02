import { describe, expect, it } from 'vitest';

import { keypairFromPrivateKey } from './did.js';

describe('agent DID helpers', () => {
  it('derives a stable Casper DID from a fixed private key', () => {
    const keypair = keypairFromPrivateKey(new Uint8Array(32).fill(7));
    expect(keypair.did).toMatch(/^did:fourotwo:casper:[0-9a-f]{64}$/);
    expect(keypair.taggedPublicKeyHex.startsWith('01')).toBe(true);
  });
});
