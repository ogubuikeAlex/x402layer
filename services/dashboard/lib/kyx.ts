import type { TrustScore } from '@fourotwo/types';

export const KYX_REGISTRY_URL = process.env.KYX_REGISTRY_URL ?? 'http://localhost:4002';
export const NEXT_PUBLIC_KYX_REGISTRY_URL =
  process.env.NEXT_PUBLIC_KYX_REGISTRY_URL ?? KYX_REGISTRY_URL;

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

export async function getAgents(): Promise<AgentListItem[]> {
  try {
    const res = await fetch(`${KYX_REGISTRY_URL}/agents`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { agents: AgentListItem[] };
    return body.agents;
  } catch {
    return [];
  }
}

export async function getAgentDetail(did: string): Promise<{
  agent: DashboardAgent;
  trust?: TrustScore;
  settlements: DashboardSettlement[];
} | null> {
  try {
    const [agentRes, trustRes] = await Promise.all([
      fetch(`${KYX_REGISTRY_URL}/agents/${encodeURIComponent(did)}`, { cache: 'no-store' }),
      fetch(`${KYX_REGISTRY_URL}/trust/${encodeURIComponent(did)}`, { cache: 'no-store' }),
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
