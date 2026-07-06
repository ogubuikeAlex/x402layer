import type { AgentTrustSummary, TrustTier } from '@fourotwo/types';

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
    return this.opts.fetchImpl ?? fetch;
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
    } catch {
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
    } catch {
      // "dictionary item not found" surfaces as an RPC error → treat as absent.
      return null;
    }
  }
}
