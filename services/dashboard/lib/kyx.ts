import type { TrustScore } from '@fourotwo/types';

export const KYX_REGISTRY_URL = process.env.KYX_REGISTRY_URL ?? 'http://localhost:4002';

// Browser-reachable registry URL. Next.js only inlines `NEXT_PUBLIC_*` at build
// time, so this must NOT chain through the server-only `KYX_REGISTRY_URL` (which
// is `undefined` in the browser and would silently resolve to localhost in prod).
// It comes solely from the public build-time var, with a localhost dev fallback.
export const NEXT_PUBLIC_KYX_REGISTRY_URL =
  process.env.NEXT_PUBLIC_KYX_REGISTRY_URL ?? 'http://localhost:4002';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const KYX_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.KYX_FETCH_TIMEOUT_MS, 3500);

export interface DashboardAgent {
  did: string;
  agentName: string;
  operatorUsername: string;
  publicKey: string;
  walletAddress: string;
  network: string;
  registeredAt: string;
  onChainStatus: string;
}

export interface DashboardSettlement {
  settlementId: string;
  did: string;
  amount: string;
  token: string;
  network: string;
  recipient: string;
  status: string;
  trustScore: number;
  settledAt: string;
  txHash?: string;
}

export interface AgentListItem {
  did: string;
  agentName: string;
  operatorUsername: string;
  walletAddress: string;
  network: string;
  registeredAt: string;
  onChainStatus: string;
  trust?: {
    score: number;
    tier: string;
    completionRate: number;
    operatorVerified: boolean;
    volumeTierScore: number;
    transactionCount: number;
    totalVolume: number;
    flags: string[];
    lastUpdated: string;
  };
  settlements: DashboardSettlement[];
}

export type AgentsFetchStatus = 'ok' | 'unavailable' | 'timeout';

export interface AgentsFetchResult {
  agents: AgentListItem[];
  total: number;
  page: number;
  limit: number;
  status: AgentsFetchStatus;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KYX_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAgentsResult(
  opts: { q?: string; page?: number; limit?: number } = {},
): Promise<AgentsFetchResult> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 10;
  const empty = { agents: [], total: 0, page, limit };
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (opts.q) params.set('q', opts.q);
    const res = await fetchWithTimeout(`${KYX_REGISTRY_URL}/agents?${params}`, { cache: 'no-store' });
    if (!res.ok) return { ...empty, status: 'unavailable' };
    const body = (await res.json()) as { agents: AgentListItem[]; total: number; page: number; limit: number };
    return { ...body, status: 'ok' };
  } catch (error) {
    return { ...empty, status: isAbortError(error) ? 'timeout' : 'unavailable' };
  }
}

export async function getAgents(): Promise<AgentListItem[]> {
  return (await getAgentsResult()).agents;
}

export async function getAgentDetail(did: string): Promise<{
  agent: DashboardAgent;
  trust?: TrustScore;
  settlements: DashboardSettlement[];
} | null> {
  try {
    // Settled (not Promise.all): a slow or failing /trust read must not make a
    // real agent look like a 404. Only the agent fetch decides existence.
    const [agentResult, trustResult] = await Promise.allSettled([
      fetchWithTimeout(`${KYX_REGISTRY_URL}/agents/${encodeURIComponent(did)}`, { cache: 'no-store' }),
      fetchWithTimeout(`${KYX_REGISTRY_URL}/trust/${encodeURIComponent(did)}`, { cache: 'no-store' }),
    ]);
    if (agentResult.status !== 'fulfilled' || !agentResult.value.ok) return null;
    const agentBody = (await agentResult.value.json()) as {
      agent: DashboardAgent;
      settlements: DashboardSettlement[];
    };
    let trust: TrustScore | undefined;
    if (trustResult.status === 'fulfilled' && trustResult.value.ok) {
      try {
        trust = (await trustResult.value.json()) as TrustScore;
      } catch {
        trust = undefined;
      }
    }
    return { ...agentBody, trust };
  } catch {
    return null;
  }
}
