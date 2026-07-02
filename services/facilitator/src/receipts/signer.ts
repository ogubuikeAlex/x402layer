import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import type { SettlementReceipt } from '@fourotwo/types';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/** Deterministic bytes signed over a receipt (field order fixed). */
function receiptMessage(r: Omit<SettlementReceipt, 'facilitatorSignature'>): Uint8Array {
  const canonical = [
    r.settlementId,
    r.did,
    r.amount,
    r.token,
    r.network,
    r.settlementMode,
    r.txHash ?? '',
    String(r.trustScore),
    r.settledAt,
  ].join('|');
  return new TextEncoder().encode(canonical);
}

/**
 * Signs settlement receipts with the facilitator's ed25519 key (FR-6: every
 * settlement returns a signed receipt). If no key is configured, an ephemeral
 * key is generated (acceptable for local dev only).
 */
export class ReceiptSigner {
  private readonly secret: Uint8Array;
  readonly publicKeyHex: string;

  constructor(secretKeyHex?: string) {
    this.secret = secretKeyHex ? hexToBytes(secretKeyHex.replace(/^0x/, '')) : randomBytes(32);
    this.publicKeyHex = bytesToHex(ed25519.getPublicKey(this.secret));
  }

  sign(receipt: Omit<SettlementReceipt, 'facilitatorSignature'>): string {
    return bytesToHex(ed25519.sign(receiptMessage(receipt), this.secret));
  }

  verify(receipt: SettlementReceipt): boolean {
    const { facilitatorSignature, ...rest } = receipt;
    try {
      return ed25519.verify(hexToBytes(facilitatorSignature), receiptMessage(rest), hexToBytes(this.publicKeyHex));
    } catch {
      return false;
    }
  }
}
