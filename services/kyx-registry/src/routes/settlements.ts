import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { KyxConfig } from '../config.js';
import type { KyxStore } from '../store.js';
import { computeAndPersistTrustScore } from '../trust/scorer.js';

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
  app.get('/settlements', async (request) => {
    const did = (request.query as { did?: string }).did;
    return { settlements: store.listSettlements(did) };
  });

  app.post('/settlements', async (request, reply) => {
    const parsed = SettlementEvent.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'MALFORMED_REQUEST',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    if (!store.getAgent(parsed.data.did)) return reply.status(404).send({ error: 'AGENT_NOT_FOUND' });
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
    const trust = await computeAndPersistTrustScore(parsed.data.did, store, config);
    return { ok: true, trust };
  });
}
