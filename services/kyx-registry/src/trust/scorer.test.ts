import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { computeAndPersistTrustScore } from './scorer.js';
import { KyxStore } from '../store.js';

describe('trust scorer', () => {
  it('scores a verified new agent without transaction history', async () => {
    const store = new KyxStore(join(tmpdir(), `fourotwo-kyx-test-${Date.now()}.json`));
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
    const trust = await computeAndPersistTrustScore('did:fourotwo:casper:abc', store, {
      port: 0,
      host: '127.0.0.1',
      logLevel: 'silent',
      dataFile: 'unused.json',
      publicUrl: '',
      kyxRegistryContractHash: undefined,
    });
    expect(trust.score).toBe(80);
  });
});
