import { randomBytes } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { KyxConfig } from '../config.js';
import type { Mailer } from '../mailer.js';
import type { KyxStore } from '../store.js';

const VerifyRequest = z.object({ email: z.string().email() });

/** The verify link is opened from an email client, so answer humans with HTML. */
function htmlPage(reply: FastifyReply, status: number, title: string, detail: string): FastifyReply {
  return reply
    .status(status)
    .type('text/html; charset=utf-8')
    .send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0">
  <div style="text-align:center;max-width:420px;padding:24px">
    <h1 style="margin:0 0 8px">${title}</h1>
    <p style="color:#666;line-height:1.5">${detail}</p>
  </div>
</body></html>`);
}

export function registerOperatorRoutes(
  app: FastifyInstance,
  store: KyxStore,
  config: KyxConfig,
  mailer: Mailer | null,
): void {
  app.post('/operators/verify-request', async (request, reply) => {
    const parsed = VerifyRequest.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'MALFORMED_REQUEST' });
    const email = parsed.data.email;
    const existing = await store.getOperator(email);
    if (existing?.verified) {
      return { ok: true, already_verified: true };
    }
    const token = randomBytes(24).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await store.upsertOperator({ email, verified: false, token, tokenExpiresAt });
    const verificationUrl = `${config.publicUrl}/operators/verify/${token}`;

    const devFlow = !mailer || config.devTokenEmails.includes(email.toLowerCase());
    if (devFlow) {
      app.log.info({ email, verificationUrl }, 'operator verification magic link');
      return { ok: true, verification_url: verificationUrl, dev_token: token };
    }

    try {
      await mailer.sendMagicLink(email, verificationUrl);
    } catch (err) {
      app.log.error({ err, email }, 'failed to send verification email');
      return reply.status(502).send({ error: 'EMAIL_SEND_FAILED' });
    }
    app.log.info({ email }, 'operator verification email sent');
    return { ok: true, email_sent: true };
  });

  app.get('/operators/verify/:token', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const wantsHtml = request.headers.accept?.includes('text/html') ?? false;
    const found = await store.getOperatorByToken(token);
    if (!found || !found.tokenExpiresAt || Date.parse(found.tokenExpiresAt) < Date.now()) {
      if (wantsHtml) {
        return htmlPage(
          reply,
          404,
          'Link expired',
          'This verification link is invalid or has expired. Request a new one from the dashboard.',
        );
      }
      return reply.status(404).send({ error: 'TOKEN_NOT_FOUND_OR_EXPIRED' });
    }
    await store.upsertOperator({
      email: found.email,
      verified: true,
      verifiedAt: new Date().toISOString(),
    });
    if (wantsHtml) {
      return htmlPage(
        reply,
        200,
        'Email verified ✓',
        `<strong>${found.email}</strong> is now a verified fourotwo operator. You can close this tab and return to registering your agent.`,
      );
    }
    return { ok: true, email: found.email, verified: true };
  });
}
