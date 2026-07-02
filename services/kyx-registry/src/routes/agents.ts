import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { deriveAddress, deriveDid } from '@fourotwo/types';

import type { KyxConfig } from '../config.js';
import type { KyxStore } from '../store.js';
import { syncAgentRegistration } from '../chain/casper-sync.js';
import { computeAndPersistTrustScore } from '../trust/scorer.js';

const RegisterAgent = z.object({
  agent_name: z.string().min(1),
  operator_email: z.string().email(),
  public_key: z.string().min(32),
  network: z.enum(['casper', 'base']),
});

export function registerAgentRoutes(app: FastifyInstance, store: KyxStore, config: KyxConfig): void {
  app.get('/agents', async () => ({
    agents: store.listAgents().map((agent) => ({
      ...agent,
      trust: store.getTrust(agent.did),
      settlements: store.listSettlements(agent.did).slice(0, 5),
    })),
  }));

  app.get('/agents/:did', async (request, reply) => {
    const did = decodeURIComponent((request.params as { did: string }).did);
    const agent = store.getAgent(did);
    if (!agent) return reply.status(404).send({ error: 'AGENT_NOT_FOUND' });
    return {
      agent,
      trust: store.getTrust(did),
      settlements: store.listSettlements(did),
    };
  });

  app.post('/agents/register', async (request, reply) => {
    const parsed = RegisterAgent.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'MALFORMED_REQUEST',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const operator = store.getOperator(parsed.data.operator_email);
    if (!operator?.verified) {
      return reply.status(403).send({ error: 'OPERATOR_NOT_VERIFIED' });
    }
    if (store.getAgentByPublicKey(parsed.data.public_key)) {
      return reply.status(409).send({ error: 'PUBLIC_KEY_ALREADY_REGISTERED' });
    }

    const did = deriveDid(parsed.data.network, parsed.data.public_key);
    const walletAddress = deriveAddress(parsed.data.network, parsed.data.public_key);
    if (store.getAgent(did)) return reply.status(409).send({ error: 'DID_ALREADY_REGISTERED' });

    const onChainStatus = await syncAgentRegistration({
      did,
      publicKey: parsed.data.public_key,
      walletAddress,
      agentName: parsed.data.agent_name,
      network: parsed.data.network,
      operatorEmail: parsed.data.operator_email,
      config,
    });
    const agent = {
      did,
      agentName: parsed.data.agent_name,
      operatorEmail: parsed.data.operator_email,
      publicKey: parsed.data.public_key,
      walletAddress,
      network: parsed.data.network,
      registeredAt: new Date().toISOString(),
      onChainStatus,
    };
    await store.addAgent(agent);
    const trust = await computeAndPersistTrustScore(did, store, config);
    return reply.status(201).send({ agent, trust });
  });
}
