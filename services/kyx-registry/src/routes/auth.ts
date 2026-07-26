import type { FastifyReply, FastifyRequest } from 'fastify';

/** Extract a `Authorization: Bearer <token>` value, if present. */
export function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function requireBearer(expected: string | undefined) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!expected) {
      return reply.status(503).send({ error: 'AUTH_NOT_CONFIGURED' });
    }
    if (bearerToken(request) !== expected) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }
  };
}
