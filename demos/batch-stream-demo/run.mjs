/**
 * Batched-settlement demo: a tick-data merchant that would be uneconomical to
 * settle per call, and an agent that hammers it.
 *
 * A micro-merchant sells price ticks for 0.05 CSPR each and settles every paid
 * call through the facilitator with `settlement_mode: "batch"`. The agent
 * (plain @fourotwo/agent-sdk) buys a burst of ticks - each gets a SIGNED
 * receipt immediately - and the facilitator writes ONE on-chain record for the
 * whole batch at the flush. That is the gas saving: N payments, 1 transaction.
 *
 *   node demos/batch-stream-demo/run.mjs
 *
 * Env: FACILITATOR_URL (default the live facilitator), TICKS (default 8).
 */
import { createServer } from 'node:http';

import { encodeEnvelope } from '../../packages/types/dist/index.js';
import { fourotwoAgent, generateCasperKeypair } from '../../packages/agent-sdk/dist/index.js';

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://fourotwo-facilitator.onrender.com';
const TICKS = Number(process.env.TICKS ?? 8);
const PORT = Number(process.env.PORT ?? 5310);
const PRICE_MOTES = '50000000'; // 0.05 CSPR per tick - per-call gas would dwarf this
const MERCHANT = 'account-hash-13a08fe40b282052cc49edbd067edbc3705696ef6731f1fb0396f164c53519d3';

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// ── The merchant: sells ticks, settles each payment as part of a batch ──
const merchant = createServer(async (req, res) => {
  const json = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  if (!req.url?.startsWith('/tick')) return json(404, { error: 'NOT_FOUND' });

  const signature = req.headers['payment-signature'];
  const envelope = req.headers['payment-required'];
  const did = req.headers['x-fourotwo-did'];

  if (!signature || !envelope || !did) {
    const terms = {
      network: 'casper',
      token: 'CSPR',
      amount: PRICE_MOTES,
      recipient: MERCHANT,
      nonce: `tick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      expiry: Math.floor(Date.now() / 1000) + 600,
      facilitator: FACILITATOR_URL,
    };
    return json(402, { error: 'PAYMENT_REQUIRED' }, { 'PAYMENT-REQUIRED': encodeEnvelope(terms) });
  }

  const verify = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payment_required: envelope, payment_signature: signature, agent_did: did }),
  }).then((r) => r.json());
  if (verify.valid !== true) return json(402, { error: 'PAYMENT_FAILED', verify });

  // The whole point of this demo: settle as part of a BATCH, not per call.
  const settle = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verification_id: verify.verification_id, settlement_mode: 'batch' }),
  }).then((r) => r.json());
  if (!settle.settlement_id) return json(502, { error: 'SETTLE_FAILED', settle });

  return json(200, {
    tick: { symbol: 'CSPR/USD', price: (0.019 + Math.random() * 0.002).toFixed(5), at: new Date().toISOString() },
    receipt: settle.receipt,
    batch_id: settle.batch_id,
    fee_motes: settle.fee_motes,
  });
});

await new Promise((ok) => merchant.listen(PORT, ok));
console.log(bold('\n▸ batched-settlement demo'));
console.log(dim(`  facilitator : ${FACILITATOR_URL}`));
console.log(dim(`  merchant    : http://localhost:${PORT}/tick  (${Number(PRICE_MOTES) / 1e9} CSPR per tick, settles in batch)\n`));

// ── The agent: a stock @fourotwo/agent-sdk consumer, nothing batch-specific ──
const keypair = generateCasperKeypair();
const agent = new fourotwoAgent({ privateKeyHex: keypair.privateKeyHex });
console.log(`agent ${cyan(agent.did)}\n`);

console.log(bold(`1 · burst of ${TICKS} paid tick requests (each pays 402 automatically)`));
for (let i = 1; i <= TICKS; i++) {
  const res = await agent.fetch(`http://localhost:${PORT}/tick`);
  const body = await res.json();
  if (!res.ok) throw new Error(`tick ${i} failed: ${JSON.stringify(body)}`);
  const r = body.receipt;
  console.log(
    `  tick ${String(i).padStart(2)} ${body.tick.price}  →  receipt ${dim(r.settlementId)} ` +
      `mode=${cyan(r.settlementMode)} batch=${dim(body.batch_id)} fee=${r.feeMotes} motes ${green('✓ signed')}`,
  );
}

console.log(bold('\n2 · the facilitator queue - nothing on-chain yet'));
const status = await fetch(`${FACILITATOR_URL}/batch/status`).then((r) => r.json());
console.log(`  pending=${cyan(status.pending)}  queued=${Number(status.totalPendingMotes) / 1e9} CSPR  window=${status.windowMs}ms`);

console.log(bold('\n3 · force-flush: ONE on-chain record settles the whole batch'));
const flush = await fetch(`${FACILITATOR_URL}/batch/settle`, { method: 'POST' }).then((r) => r.json());
console.log(`  flushed=${green(flush.flushed)} payments  total=${Number(flush.totalMotes) / 1e9} CSPR  batch=${dim(flush.batchId)}`);
console.log(`  vault record: ${flush.vaultRecorded ? green(flush.vaultTx ?? 'recorded') : dim('log-only (vault not configured)')}`);

console.log(bold('\n4 · platform fees accrued on the batch'));
const fees = await fetch(`${FACILITATOR_URL}/fees`).then((r) => r.json());
console.log(`  fee ${fees.feeBps} bps · total accrued ${Number(fees.totalFeesMotes) / 1e9} CSPR over ${fees.count} settlements`);

console.log(green(`\n✓ ${TICKS} payments, ${TICKS} signed receipts, 1 on-chain settlement.\n`));
merchant.close();
