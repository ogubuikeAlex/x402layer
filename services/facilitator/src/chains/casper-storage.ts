/**
 * Off-chain reader helpers for Odra (2.8.x) contract state on Casper.
 *
 * Odra stores ALL of a contract's state in a single Casper dictionary named
 * `"state"`. Each storage slot's dictionary item key is:
 *
 *   item_key = hex( blake2b256( index_bytes ++ mapping_key_bytes ) )
 *
 * where, for a top-level field whose 1-based declaration index `n` is <= 15,
 * `index_bytes = u32_be(n)` (4 bytes), and `mapping_key_bytes` is the Casper
 * `ToBytes` encoding of the Mapping key (empty for a plain `Var`).
 *
 * The stored value is a `CLValue` of type `List(U8)` wrapping the Casper
 * `ToBytes` of the record, i.e. the raw CLValue `bytes` are
 * `u32_le(len) ++ record_bytes`.
 *
 * This is all pure/deterministic so it can be unit-tested without a node.
 * Sources: odra-core `contract_env.rs` (current_key/index_bytes), odra-core
 * `mapping.rs` (env_for_key), odra-casper-wasm-env `host_functions.rs`.
 */
import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex } from '@noble/hashes/utils';

/** 1-based field indices for the deployed `KyxRegistry` module (declaration order). */
export const KYX_FIELD = {
  agents: 1,
  scores: 2,
  pubkeyToDid: 3,
} as const;

/** Casper `ToBytes` for a `u32` in big-endian (Odra's `index_bytes` for fields <= 15). */
function u32BE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

/** Casper `ToBytes` for a `String`: u32 little-endian length prefix + UTF-8 bytes. */
export function stringToBytes(s: string): Uint8Array {
  const utf8 = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + utf8.length);
  new DataView(out.buffer).setUint32(0, utf8.length, true);
  out.set(utf8, 4);
  return out;
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

/**
 * Dictionary item key (64-char lowercase hex) for a `Mapping<String, _>` entry
 * at the given 1-based field index.
 */
export function odraMappingItemKey(fieldIndex: number, key: string): string {
  const preimage = concat(u32BE(fieldIndex), stringToBytes(key));
  return bytesToHex(blake2b(preimage, { dkLen: 32 }));
}

/** Item key for a plain `Var` field (no mapping key). */
export function odraVarItemKey(fieldIndex: number): string {
  return bytesToHex(blake2b(u32BE(fieldIndex), { dkLen: 32 }));
}

/**
 * The stored CLValue is `List(U8)` wrapping the record bytes - the raw CLValue
 * `bytes` are `u32_le(len) ++ record_bytes`. Strip the length prefix.
 */
export function unwrapStoredBytes(clValueBytesHex: string): Uint8Array {
  const all = hexToBytes(clValueBytesHex);
  if (all.length < 4) throw new Error('stored CLValue too short');
  const len = new DataView(all.buffer, all.byteOffset, 4).getUint32(0, true);
  return all.subarray(4, 4 + len);
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Sequential little-endian reader over Casper `ToBytes` output. */
class ByteReader {
  private off = 0;
  constructor(private readonly buf: Uint8Array) {}
  private view() {
    return new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.length);
  }
  u8(): number {
    return this.buf[this.off++]!;
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  u32(): number {
    const v = this.view().getUint32(this.off, true);
    this.off += 4;
    return v;
  }
  u64(): bigint {
    const v = this.view().getBigUint64(this.off, true);
    this.off += 8;
    return v;
  }
  string(): string {
    const len = this.u32();
    const s = new TextDecoder().decode(this.buf.subarray(this.off, this.off + len));
    this.off += len;
    return s;
  }
  /** Skip a Casper `Key`: 1 tag byte + 32-byte payload (Account/Hash/etc.). */
  skipKey(): void {
    this.off += 1 + 32;
  }
}

export interface OnChainTrustScore {
  score: number;
  tier: string;
  completionRateBps: number;
  totalTransactions: bigint;
  totalDisputes: bigint;
  lastUpdated: bigint;
}

/** Parse `TrustScoreRecord` (odra_type) from its raw `ToBytes`. */
export function parseTrustScoreRecord(raw: Uint8Array): OnChainTrustScore {
  const r = new ByteReader(raw);
  return {
    score: r.u8(),
    tier: r.string(),
    completionRateBps: r.u32(),
    totalTransactions: r.u64(),
    totalDisputes: r.u64(),
    lastUpdated: r.u64(),
  };
}

export interface OnChainAgent {
  did: string;
  agentName: string;
  publicKey: string;
  registeredAt: bigint;
  isActive: boolean;
  kycVerified: boolean;
}

/** Parse `AgentRecord` (odra_type) from its raw `ToBytes`. */
export function parseAgentRecord(raw: Uint8Array): OnChainAgent {
  const r = new ByteReader(raw);
  const did = r.string();
  r.skipKey(); // operator: Address (Key)
  const agentName = r.string();
  const publicKey = r.string();
  const registeredAt = r.u64();
  const isActive = r.bool();
  const kycVerified = r.bool();
  return { did, agentName, publicKey, registeredAt, isActive, kycVerified };
}
