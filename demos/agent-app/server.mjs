/**
 * Atlas Agent - a fleshed-out reference *consumer* (agent-sdk user).
 *
 * The browser UI (public/) runs a global fetch interceptor: when a call to a
 * paid API returns 402, it blocks the view and shows a payment breakdown
 * (wallet balance → amount to deduct → balance after). This backend holds the
 * funded demo key, reads the on-chain balance, and does the signing + settlement
 * via @fourotwo/agent-sdk - so the private key never touches the browser.
 *
 * NEW demo - the minimal terminal version lives in demos/rwa-oracle-agent.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeEnvelope, deriveAddress } from '../../packages/types/dist/index.js';
import { keypairFromPrivateKey, generateCasperKeypair, signPayment } from '../../packages/agent-sdk/dist/index.js';
import { broadcastCsprTransfer } from './casper-transfer.mjs';
import { registerWithKyx } from './register.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const parseList = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/** Minimal .env loader (zero-dep, matching the services' style). */
function loadDotEnv(path = resolve(__dirname, '.env')) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
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
loadDotEnv();
const PORT = Number(process.env.PORT ?? process.env.ATLAS_PORT ?? 5200);
const CSPR_CLOUD_API_URL = process.env.CSPR_CLOUD_API_URL ?? 'https://api.testnet.cspr.cloud';
const CSPR_CLOUD_API_KEY = process.env.CSPR_CLOUD_API_KEY || undefined;
// Default merchant the demo UI talks to (the Meridian paid API).
const MERCHANT_URL = process.env.MERCHANT_URL ?? 'http://localhost:5100';
// Casper network used to broadcast the real settlement transfer.
const CASPER_CHAIN_NAME = process.env.CASPER_CHAIN_NAME ?? 'casper-test';
const NODE_RPCS = [
  ...parseList(process.env.CASPER_NODE_RPC),
  ...parseList(process.env.CASPER_NODE_RPC_FALLBACKS),
];
if (NODE_RPCS.length === 0) NODE_RPCS.push('https://rpc.testnet.casperlabs.io/rpc');
const EXPLORER = process.env.CASPER_EXPLORER_URL ?? 'https://testnet.cspr.live';
// KYX registry the agent self-registers with on startup.
const KYX_REGISTRY_URL = process.env.KYX_REGISTRY_URL ?? 'https://x402layer-kyx-registry.onrender.com';
const AGENT_OPERATOR_EMAIL = process.env.AGENT_OPERATOR_EMAIL ?? 'atlas-demo@fourotwo.dev';
const AGENT_NAME = process.env.AGENT_NAME ?? 'Atlas Research Agent';

const isHexSeed = (s) => /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;

/** If `raw` is PEM text, or base64-of-PEM, return the PEM; otherwise null. */
function asPem(raw) {
  if (raw.includes('-----BEGIN')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) return decoded;
  } catch {
    /* not base64 */
  }
  return null;
}

/** Extract the 32-byte ed25519 seed (hex) from a Casper secret_key.pem. */
function seedHexFromPem(pem, source) {
  if (pem.includes('EC PRIVATE KEY') || pem.includes('BEGIN EC')) {
    throw new Error(
      'this is a secp256k1 key - fourotwo signs with ed25519 only. Create/fund an ' +
      'ed25519 Casper key (e.g. `casper-client keygen -a ed25519`).',
    );
  }
  const sdk = createRequire(import.meta.url)('casper-js-sdk');
  const priv = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.ED25519);
  return { hex: Buffer.from(priv.toBytes()).toString('hex'), source };
}

/**
 * Resolve the agent's 32-byte ed25519 seed (hex) from whatever the operator has:
 *  - AGENT_SECRET_KEY_PATH  - path to a Casper `secret_key.pem` (what the wallet exports)
 *  - AGENT_SECRET_KEY_PEM   - inline PEM text, or base64-of-PEM (for hosting)
 *  - AGENT_PRIVATE_KEY_HEX  - raw hex seed (also tolerates a pasted PEM / base64-of-PEM)
 * Casper PEMs are parsed with casper-js-sdk; the SDK only supports ed25519.
 */
function resolveAgentSeedHex() {
  const pemPath = process.env.AGENT_SECRET_KEY_PATH?.trim();
  if (pemPath) {
    const pem = readFileSync(isAbsolute(pemPath) ? pemPath : resolve(process.cwd(), pemPath), 'utf8');
    return seedHexFromPem(pem, `AGENT_SECRET_KEY_PATH (${pemPath})`);
  }

  const pemInline = process.env.AGENT_SECRET_KEY_PEM?.trim();
  if (pemInline) {
    const pem = asPem(pemInline);
    if (!pem) throw new Error('AGENT_SECRET_KEY_PEM is not PEM text or base64-of-PEM');
    return seedHexFromPem(pem, 'AGENT_SECRET_KEY_PEM');
  }

  const hex = process.env.AGENT_PRIVATE_KEY_HEX?.trim();
  if (hex) {
    if (isHexSeed(hex)) return { hex, source: 'AGENT_PRIVATE_KEY_HEX' };
    // Common mistake: a PEM (or base64-of-PEM) pasted into the hex field.
    const pem = asPem(hex);
    if (pem) return seedHexFromPem(pem, 'AGENT_PRIVATE_KEY_HEX (PEM detected)');
    throw new Error('AGENT_PRIVATE_KEY_HEX is neither hex nor a PEM - expected a 64-char ed25519 seed');
  }

  return null;
}

// The agent wallet. Supply a FUNDED casper-test **ed25519** key (see above).
// Without one, we generate an ephemeral, unfunded key so the flow still runs.
let keypair;
let FUNDED = false;
let KEY_SOURCE = 'ephemeral';
try {
  const seed = resolveAgentSeedHex();
  if (seed) {
    keypair = keypairFromPrivateKey(seed.hex);
    FUNDED = true;
    KEY_SOURCE = seed.source;
  } else {
    keypair = generateCasperKeypair();
  }
} catch (err) {
  console.error(`\n  ✗ could not load agent key: ${err.message}`);
  console.error('    The fourotwo SDK signs with ed25519 - make sure your Casper key is an');
  console.error('    ed25519 key (secp256k1 is not supported). Falling back to an ephemeral key.\n');
  keypair = generateCasperKeypair();
  KEY_SOURCE = 'ephemeral (key load failed)';
}
const ACCOUNT_HASH = deriveAddress('casper', keypair.taggedPublicKeyHex);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

async function balanceFromCsprCloud() {
  const headers = { accept: 'application/json', authorization: CSPR_CLOUD_API_KEY };
  const res = await fetch(`${CSPR_CLOUD_API_URL}/accounts/${ACCOUNT_HASH}`, { headers });
  if (!res.ok) throw new Error(`cspr.cloud ${res.status}`);
  const body = await res.json();
  return body?.data?.balance ?? '0';
}

async function balanceFromRpc(nodeRpc) {
  const res = await fetch(nodeRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query_balance',
      params: { purse_identifier: { main_purse_under_account_hash: `account-hash-${ACCOUNT_HASH}` } },
    }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const body = await res.json();
  const balance = body?.result?.balance;
  if (balance == null) throw new Error(body?.error?.message ?? 'no balance in RPC response');
  return String(balance);
}

async function balanceMotes() {
  // CSPR.cloud needs an API key; without one, read the balance straight off a node.
  const attempts = [
    ...(CSPR_CLOUD_API_KEY ? [balanceFromCsprCloud] : []),
    ...NODE_RPCS.map((rpc) => () => balanceFromRpc(rpc)),
  ];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch {
      /* try the next source */
    }
  }
  return null;
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  try {
    const file = join(__dirname, 'public', rel);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'NOT_FOUND', path: pathname });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const { pathname } = url;

  // ── Wallet: identity + live balance ───────────────────────────────
  if (req.method === 'GET' && pathname === '/api/wallet') {
    const motes = await balanceMotes();
    return json(res, 200, {
      did: keypair.did,
      accountHash: ACCOUNT_HASH,
      publicKeyHex: keypair.taggedPublicKeyHex,
      balanceMotes: motes,
      funded: FUNDED,
      merchantUrl: MERCHANT_URL,
    });
  }

  // ── Preview: decode 402 terms + compute the debit breakdown ───────
  if (req.method === 'POST' && pathname === '/api/pay/preview') {
    const { paymentRequired } = await readBody(req);
    if (!paymentRequired) return json(res, 400, { error: 'MISSING_PAYMENT_REQUIRED' });
    let terms;
    try {
      terms = decodeEnvelope(paymentRequired);
    } catch (err) {
      return json(res, 400, { error: 'BAD_ENVELOPE', detail: String(err) });
    }
    const before = await balanceMotes();
    const deduct = BigInt(terms.amount);
    const after = before === null ? null : (BigInt(before) - deduct).toString();
    return json(res, 200, {
      did: keypair.did,
      recipient: terms.recipient,
      network: terms.network,
      token: terms.token,
      amountMotes: terms.amount,
      expiry: terms.expiry,
      balanceMotes: before,
      afterMotes: after,
      funded: FUNDED,
      sufficient: before === null ? null : BigInt(before) >= deduct,
    });
  }

  // ── Execute: sign + retry the paid request through the merchant ───
  if (req.method === 'POST' && pathname === '/api/pay/execute') {
    const { targetUrl, paymentRequired } = await readBody(req);
    if (!targetUrl || !paymentRequired) return json(res, 400, { error: 'MISSING_FIELDS' });

    let terms;
    try {
      terms = decodeEnvelope(paymentRequired);
    } catch (err) {
      return json(res, 400, { error: 'BAD_ENVELOPE', detail: String(err) });
    }

    const before = await balanceMotes();
    let signed;
    try {
      signed = signPayment({
        paymentRequired: terms,
        privateKeyHex: keypair.privateKeyHex,
        payerPublicKeyHex: keypair.taggedPublicKeyHex,
      });
    } catch (err) {
      return json(res, 502, { error: 'SIGNING_FAILED', detail: String(err) });
    }

    // Real on-chain settlement: the agent signs + broadcasts an actual native
    // CSPR transfer to the merchant. Only the payer can move its own funds, so
    // this happens agent-side (the facilitator still verifies + issues a receipt).
    let transfer;
    if (!FUNDED) {
      transfer = { skipped: true, reason: 'wallet_unfunded' };
    } else {
      try {
        transfer = await broadcastCsprTransfer({
          seedHex: keypair.privateKeyHex,
          recipient: terms.recipient,
          amountMotes: terms.amount,
          chainName: CASPER_CHAIN_NAME,
          nodeRpcs: NODE_RPCS,
          memo: keypair.did,
        });
      } catch (err) {
        transfer = { error: String(err?.message ?? err) };
      }
    }

    let paidRes, paidBody;
    try {
      paidRes = await fetch(targetUrl, {
        headers: {
          'PAYMENT-REQUIRED': signed.paymentRequiredEncoded,
          'PAYMENT-SIGNATURE': signed.paymentSignature,
          'X-FOUROTWO-DID': keypair.did,
          // Report the real settlement transfer so the merchant can show it too.
          'X-FOUROTWO-SETTLEMENT-TX': transfer.txHash ?? '',
        },
      });
      paidBody = await paidRes.json().catch(() => ({}));
    } catch (err) {
      return json(res, 502, { error: 'MERCHANT_UNREACHABLE', detail: String(err) });
    }

    if (!paidRes.ok) {
      return json(res, 402, { error: 'PAYMENT_REJECTED', status: paidRes.status, detail: paidBody });
    }

    const after = await balanceMotes(); // live re-read (may lag settlement finality)
    const deduct = BigInt(terms.amount);
    const projectedAfter = before === null ? null : (BigInt(before) - deduct).toString();
    return json(res, 200, {
      ok: true,
      did: keypair.did,
      data: paidBody.data ?? paidBody,
      settlement: paidBody.settlement ?? null,
      receipt: paidBody.receipt ?? null,
      amountMotes: terms.amount,
      recipient: terms.recipient,
      balanceBeforeMotes: before,
      projectedAfterMotes: projectedAfter,
      liveAfterMotes: after,
      // Real settlement transfer (funds actually moved on-chain).
      transferTxHash: transfer.txHash ?? null,
      transferSkipped: transfer.skipped ? transfer.reason : null,
      transferError: transfer.error ?? null,
      transferExplorerUrl: transfer.txHash ? `${EXPLORER}/deploy/${transfer.txHash}` : null,
    });
  }

  if (req.method === 'GET') return serveStatic(res, pathname);
  return json(res, 404, { error: 'NOT_FOUND' });
});

/**
 * Register the agent with the KYX registry so it shows up on /agents with an
 * operator-linked, trust-scored identity. A DID is derived from the key, but
 * derivation ≠ registration - this performs the actual onboarding.
 */
async function selfRegister() {
  if (process.env.AGENT_AUTO_REGISTER === 'false') {
    console.log('  kyx        : auto-register disabled');
    return;
  }
  try {
    const result = await registerWithKyx({
      kyxUrl: KYX_REGISTRY_URL,
      email: AGENT_OPERATOR_EMAIL,
      agentName: AGENT_NAME,
      publicKeyHex: keypair.taggedPublicKeyHex,
      network: 'casper',
    });
    console.log(`  kyx        : ${result.status} → ${KYX_REGISTRY_URL}`);
  } catch (err) {
    console.log(`  kyx        : registration failed - ${err.message}`);
  }
}

server.listen(PORT, () => {
  console.log(`Atlas Agent → http://localhost:${PORT}`);
  console.log(`  agent DID  : ${keypair.did}`);
  console.log(`  wallet     : ${ACCOUNT_HASH}`);
  console.log(`  key source : ${KEY_SOURCE}${FUNDED ? '' : '  ← set AGENT_SECRET_KEY_PATH to a funded ed25519 secret_key.pem'}`);
  console.log(`  merchant   : ${MERCHANT_URL}`);
  void selfRegister();
});
