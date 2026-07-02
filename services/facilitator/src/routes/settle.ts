import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { runSettle } from '../core/settle.js';

const SettleBody = z.object({
  verification_id: z.string(),
  settlement_mode: z.enum(['auto', 'direct', 'batch', 'channel', 'l2']).optional(),
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
    return reply.status(outcome.status).send(outcome.body);
  });
}
