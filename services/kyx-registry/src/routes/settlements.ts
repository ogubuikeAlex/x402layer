import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { KyxConfig } from '../config.js';
import { metrics } from '../metrics.js';
import type { KyxStore } from '../store.js';
import { computeAndPersistTrustScore } from '../trust/scorer.js';
import { bearerToken, requireBearer } from './auth.js';

const SettlementEvent = z.object({
  settlement_id: z.string(),
  did: z.string(),
  amount: z.string(),
  token: z.string(),
  network: z.enum(['casper', 'base', 'solana', 'stellar', 'polygon']),
  recipient: z.string(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  trust_score: z.number(),
  settled_at: z.string(),
  tx_hash: z.string().optional(),
});

export function registerSettlementRoutes(app: FastifyInstance, store: KyxStore, config: KyxConfig): void {
  app.get('/settlements', async (request, reply) => {
    const did = (request.query as { did?: string }).did;
    if (!did) {
      if (!config.adminToken || bearerToken(request) !== config.adminToken) {
        return reply.status(400).send({ error: 'DID_REQUIRED', detail: 'Provide ?did=... or an admin token' });
      }
    }
    return { settlements: await store.listSettlements(did) };
  });

  app.post('/settlements', { preHandler: requireBearer(config.facilitatorToken) }, async (request, reply) => {
    const parsed = SettlementEvent.safeParse(request.body);
    
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'MALFORMED_REQUEST',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    if (!(await store.getAgent(parsed.data.did))) return reply.status(404).send({ error: 'AGENT_NOT_FOUND' });
    
    await store.addSettlement({
      settlementId: parsed.data.settlement_id,
      did: parsed.data.did,
      amount: parsed.data.amount,
      token: parsed.data.token,
      network: parsed.data.network,
      recipient: parsed.data.recipient,
      status: parsed.data.status,
      trustScore: parsed.data.trust_score,
      settledAt: parsed.data.settled_at,
      txHash: parsed.data.tx_hash,
    });

    metrics.inc('settlements_recorded_total', { network: parsed.data.network, status: parsed.data.status });
    
    const trust = await computeAndPersistTrustScore(parsed.data.did, store, config);
    return { ok: true, trust };
  });
}
