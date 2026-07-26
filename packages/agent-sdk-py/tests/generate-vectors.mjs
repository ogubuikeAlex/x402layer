import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalPaymentMessage,
  deriveDid,
  encodeEnvelope,
} from '../../types/dist/index.js';
import { keypairFromPrivateKey, signPayment } from '../../agent-sdk/dist/index.js';

// this is fixed so vectors are reproducible.
const SEED = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';

const paymentRequired = {
  network: 'casper',
  token: 'CSPR',
  amount: '5000000000',
  recipient: 'account-hash-13a08fe40b282052cc49edbd067edbc3705696ef6731f1fb0396f164c53519d3',
  nonce: 'nonce-fixed-0001',
  expiry: 4102444800,
  facilitator: 'https://fourotwo-facilitator.onrender.com',
  minTrustScore: 40,
};

const keypair = keypairFromPrivateKey(SEED);
const signed = signPayment({
  paymentRequired,
  privateKeyHex: SEED,
  payerPublicKeyHex: keypair.taggedPublicKeyHex,
});

const vectors = {
  seed: SEED,
  publicKeyHex: keypair.publicKeyHex,
  taggedPublicKeyHex: keypair.taggedPublicKeyHex,
  did: keypair.did,
  didFromTaggedKey: deriveDid('casper', keypair.taggedPublicKeyHex),
  paymentRequired,
  canonicalMessage: canonicalPaymentMessage(paymentRequired),
  encodedEnvelope: encodeEnvelope(paymentRequired),
  paymentSignature: signed.paymentSignature,
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'vectors.json');
writeFileSync(out, JSON.stringify(vectors, null, 2));
console.log(`wrote ${out}`);
