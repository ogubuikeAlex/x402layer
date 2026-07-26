#!/usr/bin/env node
// fourotwo v2 demo orchestrator.
//
// Drives, end to end, the four features shipped since v1:
//   1. Magic-link operator verification  (KYX registry)
//   2. Agent registration                (DID derived from the agent key)
//   3. Autonomous payment via the Python SDK  (no human in the loop)
//   4. Batch settlement                  (many payments -> one on-chain record)
//
// Prereqs (each in its own terminal, from the repo root):
//   npm run build
//   BATCH_AUTO_THRESHOLD_MOTES=1000000000 BATCH_WINDOW_MS=600000 \
//     FACILITATOR_ADMIN_TOKEN=demo-admin KYX_REGISTRY_URL=http://localhost:4002 \
//     npm run dev -w @fourotwo/facilitator          # :4001
//   KYX_DEV_TOKEN_EMAILS=atlas@fourotwo.dev npm run dev -w @fourotwo/kyx-registry   # :4002
//   node demos/mock-rwa-api/server.js               # :5000
//   python -m pip install -e packages/agent-sdk-py  # once, for the Python SDK
//
// Then:  node demos/v2-demo/run.mjs

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateCasperKeypair } from '@fourotwo/agent-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'http://localhost:4001';
const KYX_REGISTRY_URL = process.env.KYX_REGISTRY_URL ?? 'http://localhost:4002';
const MERCHANT_URL = process.env.MERCHANT_URL ?? 'http://localhost:5000/data';
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? 'atlas@fourotwo.dev';
const AGENT_NAME = process.env.AGENT_NAME ?? `Atlas ${Date.now().toString(36)}`;
const ADMIN_TOKEN = process.env.FACILITATOR_ADMIN_TOKEN ?? '';
const PAY_COUNT = Number(process.env.PAY_COUNT ?? 4);
const PYTHON = process.env.PYTHON ?? 'python';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let stepNo = 0;
const step = (msg) => console.log(`\n${c.cyan(`[${++stepNo}]`)} ${c.bold(msg)}`);
const info = (msg) => console.log(`    ${c.dim(msg)}`);
const fail = (msg) => {
  console.error(c.red(`\n  x ${msg}\n`));
  process.exit(1);
};

async function getJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function requireHealthy(name, url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) fail(`${name} at ${url} responded ${res.status}. Is it running?`);
  } catch {
    fail(`${name} at ${url} is unreachable. Start it first (see the header of this file).`);
  }
  info(`${name} healthy at ${url}`);
}

/** Step 1: verify the operator email via the magic link. */
async function verifyOperator() {
  step('Magic-link operator verification');
  const req = await getJson(`${KYX_REGISTRY_URL}/operators/verify-request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: OPERATOR_EMAIL }),
  });

  if (req.status === 429) fail('Rate limited by the registry - wait a bit and re-run.');
  if (req.body?.already_verified) {
    info(`operator ${OPERATOR_EMAIL} already verified`);
    return;
  }
  if (req.body?.email_sent) {
    fail(
      `A real magic link was emailed to ${OPERATOR_EMAIL}. For a self-contained demo, add it to ` +
        `KYX_DEV_TOKEN_EMAILS so the link is returned here instead.`,
    );
  }
  const url = req.body?.verification_url;
  if (!req.ok || !url) {
    fail(
      `verify-request failed (${req.status}: ${req.body?.error ?? 'unknown'}). ` +
        `Set KYX_DEV_TOKEN_EMAILS=${OPERATOR_EMAIL} on the registry so the magic link is returned.`,
    );
  }
  info(`magic link issued: ${url}`);
  const opened = await fetch(url); // "clicking" the link verifies the operator
  if (!opened.ok) fail(`opening the magic link failed (${opened.status})`);
  info(`operator ${OPERATOR_EMAIL} verified via magic link`);
}

/** Step 2: register the agent DID (derived from a fresh key). */
async function registerAgent(keypair) {
  step('Register the agent');
  info(`DID ${keypair.did}`);
  const reg = await getJson(`${KYX_REGISTRY_URL}/agents/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent_name: AGENT_NAME,
      operator_email: OPERATOR_EMAIL,
      public_key: keypair.taggedPublicKeyHex,
      network: 'casper',
    }),
  });
  if (!reg.ok) fail(`registration failed (${reg.status}: ${reg.body?.error ?? 'unknown'})`);
  info(`registered "${AGENT_NAME}" - trust score ${reg.body?.trust?.score ?? 'n/a'} (${reg.body?.trust?.tier ?? '?'})`);
}

/** Step 3: run the autonomous Python agent. */
function runAtlas(keypair) {
  step('Autonomous payments via the Python SDK (no human approval)');
  const assetIds = Array.from({ length: PAY_COUNT }, () => 'RE-NYC-001').join(',');
  return new Promise((resolvePromise) => {
    const child = spawn(PYTHON, [resolve(__dirname, 'atlas_agent.py')], {
      stdio: 'inherit',
      env: {
        ...process.env,
        FOUROTWO_PRIVATE_KEY: keypair.privateKeyHex,
        MERCHANT_URL,
        ASSET_IDS: assetIds,
      },
    });
    child.on('close', (code) => {
      if (code !== 0) info(c.yellow(`atlas_agent.py exited with code ${code}`));
      resolvePromise();
    });
    child.on('error', (err) => {
      info(c.yellow(`could not launch "${PYTHON}": ${err.message}. Install the Python SDK and set PYTHON.`));
      resolvePromise();
    });
  });
}

/** Step 4: show the batch queue and flush it into ONE on-chain record. */
async function flushBatch() {
  step('Batch settlement - many payments, one on-chain record');
  if (!ADMIN_TOKEN) {
    info(
      c.yellow('FACILITATOR_ADMIN_TOKEN not set') +
        ' - cannot force-flush. Either set it, or wait for BATCH_WINDOW_MS to flush automatically.',
    );
    return;
  }
  const auth = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const status = await getJson(`${FACILITATOR_URL}/batch/status`, { headers: auth });
  if (status.ok) {
    info(`pending in batch: ${status.body?.pending ?? 0} payment(s), ${status.body?.totalPendingMotes ?? 0} motes`);
  }
  if ((status.body?.pending ?? 0) === 0) {
    info(
      c.yellow('nothing queued') +
        ' - payments settled directly. Set BATCH_AUTO_THRESHOLD_MOTES above the payment amount to batch them.',
    );
    return;
  }
  const flush = await getJson(`${FACILITATOR_URL}/batch/settle`, { method: 'POST', headers: auth });
  if (!flush.ok) fail(`batch flush failed (${flush.status}: ${flush.body?.error ?? 'unknown'})`);
  info(
    `flushed ${flush.body?.flushed} payment(s) as batch ${flush.body?.batchId} ` +
      `(${flush.body?.totalMotes} motes total)`,
  );
  info(
    flush.body?.vaultRecorded
      ? c.green(`one on-chain SettlementVault record: ${flush.body?.vaultTx ?? '(recorded)'}`)
      : c.yellow('vault write unconfigured/failed - reported as such (no phantom "confirmed")'),
  );
}

async function main() {
  console.log(c.bold('\n  fourotwo v2 demo - magic link -> register -> autonomous pay -> batch settle'));

  await requireHealthy('facilitator', FACILITATOR_URL);
  await requireHealthy('kyx-registry', KYX_REGISTRY_URL);

  const keypair = generateCasperKeypair();

  await verifyOperator();
  await registerAgent(keypair);
  await runAtlas(keypair);
  await flushBatch();

  console.log(c.green('\n  v2 demo complete.\n'));
}

main().catch((err) => fail(err?.stack ?? String(err)));
