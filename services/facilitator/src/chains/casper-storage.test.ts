import { describe, it, expect } from 'vitest';
import {
  stringToBytes,
  odraMappingItemKey,
  odraVarItemKey,
  unwrapStoredBytes,
  parseTrustScoreRecord,
  parseAgentRecord,
  KYX_FIELD,
} from './casper-storage.js';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Casper/Odra storage encoding', () => {
  it('encodes a String as u32-LE length + utf8', () => {
    // "gold" -> 04 00 00 00 | 67 6f 6c 64
    expect(hex(stringToBytes('gold'))).toBe('04000000676f6c64');
    expect(hex(stringToBytes(''))).toBe('00000000');
  });

  it('derives deterministic 64-char hex dictionary item keys', () => {
    const k = odraMappingItemKey(KYX_FIELD.scores, 'did:fourotwo:abc');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    // Stable across calls and distinct per DID / per field.
    expect(odraMappingItemKey(KYX_FIELD.scores, 'did:fourotwo:abc')).toBe(k);
    expect(odraMappingItemKey(KYX_FIELD.scores, 'did:fourotwo:xyz')).not.toBe(k);
    expect(odraMappingItemKey(KYX_FIELD.agents, 'did:fourotwo:abc')).not.toBe(k);
    expect(odraVarItemKey(6)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('unwraps + parses a TrustScoreRecord round-trip', () => {
    const tier = 'gold';
    const record = concat(
      u8(85),
      stringToBytes(tier),
      u32le(9500),
      u64le(42n),
      u64le(1n),
      u64le(1700000000n),
    );
    const stored = concat(u32le(record.length), record); // List(U8) wrapper
    const raw = unwrapStoredBytes(hex(stored));
    const parsed = parseTrustScoreRecord(raw);
    expect(parsed).toEqual({
      score: 85,
      tier: 'gold',
      completionRateBps: 9500,
      totalTransactions: 42n,
      totalDisputes: 1n,
      lastUpdated: 1700000000n,
    });
  });

  it('parses an AgentRecord (kyc flag is the last byte)', () => {
    const operatorKey = new Uint8Array(33); // tag 0x00 (Account) + 32 zero bytes
    const record = concat(
      stringToBytes('did:fourotwo:abc'),
      operatorKey,
      stringToBytes('bot'),
      stringToBytes('01ab'),
      u64le(1700000000n),
      u8(1), // is_active
      u8(1), // kyc_verified
    );
    const agent = parseAgentRecord(record);
    expect(agent.did).toBe('did:fourotwo:abc');
    expect(agent.agentName).toBe('bot');
    expect(agent.isActive).toBe(true);
    expect(agent.kycVerified).toBe(true);
  });
});

// --- tiny byte builders for the tests ---
function u8(n: number): Uint8Array {
  return new Uint8Array([n]);
}
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
