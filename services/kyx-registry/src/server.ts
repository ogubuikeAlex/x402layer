import Fastify, { type FastifyInstance } from 'fastify';

import type { KyxConfig } from './config.js';
import type { KyxStore } from './store.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerOperatorRoutes } from './routes/operators.js';
import { registerSettlementRoutes } from './routes/settlements.js';
import { registerTrustRoutes } from './routes/trust.js';

/**
 * Minimal CORS support (zero-dep, in keeping with the hand-rolled config loader).
 * The dashboard calls these routes directly from the browser, so without these
 * headers the preflight `OPTIONS` is blocked and `fetch` resolves with no body.
 */
function registerCors(app: FastifyInstance, allowedOrigins: string[]): void {
  const allowAny = allowedOrigins.includes('*');
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && (allowAny || allowedOrigins.includes(origin))) {
      reply.header('Access-Control-Allow-Origin', allowAny ? '*' : origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      reply.header('Access-Control-Max-Age', '86400');
    }
    if (request.method === 'OPTIONS') {
      reply.status(204).send();
    }
  });
}

export function buildServer(config: KyxConfig, store: KyxStore): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });
  registerCors(app, config.corsOrigins);
  app.get('/health', async () => ({ status: 'ok' }));
  registerOperatorRoutes(app, store, config);
  registerAgentRoutes(app, store, config);
  registerTrustRoutes(app, store, config);
  registerSettlementRoutes(app, store, config);
  return app;
}
