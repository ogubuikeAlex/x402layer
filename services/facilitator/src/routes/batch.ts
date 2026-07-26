import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../context.js';
import { requireAdmin } from './auth.js';

export function registerBatchRoutes(app: FastifyInstance, ctx: AppContext): void {
  const preHandler = requireAdmin(ctx.config.adminToken);

  app.get('/batch/status', { preHandler }, async () => ctx.batchQueue.status());

  app.post('/batch/settle', { preHandler }, async () => {
    const result = await ctx.batchQueue.flush('manual');
    if (!result) return { flushed: 0, detail: 'batch queue empty' };
    return result;
  });
}
