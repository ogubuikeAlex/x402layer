import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { runVerify } from '../core/verify.js';

const VerifyBody = z.object({
  payment_signature: z.string(),
  payment_required: z.string(),
  agent_did: z.string(),
});

export function registerVerifyRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post('/verify', async (request, reply) => {
    const parsed = VerifyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        valid: false,
        reason: 'MALFORMED_PAYLOAD',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const outcome = await runVerify(ctx, parsed.data);
    return reply.status(outcome.status).send(outcome.body);
  });
}
