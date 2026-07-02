import { hexToBytes } from '@noble/hashes/utils';
import { base64Decode } from '@fourotwo/types';

const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;

export function isHex(s: string): boolean {
  return HEX_RE.test(s) && (s.startsWith('0x') ? s.length % 2 === 0 : s.length % 2 === 0);
}

/** Decode a signature that may be hex (optionally `0x`-prefixed) or base64. */
export function decodeSignature(sig: string): Uint8Array {
  if (isHex(sig)) {
    return hexToBytes(sig.startsWith('0x') ? sig.slice(2) : sig);
  }
  return base64Decode(sig);
}
