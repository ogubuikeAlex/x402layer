# Batch-stream demo — N payments, 1 on-chain settlement

A terminal demo of **batched settlement**: a micro-merchant sells price ticks
for 0.05 CSPR each — far too cheap to settle individually on-chain — and
settles every paid call through the facilitator with
`settlement_mode: "batch"`.

The agent is a stock `@fourotwo/agent-sdk` consumer with nothing
batch-specific in it: batching is purely a merchant/facilitator choice.

What you'll see:

1. A burst of paid tick requests — each returns **immediately** with a signed
   receipt (`settlementMode: "batch"`, shared `batchId`, `feeMotes`).
2. `GET /batch/status` — the payments queued at the facilitator, nothing
   on-chain yet.
3. `POST /batch/settle` — one aggregated SettlementVault record settles the
   whole batch (normally the 60s window does this automatically).
4. `GET /fees` — the platform fee accrued across the batch.

## Run

```bash
npx turbo run build --filter=@fourotwo/agent-sdk   # once, from the repo root
node demos/batch-stream-demo/run.mjs
```

Defaults to the live facilitator. Env:

| Var | Default | Meaning |
| --- | --- | --- |
| `FACILITATOR_URL` | `https://fourotwo-facilitator.onrender.com` | Facilitator to settle through |
| `TICKS` | `8` | Number of paid requests in the burst |
| `PORT` | `5310` | Local port for the inline merchant |
