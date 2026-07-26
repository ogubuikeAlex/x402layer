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
  /** When set, money-flow state (verifications, replay, fees, batch) is durable + shared. */
  mongodbUri: string | undefined;
  mongodbDb: string;
  /** Bearer token presented to the KYX registry when reporting settlements. */
  kyxFacilitatorToken: string | undefined;
  /** Bearer token guarding admin/revenue endpoints (/fees, /batch/*). Unset = disabled. */
  adminToken: string | undefined;
  /** Platform fee accrued on every settlement (facilitator or SDK path). */
  fees: {
    /** Basis points of settled volume (10 = 0.10%). 0 disables fee accrual. */
    bps: number;
    /** Platform account the accrued fees are owed to (Casper account hash / public key). */
    recipient: string | undefined;
    /** JSON file the fee ledger persists to. */
    dataFile: string;
    /** Feature flag: actually sweep accrued fees on-chain to the recipient. Off by default. */
    collectionEnabled: boolean;
  };
  
  /**
   * Optional upstream x402 facilitator to delegate settlement to - the CSPR.cloud
   * Casper x402 Facilitator (https://x402-facilitator.cspr.cloud). When set, this
   * facilitator extends it rather than broadcasting its own settlement.
   */
  upstreamFacilitator: {
    url: string | undefined;
    /** CSPR.cloud access token, sent raw in the Authorization header. */
    accessToken: string | undefined;
    /** CAIP-2 network: "casper:casper" (mainnet) or "casper:casper-test" (testnet). */
    network: string;
    /** CEP-18 contract hash of the settlement asset. */
    asset: string | undefined;
    /** EIP-712 domain / token metadata: { name, version, decimals, symbol }. */
    assetMetadata: { name: string; version: string; decimals: string; symbol: string } | undefined;
    /** Resource URL reported as paymentPayload.resource.url. */
    resourceUrl: string | undefined;
  };
  batch: {
    /** Flush window for batched settlements. */
    windowMs: number;
    /** Early-flush threshold: queue length that triggers an immediate flush. */
    maxPending: number;
    /** `auto` mode batches payments at or below this amount (motes). 0 = auto never batches. */
    autoThresholdMotes: bigint;
  };
}

/** Parse a numeric env var, falling back (with a warning) on missing/non-numeric input. */
function num(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    console.warn(`[config] ${name}="${value}" is not a number; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Parse the upstream CEP-18 token metadata (EIP-712 `extra`) from a JSON env var. */
function parseAssetMetadata(
  value: string | undefined,
): { name: string; version: string; decimals: string; symbol: string } | undefined {
  if (!value || value.trim() === '') return undefined;
  try {
    const o = JSON.parse(value) as Record<string, unknown>;
    return {
      name: String(o.name ?? ''),
      version: String(o.version ?? ''),
      decimals: String(o.decimals ?? ''),
      symbol: String(o.symbol ?? ''),
    };
  } catch {
    console.warn('[config] UPSTREAM_FACILITATOR_ASSET_METADATA is not valid JSON; ignoring');
    return undefined;
  }
}

/** Parse a boolean env var ("true"/"1"/"yes" = true). */
function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** Parse a bigint env var, falling back (with a warning) on missing/non-numeric input. */
function bigintEnv(name: string, value: string | undefined, fallback: bigint): bigint {
  if (value === undefined || value.trim() === '') return fallback;
  try {
    return BigInt(value);
  } catch {
    console.warn(`[config] ${name}="${value}" is not an integer; using ${fallback}`);
    return fallback;
  }
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
    port: num('PORT', process.env.PORT, 4001),
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
      settlementPaymentMotes: num(
        'CASPER_SETTLEMENT_PAYMENT_MOTES',
        process.env.CASPER_SETTLEMENT_PAYMENT_MOTES,
        10_000_000_000,
      ),
    },
    base: {
      rpcUrl: process.env.BASE_RPC_URL ?? 'https://sepolia.base.org',
      usdcAddress:
        process.env.BASE_USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    facilitatorReceiptSigningKey: process.env.FACILITATOR_RECEIPT_SIGNING_KEY || undefined,
    kyxRegistryUrl: process.env.KYX_REGISTRY_URL || undefined,
    mongodbUri: process.env.MONGODB_URI || undefined,
    mongodbDb: process.env.MONGODB_DB ?? 'fourotwo-facilitator',
    kyxFacilitatorToken: process.env.KYX_FACILITATOR_TOKEN || undefined,
    adminToken: process.env.FACILITATOR_ADMIN_TOKEN || undefined,
    fees: {
      bps: num('FOUROTWO_FEE_BPS', process.env.FOUROTWO_FEE_BPS, 10),
      recipient: process.env.FOUROTWO_FEE_RECIPIENT || undefined,
      dataFile: process.env.FEES_DATA_FILE ?? resolve(process.cwd(), '.data/fees.json'),
      collectionEnabled: bool(process.env.FEE_COLLECTION_ENABLED, false),
    },
    upstreamFacilitator: {
      url: process.env.UPSTREAM_FACILITATOR_URL || undefined,
      accessToken: process.env.UPSTREAM_FACILITATOR_ACCESS_TOKEN || undefined,
      network: process.env.UPSTREAM_FACILITATOR_NETWORK ?? 'casper:casper-test',
      asset: process.env.UPSTREAM_FACILITATOR_ASSET || undefined,
      assetMetadata: parseAssetMetadata(process.env.UPSTREAM_FACILITATOR_ASSET_METADATA),
      resourceUrl: process.env.UPSTREAM_FACILITATOR_RESOURCE_URL || undefined,
    },
    batch: {
      windowMs: num('BATCH_WINDOW_MS', process.env.BATCH_WINDOW_MS, 60_000),
      maxPending: num('BATCH_MAX_PENDING', process.env.BATCH_MAX_PENDING, 200),
      autoThresholdMotes: bigintEnv('BATCH_AUTO_THRESHOLD_MOTES', process.env.BATCH_AUTO_THRESHOLD_MOTES, 0n),
    },
  };
}
