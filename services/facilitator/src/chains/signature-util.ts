import { hexToBytes } from '@noble/hashes/utils';
import { base64Decode } from '@fourotwo/types';

const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;

export function isHex(s: string): boolean {
  if (!HEX_RE.test(s)) return false;
  const body = s.startsWith('0x') ? s.slice(2) : s;
  return body.length % 2 === 0;
}

export function decodeSignature(sig: string): Uint8Array {
  if (isHex(sig)) {
    return hexToBytes(sig.startsWith('0x') ? sig.slice(2) : sig);
  }
  return base64Decode(sig);
}
