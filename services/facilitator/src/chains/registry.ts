import type { ChainNetwork } from '@fourotwo/types';

import type { FacilitatorConfig } from '../config.js';
import type { ChainAdapter } from './types.js';
import { CasperAdapter, CsprCloudCasperClient } from './casper.js';
import { BaseAdapter, JsonRpcBaseClient } from './base.js';

/**
 * Builds the set of chain adapters from config. The facilitator core resolves an
 * adapter per request by network and never imports chain code directly (AD-2).
 */
export class AdapterRegistry {
  private readonly adapters = new Map<ChainNetwork, ChainAdapter>();

  constructor(adapters: ChainAdapter[]) {
    for (const a of adapters) this.adapters.set(a.network, a);
  }

  get(network: ChainNetwork): ChainAdapter | undefined {
    return this.adapters.get(network);
  }

  supported(): ChainNetwork[] {
    return [...this.adapters.keys()];
  }
}

export function buildAdapterRegistry(config: FacilitatorConfig): AdapterRegistry {
  const casper = new CasperAdapter(
    new CsprCloudCasperClient({
      csprCloudApiUrl: config.casper.csprCloudApiUrl,
      csprCloudApiKey: config.casper.csprCloudApiKey,
      nodeRpc: config.casper.nodeRpc,
      nodeRpcs: config.casper.nodeRpcs,
    }),
  );

  const base = new BaseAdapter(new JsonRpcBaseClient({ rpcUrl: config.base.rpcUrl }), {
    name: 'USD Coin',
    version: '2',
    // Base Sepolia testnet chain id (fallback path).
    chainId: 84532n,
    verifyingContract: config.base.usdcAddress,
  });

  return new AdapterRegistry([casper, base]);
}
