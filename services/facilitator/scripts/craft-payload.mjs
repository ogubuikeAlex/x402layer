#!/usr/bin/env node
// Craft a valid /verify request body for a hand-crafted Casper payment.
// (Supports the Milestone 1 exit criteria: curl a hand-crafted payload.)
//
// Usage:
//   node scripts/craft-payload.mjs > /tmp/verify.json
//   curl -s localhost:4001/verify -H 'content-type: application/json' -d @/tmp/verify.json
//
// Prints the JSON body to stdout and the derived DID to stderr.

import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import {
  canonicalPaymentBytes,
  base64Encode,
  deriveDid,
  encodeEnvelope,
} from '@fourotwo/types';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

const secret = new Uint8Array(32).fill(7);
const publicKey = ed25519.getPublicKey(secret);
const taggedPub = '01' + bytesToHex(publicKey);
const did = deriveDid('casper', taggedPub);

const envelope = {
  amount: '5000',
  recipient: 'account-hash-merchant',
  network: 'casper',
  token: 'CSPR',
  expiry: Math.floor(Date.now() / 1000) + 600,
  nonce: 'nonce-' + Date.now(),
};

const signature = bytesToHex(ed25519.sign(canonicalPaymentBytes(envelope), secret));
const paymentSignature = base64Encode(
  new TextEncoder().encode(JSON.stringify({ payer: taggedPub, signature })),
);

const body = {
  payment_signature: paymentSignature,
  payment_required: encodeEnvelope(envelope),
  agent_did: did,
};

process.stderr.write(`agent_did: ${did}\n`);
process.stdout.write(JSON.stringify(body, null, 2) + '\n');
