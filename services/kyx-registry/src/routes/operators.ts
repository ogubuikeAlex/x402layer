import { createHash, randomBytes } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { KyxConfig } from '../config.js';
import type { Mailer } from '../mailer.js';
import { metrics } from '../metrics.js';
import type { KyxStore } from '../store.js';

const VerifyRequest = z.object({
  email: z.string().email(),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,23}$/, 'username must be 3-24 chars: letters, digits, - or _')
    .optional(),
});

function defaultUsername(email: string): string {
  return `op-${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}


class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const nowMs = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= nowMs) {
      this.hits.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}

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
  const emailLimiter = new RateLimiter(5, 15 * 60_000);
  const ipLimiter = new RateLimiter(20, 15 * 60_000);

  app.post('/operators/verify-request', async (request, reply) => {
    const parsed = VerifyRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'MALFORMED_REQUEST',
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const email = parsed.data.email;
    if (!emailLimiter.take(email.toLowerCase()) || !ipLimiter.take(request.ip)) {
      return reply.status(429).send({
        error: 'RATE_LIMITED',
        detail: 'Too many verification requests. Try again later.',
      });
    }
    const existing = await store.getOperator(email);
    const username = parsed.data.username ?? existing?.username ?? defaultUsername(email);
    const owner = await store.getOperatorByUsername(username);
    if (owner && owner.email.toLowerCase() !== email.toLowerCase()) {
      return reply.status(409).send({ error: 'USERNAME_TAKEN' });
    }
    if (existing?.verified) {
      if (existing.username !== username) await store.upsertOperator({ ...existing, username });
      return { ok: true, already_verified: true, username };
    }
    const token = randomBytes(24).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await store.upsertOperator({ email, username, verified: false, token, tokenExpiresAt });
    const verificationUrl = `${config.publicUrl}/operators/verify/${token}`;


    if (config.demoOpenVerification || config.devTokenEmails.includes(email.toLowerCase())) {
      app.log.info(
        { email, verificationUrl, mode: config.demoOpenVerification ? 'demo-open' : 'dev-allowlist' },
        'operator verification magic link returned inline',
      );
      return {
        ok: true,
        verification_url: verificationUrl,
        dev_token: token,
        username,
        demo_open_verification: config.demoOpenVerification || undefined,
      };
    }

    if (!mailer) {
      return reply.status(503).send({
        error: 'EMAIL_NOT_CONFIGURED',
        detail: 'Email verification is unavailable: SMTP is not configured.',
      });
    }

    try {
      await mailer.sendMagicLink(email, verificationUrl);
    } catch (err) {
      app.log.error({ err, email }, 'failed to send verification email');
      return reply.status(502).send({ error: 'EMAIL_SEND_FAILED' });
    }
    app.log.info({ email }, 'operator verification email sent');
    metrics.inc('verification_emails_sent_total');
    return { ok: true, email_sent: true, username };
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
      username: found.username,
      verified: true,
      verifiedAt: new Date().toISOString(),
    });
    metrics.inc('operators_verified_total');
    if (wantsHtml) {
      return htmlPage(
        reply,
        200,
        'Email verified ✓',
        `<strong>${escapeHtml(found.email)}</strong> is now a verified fourotwo operator. You can close this tab and return to registering your agent.`,
      );
    }
    return { ok: true, email: found.email, verified: true };
  });
}
