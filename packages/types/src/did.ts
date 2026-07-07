/**
 * DID derivation + parsing for fourotwo.
 *
 * DID format: `did:fourotwo:{network}:{address}`.
 *
 * This logic is shared (via `@fourotwo/types`) so the SDK and the KYX registry
 * registration endpoint derive byte-identical DIDs.
 */

import { blake2b } from '@noble/hashes/blake2b';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import type { ChainNetwork } from './types.js';

export const DID_METHOD = 'fourotwo';

/** Casper key algorithm tags as they appear prefixed on a public key hex string. */
const CASPER_ALGO_TAG: Record<string, 'ed25519' | 'secp256k1'> = {
  '01': 'ed25519',
  '02': 'secp256k1',
};

function normalizeHex(input: string): string {
  return input.startsWith('0x') || input.startsWith('0X') ? input.slice(2) : input;
}

/**
 * Compute a Casper account hash from a (tagged or untagged) public key hex.
 *
 * Account hash = blake2b256( utf8(algo) || 0x00 || rawPublicKeyBytes ).
 * If the key hex carries a leading algorithm tag (`01` ed25519 / `02` secp256k1)
 * it is used to pick the algorithm; otherwise ed25519 is assumed.
 *
 * @returns lowercase hex (no `account-hash-` prefix).
 */
export function casperAccountHash(publicKeyHex: string): string {
  const hex = normalizeHex(publicKeyHex).toLowerCase();
  let algo: 'ed25519' | 'secp256k1' = 'ed25519';
  let rawHex = hex;

  const maybeTag = hex.slice(0, 2);
  if (CASPER_ALGO_TAG[maybeTag] && (hex.length === 66 || hex.length === 68)) {
    algo = CASPER_ALGO_TAG[maybeTag];
    rawHex = hex.slice(2);
  }

  const algoBytes = new TextEncoder().encode(algo);
  const keyBytes = hexToBytes(rawHex);
  const input = new Uint8Array(algoBytes.length + 1 + keyBytes.length);
  input.set(algoBytes, 0);
  input[algoBytes.length] = 0x00;
  input.set(keyBytes, algoBytes.length + 1);

  return bytesToHex(blake2b(input, { dkLen: 32 }));
}

/**
 * Derive an EVM (Base) address from an uncompressed secp256k1 public key
 * (`04` || X || Y, 65 bytes). Returns a lowercase `0x`-prefixed address.
 */
export function baseAddress(publicKeyHex: string): string {
  const hex = normalizeHex(publicKeyHex).toLowerCase();
  const keyBytes = hexToBytes(hex);
  // Strip the 0x04 uncompressed prefix if present.
  const body = keyBytes.length === 65 && keyBytes[0] === 0x04 ? keyBytes.slice(1) : keyBytes;
  const hash = keccak_256(body);
  return '0x' + bytesToHex(hash.slice(-20));
}

/**
 * Derive the on-chain address portion of a DID for a given network from a
 * public key. Casper → account hash; Base → EVM address.
 */
export function deriveAddress(network: ChainNetwork, publicKeyHex: string): string {
  switch (network) {
    case 'casper':
      return casperAccountHash(publicKeyHex);
    case 'base':
      return baseAddress(publicKeyHex);
    default:
      throw new Error(`deriveAddress: unsupported network "${network}"`);
  }
}

/** Build a DID string from an already-derived address. */
export function formatDid(network: ChainNetwork, address: string): string {
  const addr = network === 'base' ? address.toLowerCase() : normalizeHex(address).toLowerCase();
  return `did:${DID_METHOD}:${network}:${addr}`;
}

/** Derive a full DID directly from a public key. */
export function deriveDid(network: ChainNetwork, publicKeyHex: string): string {
  return formatDid(network, deriveAddress(network, publicKeyHex));
}

export interface ParsedDid {
  method: string;
  network: ChainNetwork;
  address: string;
}

const DID_RE = new RegExp(`^did:${DID_METHOD}:(base|casper|solana|stellar|polygon):([0-9a-zA-Zx]+)$`);

/** Parse a DID string. Returns `null` if it is not a well-formed fourotwo DID. */
export function parseDid(did: string): ParsedDid | null {
  const m = DID_RE.exec(did.trim());
  if (!m) return null;
  return { method: DID_METHOD, network: m[1] as ChainNetwork, address: m[2]! };
}

export function isValidDid(did: string): boolean {
  return parseDid(did) !== null;
}
