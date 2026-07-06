import type { ChainNetwork } from '@fourotwo/types';

import type { KyxConfig } from '../config.js';
import type { TrustRecord } from '../store.js';
import { CasperRegistryRecorder } from './casper-registry-recorder.js';

export type OnChainStatus = 'recorded' | 'unconfigured' | 'failed';

/**
 * Build the live registry recorder when both the deployed contract hash and a
 * service key are configured; otherwise return null so callers fall back to the
 * log-only path. The on-chain KyxRegistry is a Casper contract, so only Casper
 * agents are synced.
 */
function buildRecorder(config: KyxConfig): CasperRegistryRecorder | null {
  const key = config.casper.secretKey ?? config.casper.secretKeyPath;
  if (!config.kyxRegistryContractHash || !key) return null;
  return new CasperRegistryRecorder({
    registryPackageHash: config.kyxRegistryContractHash,
    secretKey: config.casper.secretKey,
    secretKeyPath: config.casper.secretKeyPath,
    keyAlgorithm: config.casper.keyAlgorithm,
    nodeRpcs: config.casper.nodeRpcs,
    chainName: config.casper.chainName,
    paymentMotes: config.casper.paymentMotes,
    log: (msg, meta) => console.info(`[kyx-chain] ${msg}`, meta ?? ''),
  });
}

export async function syncAgentRegistration(args: {
  did: string;
  publicKey: string;
  walletAddress: string;
  agentName: string;
  network: ChainNetwork;
  operatorEmail: string;
  config: KyxConfig;
}): Promise<OnChainStatus> {
  if (!args.config.kyxRegistryContractHash) return 'unconfigured';
  // The KyxRegistry lives on Casper; non-Casper agents stay off-chain.
  if (args.network !== 'casper') return 'unconfigured';
  const recorder = buildRecorder(args.config);
  if (!recorder) return 'unconfigured';

  const result = await recorder.registerAgent({
    did: args.did,
    operatorAccountHash: args.walletAddress,
    agentName: args.agentName,
    publicKey: args.publicKey,
  });
  return result.recorded ? 'recorded' : 'failed';
}

export async function syncTrustScore(trust: TrustRecord, config: KyxConfig): Promise<void> {
  const recorder = buildRecorder(config);
  if (!recorder) return;
  await recorder.updateTrustScore({
    did: trust.did,
    score: trust.score,
    tier: trust.tier,
    completionRate: trust.completionRate,
    transactionCount: trust.transactionCount,
    // The off-chain scorer does not track disputes; report 0 until it does.
    totalDisputes: 0,
  });
}
