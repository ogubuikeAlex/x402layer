import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { computeAndPersistTrustScore } from './scorer.js';
import { FileKyxStore } from '../store.js';
import type { KyxConfig } from '../config.js';

const testConfig: KyxConfig = {
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  dataFile: 'unused.json',
  mongodbUri: undefined,
  mongodbDb: 'unused',
  publicUrl: '',
  kyxRegistryContractHash: undefined,
  corsOrigins: ['*'],
  mail: { host: 'smtp.gmail.com', port: 465, user: undefined, pass: undefined, from: 'test' },
  devTokenEmails: [],
  casper: {
    nodeRpcs: [],
    chainName: 'casper-test',
    secretKey: undefined,
    secretKeyPath: undefined,
    keyAlgorithm: 'ed25519',
    paymentMotes: 0,
  },
};

describe('trust scorer', () => {
  it('scores a verified new agent without transaction history', async () => {
    const store = new FileKyxStore(join(tmpdir(), `fourotwo-kyx-test-${Date.now()}.json`));
    await store.init();
    await store.upsertOperator({ email: 'a@example.com', verified: true });
    await store.addAgent({
      did: 'did:fourotwo:casper:abc',
      agentName: 'Agent',
      operatorEmail: 'a@example.com',
      publicKey: '01abc',
      walletAddress: 'abc',
      network: 'casper',
      registeredAt: new Date().toISOString(),
      onChainStatus: 'unconfigured',
    });
    const trust = await computeAndPersistTrustScore('did:fourotwo:casper:abc', store, testConfig);
    expect(trust.score).toBe(80);
  });
});
