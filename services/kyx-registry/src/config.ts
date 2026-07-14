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
  mongodbUri: string | undefined;
  mongodbDb: string;
  publicUrl: string;
  kyxRegistryContractHash: string | undefined;
  corsOrigins: string[];
  mail: {
    host: string;
    port: number;
    user: string | undefined;
    pass: string | undefined;
    from: string;
  };
  devTokenEmails: string[];
  casper: {
    nodeRpcs: string[];
    chainName: string;
    secretKey: string | undefined;
    secretKeyPath: string | undefined;
    keyAlgorithm: 'ed25519' | 'secp256k1';
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
    mongodbUri: process.env.MONGODB_URI || undefined,
    mongodbDb: process.env.MONGODB_DB ?? 'fourotwo-kyx',
    publicUrl: process.env.KYX_PUBLIC_URL ?? 'http://localhost:4002',
    mail: {
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.MAIL_FROM || process.env.SMTP_USER || 'fourotwo KYX <no-reply@fourotwo.dev>',
    },
    devTokenEmails: parseList(process.env.KYX_DEV_TOKEN_EMAILS).map((e) => e.toLowerCase()),
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
