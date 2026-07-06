/**
 * Canonical encoding of the `PAYMENT-REQUIRED` envelope.
 *
 * Shared so the SDK (which signs) and the facilitator (which verifies) agree on
 * exactly which bytes are signed. Any change here must be made in lockstep with
 * the SDK or every signature will fail verification.
 */

import type { PaymentRequired } from './types.js';

/** Field order is fixed and part of the signing contract - do not reorder. */
const ENVELOPE_FIELDS: (keyof PaymentRequired)[] = [
  'network',
  'token',
  'amount',
  'recipient',
  'nonce',
  'expiry',
  'facilitator',
  'minTrustScore',
];

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  // eslint-disable-next-line no-undef
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Deterministic message string for a payment envelope. Stable field order,
 * `key=value` joined by `\n`. Undefined optional fields are omitted.
 */
export function canonicalPaymentMessage(pr: PaymentRequired): string {
  const parts: string[] = [];
  for (const field of ENVELOPE_FIELDS) {
    const value = pr[field];
    if (value === undefined || value === null) continue;
    parts.push(`${field}=${value}`);
  }
  return parts.join('\n');
}

/** Bytes that are actually signed/verified. */
export function canonicalPaymentBytes(pr: PaymentRequired): Uint8Array {
  return new TextEncoder().encode(canonicalPaymentMessage(pr));
}

/** Base64-encode an envelope for transport in the `payment_required` field. */
export function encodeEnvelope(pr: PaymentRequired): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(pr)));
}

/** Decode a base64 `payment_required` field back into an envelope. */
export function decodeEnvelope(b64: string): PaymentRequired {
  const json = new TextDecoder().decode(fromBase64(b64));
  return JSON.parse(json) as PaymentRequired;
}

export { toBase64 as base64Encode, fromBase64 as base64Decode };
