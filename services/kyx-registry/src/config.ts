import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Split a comma/whitespace-separated env list into trimmed, non-empty entries. */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface KyxConfig {
  port: number;
  host: string;
  logLevel: string;
  dataFile: string;
  publicUrl: string;
  kyxRegistryContractHash: string | undefined;
  /** Allowed CORS origins. `['*']` allows any origin (browser dashboard calls). */
  corsOrigins: string[];
  /** On-chain write (register_agent / update_trust_score) broadcaster config. */
  casper: {
    /** Casper node JSON-RPC endpoints, tried in order until one succeeds. */
    nodeRpcs: string[];
    chainName: string;
    /** Service-account key material directly (PEM, or base64-of-PEM). */
    secretKey: string | undefined;
    /** Path to the service-account secret key PEM (fallback to {@link secretKey}). */
    secretKeyPath: string | undefined;
    keyAlgorithm: 'ed25519' | 'secp256k1';
    /** Gas payment in motes for a register/update call (default 10 CSPR). */
    paymentMotes: number;
  };
}

export function loadConfig(): KyxConfig {
  loadDotEnv();
  const nodeRpcs = [
    ...parseList(process.env.CASPER_NODE_RPC),
    ...parseList(process.env.CASPER_NODE_RPC_FALLBACKS),
  ];
  return {
    port: Number(process.env.KYX_PORT ?? 4002),
    host: process.env.KYX_HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    dataFile: process.env.KYX_DATA_FILE ?? resolve(process.cwd(), 'services/kyx-registry/.data/kyx.json'),
    publicUrl: process.env.KYX_PUBLIC_URL ?? 'http://localhost:4002',
    kyxRegistryContractHash: process.env.KYX_REGISTRY_CONTRACT_HASH || undefined,
    corsOrigins:
      parseList(process.env.KYX_CORS_ORIGIN).length > 0
        ? parseList(process.env.KYX_CORS_ORIGIN)
        : ['*'],
    casper: {
      nodeRpcs: nodeRpcs.length > 0 ? nodeRpcs : ['https://rpc.testnet.casperlabs.io/rpc'],
      chainName: process.env.CASPER_CHAIN_NAME ?? 'casper-test',
      secretKey: process.env.KYX_REGISTRY_SECRET_KEY || process.env.FACILITATOR_SECRET_KEY || undefined,
      secretKeyPath:
        process.env.KYX_REGISTRY_SECRET_KEY_PATH || process.env.FACILITATOR_SECRET_KEY_PATH || undefined,
      keyAlgorithm:
        (process.env.KYX_REGISTRY_KEY_ALGORITHM ?? process.env.FACILITATOR_KEY_ALGORITHM) === 'secp256k1'
          ? 'secp256k1'
          : 'ed25519',
      paymentMotes: Number(process.env.KYX_REGISTRY_PAYMENT_MOTES ?? 10_000_000_000),
    },
  };
}
