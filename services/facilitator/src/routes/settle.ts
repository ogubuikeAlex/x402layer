import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { runSettle } from '../core/settle.js';
import { metrics } from '../metrics.js';

const SettleBody = z.object({
  verification_id: z.string(),
  settlement_mode: z.enum(['auto', 'direct', 'batch']).optional(),
});

export function registerSettleRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post('/settle', async (request, reply) => {
    const parsed = SettleBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'MALFORMED_REQUEST',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const outcome = await runSettle(ctx, parsed.data);
    const body = outcome.body as { status?: string; mode?: string };
    metrics.inc('settlements_total', {
      status: body.status ?? 'error',
      mode: body.mode ?? 'unknown',
    });
    return reply.status(outcome.status).send(outcome.body);
  });
}
