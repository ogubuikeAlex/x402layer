import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ChainNetwork, TrustTier } from '@fourotwo/types';

export interface OperatorRecord {
  email: string;
  verified: boolean;
  token?: string;
  tokenExpiresAt?: string;
  verifiedAt?: string;
}

export interface AgentRecord {
  did: string;
  agentName: string;
  operatorEmail: string;
  publicKey: string;
  walletAddress: string;
  network: ChainNetwork;
  registeredAt: string;
  onChainStatus: 'pending' | 'recorded' | 'unconfigured' | 'failed';
}

export interface SettlementRecord {
  settlementId: string;
  did: string;
  amount: string;
  token: string;
  network: ChainNetwork;
  recipient: string;
  status: 'pending' | 'confirmed' | 'failed';
  trustScore: number;
  settledAt: string;
  txHash?: string;
}

export interface TrustRecord {
  did: string;
  score: number;
  tier: TrustTier;
  completionRate: number;
  operatorVerified: boolean;
  volumeTierScore: number;
  transactionCount: number;
  totalVolumeUsd: number;
  flags: string[];
  lastUpdated: string;
}

interface StoreData {
  operators: OperatorRecord[];
  agents: AgentRecord[];
  settlements: SettlementRecord[];
  trust: TrustRecord[];
}

const EMPTY: StoreData = { operators: [], agents: [], settlements: [], trust: [] };

export class KyxStore {
  private data: StoreData = EMPTY;

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8')) as StoreData;
    } catch {
      this.data = { operators: [], agents: [], settlements: [], trust: [] };
      await this.save();
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }

  listAgents(): AgentRecord[] {
    return [...this.data.agents].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  }

  getAgent(did: string): AgentRecord | undefined {
    return this.data.agents.find((a) => a.did === did);
  }

  getAgentByPublicKey(publicKey: string): AgentRecord | undefined {
    return this.data.agents.find((a) => a.publicKey.toLowerCase() === publicKey.toLowerCase());
  }

  getOperator(email: string): OperatorRecord | undefined {
    return this.data.operators.find((o) => o.email.toLowerCase() === email.toLowerCase());
  }

  getOperatorByToken(token: string): OperatorRecord | undefined {
    return this.data.operators.find((o) => o.token === token);
  }

  async upsertOperator(operator: OperatorRecord): Promise<void> {
    const idx = this.data.operators.findIndex((o) => o.email.toLowerCase() === operator.email.toLowerCase());
    if (idx >= 0) this.data.operators[idx] = operator;
    else this.data.operators.push(operator);
    await this.save();
  }

  async addAgent(agent: AgentRecord): Promise<void> {
    this.data.agents.push(agent);
    await this.save();
  }

  listSettlements(did?: string): SettlementRecord[] {
    return this.data.settlements
      .filter((s) => !did || s.did === did)
      .sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  }

  async addSettlement(settlement: SettlementRecord): Promise<void> {
    if (!this.data.settlements.some((s) => s.settlementId === settlement.settlementId)) {
      this.data.settlements.push(settlement);
      await this.save();
    }
  }

  getTrust(did: string): TrustRecord | undefined {
    return this.data.trust.find((t) => t.did === did);
  }

  async putTrust(trust: TrustRecord): Promise<void> {
    const idx = this.data.trust.findIndex((t) => t.did === trust.did);
    if (idx >= 0) this.data.trust[idx] = trust;
    else this.data.trust.push(trust);
    await this.save();
  }
}
