/**
 * Inspect a Casper secret_key.pem: print the agent DID, account hash (to fund),
 * public key, and the raw hex seed. Also works as a PEM → hex converter.
 *
 *   node demos/agent-app/keyinfo.mjs /path/to/secret_key.pem
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { deriveAddress } from '../../packages/types/dist/index.js';
import { keypairFromPrivateKey } from '../../packages/agent-sdk/dist/index.js';

const pemPath = process.argv[2];
if (!pemPath) {
  console.error('usage: node demos/agent-app/keyinfo.mjs <path/to/secret_key.pem>');
  process.exit(1);
}

const sdk = createRequire(import.meta.url)('casper-js-sdk');
const pem = readFileSync(pemPath, 'utf8');

let priv;
try {
  priv = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.ED25519);
} catch (err) {
  console.error(`\n✗ Not a usable ed25519 key: ${err.message}`);
  console.error('  fourotwo signs with ed25519 only - create an ed25519 Casper key.\n');
  process.exit(1);
}

const seedHex = Buffer.from(priv.toBytes()).toString('hex');
const kp = keypairFromPrivateKey(seedHex);
const accountHash = deriveAddress('casper', kp.taggedPublicKeyHex);

console.log('');
console.log('  agent DID        ', kp.did);
console.log('  account hash     ', accountHash);
console.log('  public key       ', kp.taggedPublicKeyHex);
console.log('  private key (hex)', seedHex);
console.log('');
console.log('  Fund this account at: https://testnet.cspr.live/tools/faucet');
console.log(`  (look up account-hash-${accountHash} on https://testnet.cspr.live)`);
console.log('');
