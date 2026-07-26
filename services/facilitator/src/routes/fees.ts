import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../context.js';
import { requireAdmin } from './auth.js';

export function registerFeeRoutes(app: FastifyInstance, ctx: AppContext): void {
  const preHandler = requireAdmin(ctx.config.adminToken);

  app.get('/fees', { preHandler }, async () => ctx.feeLedger.summary());

  app.post('/fees/collect', { preHandler }, async (_request, reply) => {
    if (!ctx.feeCollector) {
      return reply.status(503).send({
        error: 'FEE_COLLECTION_DISABLED',
        detail:
          'Enable with FEE_COLLECTION_ENABLED=true, set FOUROTWO_FEE_RECIPIENT to a Casper public key, ' +
          'and configure a facilitator key (FACILITATOR_SECRET_KEY[_PATH]).',
      });
    }
    const result = await ctx.feeCollector.collect();
    const status =
      result.reason === 'transfer_failed'
        ? 502
        : result.reason === 'no_fee_recipient' || result.reason === 'recipient_not_public_key'
          ? 400
          : 200;
    return reply.status(status).send(result);
  });
}
