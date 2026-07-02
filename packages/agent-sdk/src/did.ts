import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import { deriveDid, type ChainNetwork } from '@fourotwo/types';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export interface AgentKeypair {
  network: Extract<ChainNetwork, 'casper'>;
  privateKeyHex: string;
  publicKeyHex: string;
  taggedPublicKeyHex: string;
  did: string;
}

export function generateCasperKeypair(): AgentKeypair {
  const secret = randomBytes(32);
  return keypairFromPrivateKey(secret);
}

export function keypairFromPrivateKey(privateKey: Uint8Array | string): AgentKeypair {
  const secret = typeof privateKey === 'string' ? hexToBytes(privateKey.replace(/^0x/, '')) : privateKey;
  const publicKeyHex = bytesToHex(ed25519.getPublicKey(secret));
  const taggedPublicKeyHex = `01${publicKeyHex}`;
  return {
    network: 'casper',
    privateKeyHex: bytesToHex(secret),
    publicKeyHex,
    taggedPublicKeyHex,
    did: deriveDid('casper', taggedPublicKeyHex),
  };
}

export function deriveAgentDid(network: ChainNetwork, publicKeyHex: string): string {
  return deriveDid(network, publicKeyHex);
}
