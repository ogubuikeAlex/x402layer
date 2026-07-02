import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ChainNetwork } from '@fourotwo/types';

/**
 * Minimal `.env` loader (avoids a dotenv dependency). Only sets keys that aren't
 * already present in the environment.
 */
function loadDotEnv(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface FacilitatorConfig {
  port: number;
  host: string;
  logLevel: string;
  defaultNetwork: ChainNetwork;
  casper: {
    /** Primary Casper node JSON-RPC endpoint (`nodeRpcs[0]`). */
    nodeRpc: string;
    /** All Casper node JSON-RPC endpoints, tried in order until one succeeds. */
    nodeRpcs: string[];
    chainName: string;
    csprCloudApiUrl: string;
    csprCloudApiKey: string | undefined;
    kyxRegistryContractHash: string | undefined;
    settlementVaultContractHash: string | undefined;
    /** Seed URef of the KyxRegistry Odra `state` dictionary; enables on-chain trust reads. */
    kyxRegistryStateUref: string | undefined;
    /** Facilitator service-account key material directly (PEM, or base64-of-PEM). Preferred on PaaS. */
    facilitatorSecretKey: string | undefined;
    /** Facilitator service-account secret key (PEM) file path; fallback to {@link facilitatorSecretKey}. */
    facilitatorSecretKeyPath: string | undefined;
    /** Algorithm of the service key PEM. */
    facilitatorKeyAlgorithm: 'ed25519' | 'secp256k1';
    /** Gas payment in motes for a record_settlement call. */
    settlementPaymentMotes: number;
  };
  base: {
    rpcUrl: string;
    usdcAddress: string;
  };
  facilitatorReceiptSigningKey: string | undefined;
  kyxRegistryUrl: string | undefined;
}

/** Split a comma-separated env list into trimmed, non-empty entries. */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(): FacilitatorConfig {
  loadDotEnv();
  const nodeRpcs = [
    ...parseList(process.env.CASPER_NODE_RPC),
    ...parseList(process.env.CASPER_NODE_RPC_FALLBACKS),
  ];
  const resolvedNodeRpcs =
    nodeRpcs.length > 0 ? nodeRpcs : ['https://rpc.testnet.casperlabs.io/rpc'];
  const primaryNodeRpc = resolvedNodeRpcs[0] ?? 'https://rpc.testnet.casperlabs.io/rpc';
  return {
    port: Number(process.env.PORT ?? 4001),
    host: process.env.HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    defaultNetwork: (process.env.DEFAULT_NETWORK as ChainNetwork) ?? 'casper',
    casper: {
      nodeRpc: primaryNodeRpc,
      nodeRpcs: resolvedNodeRpcs,
      chainName: process.env.CASPER_CHAIN_NAME ?? 'casper-test',
      csprCloudApiUrl: process.env.CSPR_CLOUD_API_URL ?? 'https://api.testnet.cspr.cloud',
      csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY || undefined,
      kyxRegistryContractHash: process.env.KYX_REGISTRY_CONTRACT_HASH || undefined,
      settlementVaultContractHash: process.env.SETTLEMENT_VAULT_CONTRACT_HASH || undefined,
      kyxRegistryStateUref: process.env.KYX_REGISTRY_STATE_UREF || undefined,
      facilitatorSecretKey: process.env.FACILITATOR_SECRET_KEY || undefined,
      facilitatorSecretKeyPath: process.env.FACILITATOR_SECRET_KEY_PATH || undefined,
      facilitatorKeyAlgorithm:
        process.env.FACILITATOR_KEY_ALGORITHM === 'secp256k1' ? 'secp256k1' : 'ed25519',
      settlementPaymentMotes: Number(process.env.CASPER_SETTLEMENT_PAYMENT_MOTES ?? 10_000_000_000),
    },
    base: {
      rpcUrl: process.env.BASE_RPC_URL ?? 'https://sepolia.base.org',
      usdcAddress:
        process.env.BASE_USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    facilitatorReceiptSigningKey: process.env.FACILITATOR_RECEIPT_SIGNING_KEY || undefined,
    kyxRegistryUrl: process.env.KYX_REGISTRY_URL || undefined,
  };
}
