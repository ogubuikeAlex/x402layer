import type { FastifyInstance } from 'fastify';
import type { SupportedResponse } from '@fourotwo/types';

import type { AppContext } from '../context.js';

export function registerSupportedRoute(app: FastifyInstance, ctx: AppContext): void {
  app.get('/supported', async () => {
    const networks = ctx.adapters.supported();
    const body: SupportedResponse = {
      facilitator: 'fourotwo',
      version: 'layer402-v2',
      networks: networks.map((network) =>
        network === 'casper'
          ? { network, tokens: ['CSPR', 'USDC'] }
          : network === 'base'
            ? { network, tokens: ['USDC', 'EURC'] }
            : { network, tokens: [] },
      ),
      features: ['kyx_scoring', 'direct_settlement'],
      minimum_trust_score_enforcement: true,
    };
    return body;
  });
}
