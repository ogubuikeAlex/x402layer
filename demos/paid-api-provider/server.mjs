/**
 * Meridian RWA Data API - a fleshed-out reference *merchant* (facilitator user).
 *
 * It monetises a data API with layer402: unpaid requests get a 402 + payment terms,
 * and a paid retry is verified + settled through the live fourotwo facilitator.
 * Every settlement credits this merchant, shown live on the /api/earnings feed
 * and the API-doc homepage.
 *
 * This is a NEW, richer demo - the minimal original lives in demos/mock-rwa-api.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeEnvelope, deriveAddress } from '../../packages/types/dist/index.js';
import { generateCasperKeypair } from '../../packages/agent-sdk/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const PORT = Number(process.env.PORT ?? process.env.MERIDIAN_PORT ?? 5100);
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://fourotwo-facilitator.onrender.com';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
const EXPLORER = process.env.CASPER_EXPLORER_URL ?? 'https://testnet.cspr.live';

// The merchant's on-chain payout account. Native CSPR transfers need a Casper
// public key as the deploy target; the account hash is derived for display.
// Provide a real tagged public key via MERCHANT_RECIPIENT to make agents pay a
// stable account. A legacy account-hash value is still accepted, but Atlas will
// skip the real native transfer because Casper cannot build that deploy target.
let MERCHANT_ACCOUNT_HASH;
let MERCHANT_PUBLIC_KEY_HEX;
const explicitRecipient = process.env.MERCHANT_RECIPIENT?.trim();
if (explicitRecipient && /^(01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/.test(explicitRecipient.replace(/^0x/, ''))) {
  MERCHANT_PUBLIC_KEY_HEX = explicitRecipient.replace(/^0x/, '');
  MERCHANT_ACCOUNT_HASH = deriveAddress('casper', MERCHANT_PUBLIC_KEY_HEX);
} else if (explicitRecipient && /^(account-hash-)?[0-9a-fA-F]{64}$/.test(explicitRecipient)) {
  MERCHANT_ACCOUNT_HASH = explicitRecipient.replace(/^account-hash-/, '');
} else {
  const merchantKey = generateCasperKeypair();
  MERCHANT_PUBLIC_KEY_HEX = merchantKey.taggedPublicKeyHex;
  MERCHANT_ACCOUNT_HASH = deriveAddress('casper', merchantKey.taggedPublicKeyHex);
  if (explicitRecipient) {
    console.warn(`MERCHANT_RECIPIENT "${explicitRecipient}" is not a Casper public key/account hash - using a generated wallet.`);
  }
}
const RECIPIENT = MERCHANT_PUBLIC_KEY_HEX ?? `account-hash-${MERCHANT_ACCOUNT_HASH}`;

/** Catalog of paid assets. Prices are in motes (1 CSPR = 1e9 motes).
 *  All >= 2.5 CSPR so a real native CSPR transfer (protocol minimum) succeeds. */
const CATALOG = [
  { id: 'RE-NYC-001', name: 'Manhattan Class-A Office Tower', kind: 'Real estate', priceMotes: '5000000000' },
  { id: 'RE-LDN-014', name: 'City of London Mixed-Use', kind: 'Real estate', priceMotes: '3500000000' },
  { id: 'COMM-GOLD-1', name: 'Allocated Gold Vault (LBMA)', kind: 'Commodity', priceMotes: '7500000000' },
  { id: 'CRED-SME-77', name: 'SME Private Credit Basket', kind: 'Private credit', priceMotes: '2500000000' },
];

/** In-memory settlement ledger - what this merchant has been credited. */
const earnings = [];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-REQUIRED, PAYMENT-SIGNATURE, X-FOUROTWO-DID');
  // So the browser interceptor can actually READ the 402 payment terms.
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED');
}

function json(res, status, body, extraHeaders = {}) {
  cors(res);
  res.writeHead(status, { 'content-type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body, null, 2));
}

function paymentTerms(asset) {
  return {
    amount: asset.priceMotes,
    recipient: RECIPIENT,
    network: 'casper',
    token: 'CSPR',
    expiry: Math.floor(Date.now() / 1000) + 600,
    nonce: `meridian-${asset.id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    facilitator: FACILITATOR_URL,
    minTrustScore: 0,
  };
}

async function verifyAndSettle({ did, paymentRequiredHeader, paymentSignature }) {
  const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payment_required: paymentRequiredHeader,
      payment_signature: paymentSignature,
      agent_did: did,
    }),
  });
  const verify = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || verify.valid !== true) {
    return { ok: false, stage: 'verify', status: verifyRes.status, verify };
  }

  const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verification_id: verify.verification_id, settlement_mode: 'auto' }),
  });
  const settle = await settleRes.json().catch(() => ({}));
  return { ok: settleRes.ok, stage: 'settle', status: settleRes.status, verify, settle };
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  try {
    const file = join(__dirname, 'public', rel);
    const body = await readFile(file);
    cors(res);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'NOT_FOUND', path: pathname });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204).end();
    return;
  }

  // ── Free endpoints ────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/catalog') {
    return json(res, 200, {
      merchant: 'Meridian RWA Data API',
      recipient: RECIPIENT,
      merchantAccountHash: MERCHANT_ACCOUNT_HASH,
      merchantPublicKeyHex: MERCHANT_PUBLIC_KEY_HEX ?? null,
      merchantExplorerUrl: `${EXPLORER}/account/${MERCHANT_ACCOUNT_HASH}`,
      assets: CATALOG,
    });
  }
  if (req.method === 'GET' && pathname === '/api/earnings') {
    const totalMotes = earnings.reduce((sum, e) => sum + BigInt(e.amount), 0n);
    return json(res, 200, {
      count: earnings.length,
      totalMotes: totalMotes.toString(),
      explorer: EXPLORER,
      merchantAccountHash: MERCHANT_ACCOUNT_HASH,
      merchantPublicKeyHex: MERCHANT_PUBLIC_KEY_HEX ?? null,
      settlements: earnings.slice(-25).reverse(),
    });
  }

  // ── Paid endpoint: GET /api/assets/:id ────────────────────────────
  const assetMatch = pathname.match(/^\/api\/assets\/([^/]+)$/);
  if (req.method === 'GET' && assetMatch) {
    const asset = CATALOG.find((a) => a.id === decodeURIComponent(assetMatch[1]));
    if (!asset) return json(res, 404, { error: 'ASSET_NOT_FOUND' });

    const paymentSignature = req.headers['payment-signature'];
    const paymentRequiredHeader = req.headers['payment-required'];
    const did = req.headers['x-fourotwo-did'];

    // No payment yet → 402 with the terms in the PAYMENT-REQUIRED header.
    if (!paymentSignature || !paymentRequiredHeader || !did) {
      const encoded = encodeEnvelope(paymentTerms(asset));
      return json(
        res,
        402,
        { error: 'PAYMENT_REQUIRED', asset_id: asset.id, price_motes: asset.priceMotes, price_cspr: Number(asset.priceMotes) / 1e9 },
        { 'PAYMENT-REQUIRED': encoded },
      );
    }

    // Paid retry → verify + settle through the facilitator.
    const result = await verifyAndSettle({
      did: String(did),
      paymentRequiredHeader: String(paymentRequiredHeader),
      paymentSignature: String(paymentSignature),
    });
    if (!result.ok) return json(res, 402, { error: 'PAYMENT_FAILED', detail: result });

    const receipt = result.settle?.receipt;
    // The real native-CSPR settlement transfer, broadcast agent-side.
    const transferTx = String(req.headers['x-fourotwo-settlement-tx'] ?? '').trim() || null;
    const vaultTx = receipt?.txHash ?? result.settle?.vault_tx ?? null;
    const record = {
      settlementId: result.settle?.settlement_id ?? receipt?.settlementId ?? 'unknown',
      did: String(did),
      asset: asset.id,
      amount: asset.priceMotes,
      token: 'CSPR',
      mode: result.settle?.mode ?? receipt?.settlementMode ?? 'direct',
      transferTx,
      vaultTx,
      explorerUrl: transferTx ? `${EXPLORER}/deploy/${transferTx}` : null,
      at: new Date().toISOString(),
    };
    earnings.push(record);

    let data;
    try {
      data = JSON.parse(await readFile(join(__dirname, 'data', `${asset.id}.json`), 'utf8'));
    } catch {
      data = { id: asset.id, name: asset.name, note: 'sample dataset' };
    }
    return json(res, 200, { asset: asset.id, data, settlement: record, receipt });
  }

  // ── Static (API-doc site) ─────────────────────────────────────────
  if (req.method === 'GET') return serveStatic(res, pathname);
  return json(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, () => {
  console.log(`Meridian RWA Data API → http://localhost:${PORT}`);
  console.log(`  facilitator : ${FACILITATOR_URL}`);
  console.log(`  payout to   : ${RECIPIENT}`);
});
