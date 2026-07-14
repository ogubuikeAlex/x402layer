import type { FastifyInstance } from 'fastify';
import type { AgentTrustSummary, TrustScore } from '@fourotwo/types';

import type { KyxConfig } from '../config.js';
import type { KyxStore, TrustRecord } from '../store.js';
import { computeAndPersistTrustScore } from '../trust/scorer.js';

function toTrustScore(record: TrustRecord): TrustScore {
  return {
    did: record.did,
    score: record.score,
    tier: record.tier,
    dimensions: {
      completionRate: record.completionRate / 100,
      behavioralConsistency: 1,
      operatorVerified: record.operatorVerified,
      volumeTier:
        record.volumeTierScore >= 100
          ? 'HIGH'
          : record.volumeTierScore >= 75
            ? 'MEDIUM'
            : record.volumeTierScore >= 50
              ? 'LOW'
              : 'MICRO',
      disputeRate: 0,
    },
    history: {
      totalTransactions: record.transactionCount,
      totalVolumeUsd: record.totalVolumeUsd,
      oldestTransaction: null,
      activeSinceDays: 0,
    },
    flags: record.flags,
    lastUpdated: record.lastUpdated,
  };
}

function toSummary(record: TrustRecord): AgentTrustSummary {
  return {
    did: record.did,
    trust_score: record.score,
    trust_tier: record.tier,
    operator_kyc: record.operatorVerified,
    transaction_count: record.transactionCount,
    completion_rate: record.completionRate / 100,
    flags: record.flags,
  };
}

export function registerTrustRoutes(app: FastifyInstance, store: KyxStore, config: KyxConfig): void {
  app.get('/trust/:did', async (request, reply) => {
    const did = decodeURIComponent((request.params as { did: string }).did);
    const agent = await store.getAgent(did);
    if (!agent) return reply.status(404).send({ error: 'AGENT_NOT_FOUND' });
    const trust = (await store.getTrust(did)) ?? (await computeAndPersistTrustScore(did, store, config));
    return toTrustScore(trust);
  });

  app.get('/trust/:did/summary', async (request, reply) => {
    const did = decodeURIComponent((request.params as { did: string }).did);
    const agent = await store.getAgent(did);
    if (!agent) return reply.status(404).send({ error: 'AGENT_NOT_FOUND' });
    const trust = (await store.getTrust(did)) ?? (await computeAndPersistTrustScore(did, store, config));
    return toSummary(trust);
  });
}
