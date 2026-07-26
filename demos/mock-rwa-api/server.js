import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeEnvelope } from '../../packages/types/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_RWA_PORT ?? 5000);
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'http://localhost:4001';
const RECIPIENT = process.env.MOCK_RWA_RECIPIENT ?? 'account-hash-merchant';
const AMOUNT = process.env.MOCK_RWA_AMOUNT ?? '5000';

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body, null, 2));
}

function paymentRequired(assetId) {
  return {
    amount: AMOUNT,
    recipient: RECIPIENT,
    network: 'casper',
    token: 'CSPR',
    expiry: Math.floor(Date.now() / 1000) + 600,
    nonce: `rwa-${assetId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    facilitator: FACILITATOR_URL,
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
  const verifyJson = await verifyRes.json();
  if (!verifyRes.ok || verifyJson.valid !== true) {
    return { ok: false, status: verifyRes.status, verify: verifyJson };
  }

  const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verification_id: verifyJson.verification_id }),
  });
  const settleJson = await settleRes.json();
  return { ok: settleRes.ok, status: settleRes.status, verify: verifyJson, settle: settleJson };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (req.method !== 'GET' || !url.pathname.startsWith('/data/')) {
      return json(res, 404, { error: 'NOT_FOUND' });
    }

    const assetId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const paymentSignature = req.headers['payment-signature'];
    const paymentRequiredHeader = req.headers['payment-required'];
    const did = req.headers['x-fourotwo-did'];

    if (!paymentSignature || !paymentRequiredHeader || !did) {
      const encoded = encodeEnvelope(paymentRequired(assetId));
      return json(
        res,
        402,
        { error: 'PAYMENT_REQUIRED', asset_id: assetId },
        { 'PAYMENT-REQUIRED': encoded },
      );
    }

    // Reject any assetId that isn't a plain identifier: without this, a value like
    // `..%2f..%2fsecret` would traverse outside the data directory.
    if (!/^[a-zA-Z0-9_-]+$/.test(assetId)) {
      return json(res, 400, { error: 'INVALID_ASSET_ID' });
    }
    const dataDir = resolve(__dirname, 'data');
    const filePath = resolve(dataDir, `${assetId}.json`);
    if (filePath !== dataDir && !filePath.startsWith(dataDir + sep)) {
      return json(res, 400, { error: 'INVALID_ASSET_ID' });
    }

    const payment = await verifyAndSettle({
      did: String(did),
      paymentRequiredHeader: String(paymentRequiredHeader),
      paymentSignature: String(paymentSignature),
    });
    if (!payment.ok) return json(res, 402, { error: 'PAYMENT_FAILED', payment });

    let raw;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      return json(res, 404, { error: 'ASSET_NOT_FOUND', asset_id: assetId });
    }
    return json(res, 200, { data: JSON.parse(raw), payment });
  } catch (err) {
    return json(res, 500, { error: 'SERVER_ERROR', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`mock RWA API listening on http://localhost:${PORT}`);
});
