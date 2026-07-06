import type { AgentTrustSummary, TrustScore } from '@fourotwo/types';
import { tierForScore } from '@fourotwo/types';

export interface TrustClient {
  /**
   * Resolve a trust summary for a DID. Returns `null` if the agent is unknown.
   * The returned summary may carry `trust_pending: true` when scoring isn't live.
   */
  getTrustSummary(did: string): Promise<AgentTrustSummary | null>;
}

export class StubTrustClient implements TrustClient {
  async getTrustSummary(did: string): Promise<AgentTrustSummary> {
    return {
      did,
      trust_score: null,
      trust_tier: null,
      operator_kyc: false,
      transaction_count: 0,
      completion_rate: 0,
      flags: [],
      trust_pending: true,
    };
  }
}

/**
 * Returns `null` on 404 (unknown agent) so /verify can reject with
 * AGENT_NOT_REGISTERED.
 */
export class HttpTrustClient implements TrustClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getTrustSummary(did: string): Promise<AgentTrustSummary | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/trust/${encodeURIComponent(did)}/summary`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KYX registry trust lookup failed: ${res.status}`);
    const body = (await res.json()) as AgentTrustSummary | TrustScore;
    if ('trust_score' in body) return body;
    return {
      did: body.did,
      trust_score: body.score,
      trust_tier: body.tier ?? tierForScore(body.score),
      operator_kyc: body.dimensions.operatorVerified,
      transaction_count: body.history.totalTransactions,
      completion_rate: body.dimensions.completionRate,
      flags: body.flags,
    };
  }
}
