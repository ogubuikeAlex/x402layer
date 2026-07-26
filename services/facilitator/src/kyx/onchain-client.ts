import type { AgentTrustSummary, TrustTier } from '@fourotwo/types';
import { fetchWithTimeout } from '@fourotwo/types';

import type { TrustClient } from './client.js';
import {
  KYX_FIELD,
  odraMappingItemKey,
  unwrapStoredBytes,
  parseTrustScoreRecord,
  parseAgentRecord,
} from '../chains/casper-storage.js';
import { tryEndpoints } from '../chains/rpc-fallback.js';

export interface OnChainTrustOptions {
  nodeRpcs: string[];
  stateUref: string;
  fallback: TrustClient;
  fetchImpl?: typeof fetch;
}

export class OnChainTrustClient implements TrustClient {
  constructor(private readonly opts: OnChainTrustOptions) {}

  private get fetch(): typeof fetch {
    const impl = this.opts.fetchImpl ?? fetch;
    return ((input, init) => fetchWithTimeout(impl, input as string | URL | Request, init ?? {})) as typeof fetch;
  }

  async getTrustSummary(did: string): Promise<AgentTrustSummary | null> {
    try {
      const stateRoot = await this.stateRootHash();
      const agentBytes = await this.readDictItem(
        stateRoot,
        odraMappingItemKey(KYX_FIELD.agents, did),
      );
      // Not registered on-chain - defer entirely to the fallback path.
      if (!agentBytes) return this.opts.fallback.getTrustSummary(did);

      const agent = parseAgentRecord(agentBytes);
      const scoreBytes = await this.readDictItem(
        stateRoot,
        odraMappingItemKey(KYX_FIELD.scores, did),
      );

      if (!scoreBytes) {
        // Registered but never scored: report pending.
        return {
          did,
          trust_score: null,
          trust_tier: null,
          operator_kyc: agent.kycVerified,
          transaction_count: 0,
          completion_rate: 0,
          flags: [],
          trust_pending: true,
        };
      }

      const score = parseTrustScoreRecord(scoreBytes);
      return {
        did,
        trust_score: score.score,
        trust_tier: (score.tier || null) as TrustTier | null,
        operator_kyc: agent.kycVerified,
        transaction_count: Number(score.totalTransactions),
        // Contract stores basis points (0-10000); summary uses a 0-1 fraction.
        completion_rate: score.completionRateBps / 10_000,
        flags: [],
      };
    } catch (err) {
      // On-chain read failed (not a clean "absent"). Log it and defer to the
      // off-chain fallback rather than silently reporting the agent as unknown.
      console.warn(
        `[onchain-trust] read failed for ${did}, falling back to off-chain: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.opts.fallback.getTrustSummary(did);
    }
  }

  private async rpc(method: string, params: unknown): Promise<unknown> {
    // Try each node in turn; only the last endpoint's failure propagates.
    return tryEndpoints(this.opts.nodeRpcs, async (nodeRpc) => {
      const res = await this.fetch(nodeRpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`Casper RPC ${method} HTTP ${res.status}`);
      const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(`Casper RPC ${method}: ${body.error.message}`);
      return body.result;
    });
  }

  private async stateRootHash(): Promise<string> {
    const result = (await this.rpc('chain_get_state_root_hash', {})) as {
      state_root_hash?: string;
    };
    if (!result.state_root_hash) throw new Error('no state_root_hash');
    return result.state_root_hash;
  }

  /** Returns the raw record bytes for a dictionary item, or null if absent. */
  private async readDictItem(
    stateRootHash: string,
    itemKey: string,
  ): Promise<Uint8Array | null> {
    try {
      const result = (await this.rpc('state_get_dictionary_item', {
        state_root_hash: stateRootHash,
        dictionary_identifier: {
          URef: { seed_uref: this.opts.stateUref, dictionary_item_key: itemKey },
        },
      })) as { stored_value?: { CLValue?: { bytes?: string } } };
      const bytesHex = result.stored_value?.CLValue?.bytes;
      if (!bytesHex) return null;
      return unwrapStoredBytes(bytesHex);
    } catch (err) {
      // A genuine "item not found" means the key is absent → null. Any other error
      // (node down, malformed response) must propagate so it isn't silently
      // mistaken for an unregistered/absent agent.
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|valuenotfound|missing/i.test(msg)) return null;
      throw err;
    }
  }
}
