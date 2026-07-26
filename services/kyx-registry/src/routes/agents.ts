import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { deriveAddress, deriveDid } from '@fourotwo/types';

import type { KyxConfig } from '../config.js';
import { metrics } from '../metrics.js';
import { isDuplicateKeyError, type AgentRecord, type KyxStore } from '../store.js';
import { syncAgentRegistration } from '../chain/casper-sync.js';
import { computeAndPersistTrustScore } from '../trust/scorer.js';

const RegisterAgent = z.object({
  agent_name: z.string().min(1),
  operator_email: z.string().email(),
  public_key: z.string().min(32),
  network: z.enum(['casper', 'base']),
});

const ListQuery = z.object({
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

async function toPublicAgent(agent: AgentRecord, store: KyxStore) {
  const operator = await store.getOperator(agent.operatorEmail);
  const { operatorEmail: _hidden, ...rest } = agent;
  return { ...rest, operatorUsername: operator?.username ?? 'anonymous' };
}

export function registerAgentRoutes(app: FastifyInstance, store: KyxStore, config: KyxConfig): void {
  app.get('/agents', async (request, reply) => {
    const parsed = ListQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'MALFORMED_REQUEST' });
    const { q, page, limit } = parsed.data;
    const { agents, total } = await store.searchAgents({ q, offset: (page - 1) * limit, limit });
    return {
      agents: await Promise.all(
        agents.map(async (agent) => ({
          ...(await toPublicAgent(agent, store)),
          trust: await store.getTrust(agent.did),
          settlements: (await store.listSettlements(agent.did)).slice(0, 5),
        })),
      ),
      total,
      page,
      limit,
    };
  });

  app.get('/agents/:did', async (request, reply) => {
    const did = decodeURIComponent((request.params as { did: string }).did);
    const agent = await store.getAgent(did);
    if (!agent) return reply.status(404).send({ error: 'AGENT_NOT_FOUND' });
    return {
      agent: await toPublicAgent(agent, store),
      trust: await store.getTrust(did),
      settlements: await store.listSettlements(did),
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
    const operator = await store.getOperator(parsed.data.operator_email);
    if (!operator?.verified) {
      return reply.status(403).send({ error: 'OPERATOR_NOT_VERIFIED' });
    }
    if (await store.getAgentByName(parsed.data.agent_name)) {
      return reply.status(409).send({ error: 'AGENT_NAME_ALREADY_REGISTERED' });
    }
    if (await store.getAgentByPublicKey(parsed.data.public_key)) {
      return reply.status(409).send({ error: 'PUBLIC_KEY_ALREADY_REGISTERED' });
    }

    const did = deriveDid(parsed.data.network, parsed.data.public_key);
    const walletAddress = deriveAddress(parsed.data.network, parsed.data.public_key);
    if (await store.getAgent(did)) return reply.status(409).send({ error: 'DID_ALREADY_REGISTERED' });

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
    try {
      await store.addAgent(agent);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return reply.status(409).send({ error: 'AGENT_ALREADY_REGISTERED' });
      }
      throw err;
    }
    metrics.inc('agents_registered_total', { network: parsed.data.network, onchain: onChainStatus });
    const trust = await computeAndPersistTrustScore(did, store, config);
    return reply.status(201).send({ agent, trust });
  });
}
