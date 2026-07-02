#!/usr/bin/env node
// RWA Oracle Agent — the first fourotwo SDK consumer (ticket M2-T7).
//
// Drives the full x402 loop end-to-end with ZERO manual signing:
//   fetch mock RWA API → 402 → SDK signs + attaches DID → retry → verify →
//   settle → data returned. Every step is logged for demo narration.
//
// Usage (from repo root, with the facilitator + mock API already running):
//   node demos/rwa-oracle-agent/agent.mjs
//
// Env:
//   MOCK_RWA_URL        default http://localhost:5000
//   ASSET_ID            default RE-NYC-001
//   FOUROTWO_PRIVATE_KEY  hex ed25519 secret; generated if unset
//   KYX_REGISTRY_URL    if set, the agent self-registers before transacting
//   OPERATOR_EMAIL      default oracle@fourotwo.dev (used for registration)
//   AGENT_DAILY_USD     default 10   (spend budget — daily)
//   AGENT_PER_REQ_USD   default 1    (spend budget — per request)

import { fourotwoAgent, generateCasperKeypair, keypairFromPrivateKey } from '@fourotwo/agent-sdk';

const MOCK_RWA_URL = process.env.MOCK_RWA_URL ?? 'http://localhost:5000';
const ASSET_ID = process.env.ASSET_ID ?? 'RE-NYC-001';
const KYX_REGISTRY_URL = process.env.KYX_REGISTRY_URL ?? '';
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? 'oracle@fourotwo.dev';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let stepNo = 0;
const step = (msg) => console.log(`${c.cyan(`[${++stepNo}]`)} ${msg}`);
const info = (msg) => console.log(`    ${c.dim(msg)}`);

/** Resolve (or generate) the agent keypair. */
function loadKeypair() {
  if (process.env.FOUROTWO_PRIVATE_KEY) {
    return keypairFromPrivateKey(process.env.FOUROTWO_PRIVATE_KEY.trim());
  }
  const kp = generateCasperKeypair();
  info(`generated ephemeral key — set FOUROTWO_PRIVATE_KEY=${kp.privateKeyHex} to reuse`);
  return kp;
}

/** Optionally register the agent in the KYX registry (verify operator → register). */
async function registerIfPossible(keypair) {
  if (!KYX_REGISTRY_URL) {
    info('KYX_REGISTRY_URL unset — relying on the facilitator trust stub (agent not registered)');
    return;
  }
  step(`Registering with KYX registry at ${KYX_REGISTRY_URL}`);
  // 1. operator email verification (dev stub returns the token directly)
  const vr = await fetch(`${KYX_REGISTRY_URL}/operators/verify-request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: OPERATOR_EMAIL }),
  }).then((r) => r.json());
  if (vr.dev_token) {
    await fetch(`${KYX_REGISTRY_URL}/operators/verify/${vr.dev_token}`);
    info(`operator ${OPERATOR_EMAIL} verified`);
  }
  // 2. register the agent (public_key is the tagged ed25519 key, matching DID derivation)
  const reg = await fetch(`${KYX_REGISTRY_URL}/agents/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent_name: 'RWA Oracle Agent',
      operator_email: OPERATOR_EMAIL,
      public_key: keypair.taggedPublicKeyHex,
      network: 'casper',
    }),
  });
  const body = await reg.json();
  if (reg.ok) info(`registered DID ${body.agent?.did} (trust score ${body.trust?.score ?? 'n/a'})`);
  else info(`registration skipped/failed: ${body.error ?? reg.status} (continuing)`);
}

async function main() {
  console.log(c.bold('\n  RWA Oracle Agent — fourotwo SDK demo\n'));

  const keypair = loadKeypair();
  step(`Agent identity`);
  info(`DID  ${keypair.did}`);

  await registerIfPossible(keypair);

  // A logging fetch wrapper so the 402 → pay → 200 transitions are visible.
  const loggingFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    const signed = new Headers(init.headers).has('PAYMENT-SIGNATURE');
    const res = await fetch(input, init);
    if (res.status === 402) {
      step('402 Payment Required received');
      info('PAYMENT-REQUIRED envelope present → SDK will sign & retry automatically');
    } else if (signed) {
      step(`Retried with payment — server responded ${res.status}`);
      info('SDK signed the envelope, attached the DID, merchant ran /verify + /settle');
    }
    return res;
  };

  const agent = new fourotwoAgent({
    did: keypair.did,
    privateKeyHex: keypair.privateKeyHex,
    budget: {
      dailyUsd: Number(process.env.AGENT_DAILY_USD ?? 10),
      perRequestUsd: Number(process.env.AGENT_PER_REQ_USD ?? 1),
    },
    fetchImpl: loggingFetch,
  });

  const url = `${MOCK_RWA_URL}/data/${ASSET_ID}`;
  step(`Fetching RWA data: GET ${url}`);

  let res;
  try {
    res = await agent.fetch(url);
  } catch (err) {
    console.error(c.red(`\n  ✗ payment failed: ${err.message}\n`));
    console.error(c.dim('  Is the facilitator (:4001) and mock RWA API (:5000) running?'));
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(c.red(`\n  ✗ request failed (${res.status})`));
    console.error(c.dim(`  ${JSON.stringify(body)}\n`));
    process.exit(1);
  }

  const payload = await res.json();
  step(c.green('Data received ✓'));
  console.log(c.dim('    ──────────────────────────────────────────────'));
  console.log(`    asset: ${c.bold(ASSET_ID)}`);
  console.log(`    ${JSON.stringify(payload.data)}`);

  const receipt = payload.payment?.settle?.receipt;
  if (receipt) {
    step('Signed settlement receipt');
    info(`settlement_id ${receipt.settlementId}`);
    info(`amount        ${receipt.amount} ${receipt.token} (${receipt.settlementMode})`);
    info(`tx_hash       ${receipt.txHash ?? '(live broadcast unconfigured)'}`);
    info(`facilitator   sig ${receipt.facilitatorSignature.slice(0, 32)}…`);
  }

  step('Local transaction ledger');
  for (const entry of agent.getTransactionLog()) {
    const mark = entry.status === 'success' ? c.green('✓') : c.red('✗');
    info(`${mark} ${entry.status}  ${entry.amount} ${entry.token} → ${entry.recipient}`);
  }

  console.log(c.green(`\n  ✓ Full x402 loop completed with zero manual signing.\n`));
}

main().catch((err) => {
  console.error(c.red(`\n  ✗ ${err.stack ?? err.message}\n`));
  process.exit(1);
});
