import type { TrustScore } from '@fourotwo/types';

export const KYX_REGISTRY_URL = process.env.KYX_REGISTRY_URL ?? 'http://localhost:4002';
export const NEXT_PUBLIC_KYX_REGISTRY_URL =
  process.env.NEXT_PUBLIC_KYX_REGISTRY_URL ?? KYX_REGISTRY_URL;
const KYX_FETCH_TIMEOUT_MS = Number(process.env.KYX_FETCH_TIMEOUT_MS ?? 3500);

export interface DashboardAgent {
  did: string;
  agentName: string;
  operatorEmail: string;
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
  operatorEmail: string;
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
    totalVolumeUsd: number;
    flags: string[];
    lastUpdated: string;
  };
  settlements: DashboardSettlement[];
}

export type AgentsFetchStatus = 'ok' | 'unavailable' | 'timeout';

export interface AgentsFetchResult {
  agents: AgentListItem[];
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

export async function getAgentsResult(): Promise<AgentsFetchResult> {
  try {
    const res = await fetchWithTimeout(`${KYX_REGISTRY_URL}/agents`, { cache: 'no-store' });
    if (!res.ok) return { agents: [], status: 'unavailable' };
    const body = (await res.json()) as { agents: AgentListItem[] };
    return { agents: body.agents, status: 'ok' };
  } catch (error) {
    return { agents: [], status: isAbortError(error) ? 'timeout' : 'unavailable' };
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
    const [agentRes, trustRes] = await Promise.all([
      fetchWithTimeout(`${KYX_REGISTRY_URL}/agents/${encodeURIComponent(did)}`, { cache: 'no-store' }),
      fetchWithTimeout(`${KYX_REGISTRY_URL}/trust/${encodeURIComponent(did)}`, { cache: 'no-store' }),
    ]);
    if (!agentRes.ok) return null;
    const agentBody = (await agentRes.json()) as {
      agent: DashboardAgent;
      settlements: DashboardSettlement[];
    };
    const trust = trustRes.ok ? ((await trustRes.json()) as TrustScore) : undefined;
    return { ...agentBody, trust };
  } catch {
    return null;
  }
}
