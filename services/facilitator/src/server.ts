import Fastify, { type FastifyInstance } from 'fastify';

import type { AppContext } from './context.js';
import { metrics, registerMetrics } from './metrics.js';
import { registerBatchRoutes } from './routes/batch.js';
import { registerFeeRoutes } from './routes/fees.js';
import { registerHealthRoute } from './routes/health.js';
import { registerVerifyRoute } from './routes/verify.js';
import { registerSettleRoute } from './routes/settle.js';
import { registerSupportedRoute } from './routes/supported.js';

export function buildServer(ctx: AppContext): FastifyInstance {
  const app = Fastify({
    logger: { level: ctx.config.logLevel },
  });

  registerMetrics(app, metrics);
  registerHealthRoute(app);
  registerSupportedRoute(app, ctx);
  registerVerifyRoute(app, ctx);
  registerSettleRoute(app, ctx);
  registerBatchRoutes(app, ctx);
  registerFeeRoutes(app, ctx);

  return app;
}
