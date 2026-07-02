import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import {
  base64Encode,
  canonicalPaymentBytes,
  decodeEnvelope,
  encodeEnvelope,
  type PaymentRequired,
} from '@fourotwo/types';

import { PaymentExpiredError, PaymentRequiredHeaderError, PaymentSigningError } from './errors.js';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export interface SignedPayment {
  paymentRequired: PaymentRequired;
  paymentRequiredEncoded: string;
  paymentSignature: string;
}

export function readPaymentRequiredHeader(headers: Headers): PaymentRequired {
  const value =
    headers.get('PAYMENT-REQUIRED') ??
    headers.get('payment-required') ??
    headers.get('payment_required');
  if (!value) throw new PaymentRequiredHeaderError('Missing PAYMENT-REQUIRED header on 402 response');
  try {
    return decodeEnvelope(value);
  } catch (err) {
    throw new PaymentRequiredHeaderError(`Invalid PAYMENT-REQUIRED header: ${(err as Error).message}`);
  }
}

export function signPayment(args: {
  paymentRequired: PaymentRequired;
  privateKeyHex: string;
  payerPublicKeyHex: string;
}): SignedPayment {
  const nowSec = Math.floor(Date.now() / 1000);
  if (args.paymentRequired.expiry < nowSec) throw new PaymentExpiredError(args.paymentRequired.expiry);

  try {
    const signature = bytesToHex(
      ed25519.sign(
        canonicalPaymentBytes(args.paymentRequired),
        hexToBytes(args.privateKeyHex.replace(/^0x/, '')),
      ),
    );
    const envelope = JSON.stringify({ payer: args.payerPublicKeyHex, signature });
    return {
      paymentRequired: args.paymentRequired,
      paymentRequiredEncoded: encodeEnvelope(args.paymentRequired),
      paymentSignature: base64Encode(new TextEncoder().encode(envelope)),
    };
  } catch (err) {
    throw new PaymentSigningError(`Could not sign payment: ${(err as Error).message}`);
  }
}
