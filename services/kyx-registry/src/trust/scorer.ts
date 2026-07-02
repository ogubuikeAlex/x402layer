import { tierForScore } from '@fourotwo/types';

import type { AgentRecord, KyxStore, TrustRecord } from '../store.js';
import { syncTrustScore } from '../chain/casper-sync.js';
import type { KyxConfig } from '../config.js';

export interface DimensionResult {
  key: 'completionRate' | 'operatorVerified' | 'volumeTier';
  score: number;
  weight: number;
}

export interface TrustDimensionCalculator {
  calculate(agent: AgentRecord, store: KyxStore): DimensionResult;
}

export class CompletionRateCalculator implements TrustDimensionCalculator {
  calculate(agent: AgentRecord, store: KyxStore): DimensionResult {
    const settlements = store.listSettlements(agent.did);
    if (settlements.length === 0) return { key: 'completionRate', score: 100, weight: 0.5 };
    const successful = settlements.filter((s) => s.status === 'confirmed' || s.status === 'pending').length;
    return { key: 'completionRate', score: (successful / settlements.length) * 100, weight: 0.5 };
  }
}

export class OperatorVerifiedCalculator implements TrustDimensionCalculator {
  calculate(agent: AgentRecord, store: KyxStore): DimensionResult {
    const operator = store.getOperator(agent.operatorEmail);
    return { key: 'operatorVerified', score: operator?.verified ? 100 : 0, weight: 0.3 };
  }
}

export class VolumeTierCalculator implements TrustDimensionCalculator {
  calculate(agent: AgentRecord, store: KyxStore): DimensionResult {
    const count = store.listSettlements(agent.did).length;
    const score = count >= 25 ? 100 : count >= 10 ? 75 : count >= 3 ? 50 : count >= 1 ? 25 : 0;
    return { key: 'volumeTier', score, weight: 0.2 };
  }
}

export async function computeAndPersistTrustScore(
  did: string,
  store: KyxStore,
  config: KyxConfig,
): Promise<TrustRecord> {
  const agent = store.getAgent(did);
  if (!agent) throw new Error(`Unknown DID ${did}`);
  const calculators: TrustDimensionCalculator[] = [
    new CompletionRateCalculator(),
    new OperatorVerifiedCalculator(),
    new VolumeTierCalculator(),
  ];
  const dimensions = calculators.map((c) => c.calculate(agent, store));
  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));
  const settlements = store.listSettlements(did);
  const totalVolumeUsd = settlements.reduce((sum, s) => sum + Number(s.amount) / 1_000_000, 0);
  const trust: TrustRecord = {
    did,
    score,
    tier: tierForScore(score),
    completionRate: dimensions.find((d) => d.key === 'completionRate')?.score ?? 0,
    operatorVerified: (dimensions.find((d) => d.key === 'operatorVerified')?.score ?? 0) === 100,
    volumeTierScore: dimensions.find((d) => d.key === 'volumeTier')?.score ?? 0,
    transactionCount: settlements.length,
    totalVolumeUsd,
    flags: config.kyxRegistryContractHash ? [] : ['on_chain_sync_unconfigured'],
    lastUpdated: new Date().toISOString(),
  };
  await store.putTrust(trust);
  void syncTrustScore(trust, config).catch(() => undefined);
  return trust;
}
