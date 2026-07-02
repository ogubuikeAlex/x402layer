import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { KyxConfig } from '../config.js';
import type { KyxStore } from '../store.js';

const VerifyRequest = z.object({ email: z.string().email() });

export function registerOperatorRoutes(app: FastifyInstance, store: KyxStore, config: KyxConfig): void {
  app.post('/operators/verify-request', async (request, reply) => {
    const parsed = VerifyRequest.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'MALFORMED_REQUEST' });
    const token = randomBytes(24).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await store.upsertOperator({
      email: parsed.data.email,
      verified: false,
      token,
      tokenExpiresAt,
    });
    const verificationUrl = `${config.publicUrl}/operators/verify/${token}`;
    app.log.info({ email: parsed.data.email, verificationUrl }, 'operator verification magic link');
    return { ok: true, verification_url: verificationUrl, dev_token: token };
  });

  app.get('/operators/verify/:token', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const found = store.getOperatorByToken(token);
    if (!found || !found.tokenExpiresAt || Date.parse(found.tokenExpiresAt) < Date.now()) {
      return reply.status(404).send({ error: 'TOKEN_NOT_FOUND_OR_EXPIRED' });
    }
    await store.upsertOperator({
      email: found.email,
      verified: true,
      verifiedAt: new Date().toISOString(),
    });
    return { ok: true, email: found.email, verified: true };
  });
}
