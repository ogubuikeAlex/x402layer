# fourotwo v2 demo — magic link → register → autonomous pay → batch settle

The v1 demo proved the core loop: **pay → verify → settle → score**. This v2 demo
shows the four things shipped since: **operator magic links, a Python SDK, a fully
autonomous agent, and batch settlement** (many small payments collapse into one
on-chain record).

One command drives the whole thing:

```bash
node demos/v2-demo/run.mjs
```

It orchestrates, in order:

1. **Magic-link operator verification** — the registry issues a verification link
   for the operator email; the script "clicks" it to verify the operator.
2. **Agent registration** — a fresh agent key is generated and its DID registered
   under the verified operator.
3. **Autonomous payment (Python SDK)** — `atlas_agent.py` is handed only a spend
   budget, then pays a paid API several times with **no per-payment approval**.
4. **Batch settlement** — those low-value payments queue and flush into a **single**
   on-chain `SettlementVault` record.

---

## 1. Setup (before recording)

Build once, then start each service in its own terminal. The batch + admin env
vars are what make the batch beat deterministic.

```bash
npm run build

# Facilitator (:4001): batch small payments, keep the window open so we flush by hand,
# and set an admin token so the demo can force-flush.
BATCH_AUTO_THRESHOLD_MOTES=1000000000 \
BATCH_WINDOW_MS=600000 \
FACILITATOR_ADMIN_TOKEN=demo-admin \
KYX_REGISTRY_URL=http://localhost:4002 \
  npm run dev -w @fourotwo/facilitator

# KYX registry (:4002): allow the demo operator's magic link to be returned inline
# (instead of requiring a real inbox).
KYX_DEV_TOKEN_EMAILS=atlas@fourotwo.dev \
  npm run dev -w @fourotwo/kyx-registry

# A paid API to buy from (:5000).
node demos/mock-rwa-api/server.js

# The Python SDK (once).
python -m pip install -e packages/agent-sdk-py
```

Then run the demo, pointing it at the same admin token:

```bash
FACILITATOR_ADMIN_TOKEN=demo-admin node demos/v2-demo/run.mjs
```

> **Why those env vars**
> - `BATCH_AUTO_THRESHOLD_MOTES` above the payment amount → payments settle in
>   **batch** mode instead of direct. `0` (the default) means everything settles
>   directly and there is nothing to flush.
> - `BATCH_WINDOW_MS` long → the batch does **not** auto-flush mid-demo, so the
>   force-flush is the visible beat.
> - `KYX_DEV_TOKEN_EMAILS=atlas@fourotwo.dev` → the magic link is returned in the
>   API response. Without it (and without SMTP configured) the registry now fails
>   closed with `EMAIL_NOT_CONFIGURED` rather than leaking a token — so this is
>   required for the self-contained demo.
> - `FACILITATOR_ADMIN_TOKEN` → `/batch/status` and `/batch/settle` are admin-only
>   and fail closed; the token unlocks the force-flush.

Env knobs for `run.mjs`: `FACILITATOR_URL`, `KYX_REGISTRY_URL`, `MERCHANT_URL`,
`OPERATOR_EMAIL`, `AGENT_NAME`, `PAY_COUNT` (default 4), `PYTHON` (default `python`).

---

## 2. What you'll see

```
[1] Magic-link operator verification
    magic link issued: http://localhost:4002/operators/verify/<token>
    operator atlas@fourotwo.dev verified via magic link
[2] Register the agent
    DID did:fourotwo:casper:<addr>
    registered "Atlas ..." - trust score 30 (RESTRICTED)
[3] Autonomous payments via the Python SDK (no human approval)
    [1] paid RE-NYC-001 -> batch stl_...
    [2] paid RE-NYC-001 -> batch stl_...
    ...
[4] Batch settlement - many payments, one on-chain record
    pending in batch: 4 payment(s), 20000 motes
    flushed 4 payment(s) as batch bat_... (20000 motes total)
    one on-chain SettlementVault record: <deploy-hash-or-note>
```

A newly-registered agent scores **30 (RESTRICTED)** — a verified operator alone no
longer buys a trusted tier; the score has to be earned with real settlement
history. That is the corrected trust model, not a bug.

---

## 3. Recording script (target 3–4 min)

### Scene 1 — Operator onboarding via magic link (0:00–0:50)
> "In v2, operators verify by email. The registry issues a one-time magic link;
> clicking it verifies the operator. No shared secrets, no password."

Run `node demos/v2-demo/run.mjs` and narrate step **[1]** — the link is issued and
"clicked" for you. Mention the registry fails closed if email isn't configured, so
this can't be used to verify someone else's address.

### Scene 2 — Register an agent under that operator (0:50–1:30)
Narrate step **[2]**: a fresh key → a DID → registered under the verified operator.
Call out the honest trust model: **30 / RESTRICTED** for zero history.

### Scene 3 — The autonomous agent (1:30–2:30, the core v2 beat)
Narrate step **[3]** — `atlas_agent.py`:
> "Atlas is a Python agent. We hand it a spend budget **once**. From there it hits a
> paid API, gets a 402, and the fourotwo Python SDK signs and retries on its own —
> there is no approval prompt. It pays four times back to back, fully autonomously."

Show `atlas_agent.py` briefly: the only control is `SpendBudget(...)`.

### Scene 4 — Batch settlement (2:30–3:30)
Narrate step **[4]**:
> "Those four payments didn't each hit the chain. They queued, and we flush them as
> **one** SettlementVault record — that's the gas saving. If the on-chain write
> fails, they're reported failed, never a phantom 'confirmed'."

Show the single `batchId` / vault record covering all four payments.

### Scene 5 — Close (3:30–4:00)
> "v2: operators onboard by magic link, agents pay autonomously from a budget in
> Python or TypeScript, and low-value payments batch into one on-chain record —
> with durable, multi-instance settlement state behind it."

---

## 4. Files

| File | Role |
| --- | --- |
| `run.mjs` | Orchestrator: health checks → magic link → register → spawn Atlas → flush batch. |
| `atlas_agent.py` | The autonomous agent. Budget in, payments out; the SDK handles every 402. |

---

## 5. Extend — settle through the Casper x402 Facilitator (CSPR.cloud)

The batch flow above settles via our own broadcaster. v2 can instead **extend the
official [Casper x402 Facilitator](https://docs.cspr.cloud/x402-facilitator-api)**
(`https://x402-facilitator.cspr.cloud`): we keep trust + receipts + batching, and
delegate the on-chain settle to Casper. That facilitator's `exact` scheme settles
**CEP-18** tokens authorized by an **EIP-712** `transfer_with_authorization`
signature — a different signature than our native-CSPR path — so the SDK ships a
dedicated signer for it.

**The flow**

1. The merchant returns 402 with x402 `paymentRequirements` (CEP-18 `asset`,
   `payTo`, `amount`, and `extra` = token name/version/decimals/symbol).
2. The agent signs a Casper-x402 payment with the TypeScript SDK:

   ```ts
   import { keypairFromPrivateKey, createCasperX402Payment, verifyCasperX402Payment } from '@fourotwo/agent-sdk';

   const keypair = keypairFromPrivateKey(process.env.FOUROTWO_PRIVATE_KEY);

   const payment = createCasperX402Payment({
     keypair,
     paymentRequirements,               // the 402 body from the merchant
     resourceUrl: 'https://api.example.com/data',
   });

   // Confirm the signature is accepted before relying on it:
   const check = await verifyCasperX402Payment({
     facilitatorUrl: 'https://x402-facilitator.cspr.cloud',
     accessToken: process.env.UPSTREAM_FACILITATOR_ACCESS_TOKEN,
     paymentRequirements,
     payment,
   });
   console.log(check.isValid ? 'accepted' : `rejected: ${check.invalidReason}`);
   ```

   `createCasperX402Payment` is a faithful port of make-software/casper-x402's
   reference client (EIP-712 digest via `@casper-ecosystem/casper-eip-712`,
   ed25519 signature tagged `01`, `from`/`to` as `00`+account-hash).
3. Our facilitator, configured with `UPSTREAM_FACILITATOR_URL`, forwards the
   signed `{ paymentPayload, paymentRequirements }` to the upstream `/settle`
   verbatim ([`UpstreamFacilitatorClient.settlePayload`](../../services/facilitator/src/settlement/upstream-facilitator.ts)),
   then still writes the trust update, signed receipt and (optionally) a
   SettlementVault record on top.

**Turn it on** (facilitator env):

```bash
UPSTREAM_FACILITATOR_URL=https://x402-facilitator.cspr.cloud
UPSTREAM_FACILITATOR_ACCESS_TOKEN=<cspr.cloud access token>
UPSTREAM_FACILITATOR_NETWORK=casper:casper-test        # or casper:casper (mainnet)
UPSTREAM_FACILITATOR_ASSET=<CEP-18 contract package hash>
UPSTREAM_FACILITATOR_ASSET_METADATA={"name":"Cep18x402","version":"1","decimals":"2","symbol":"CSPR"}
```

> **Status — honest:** the SDK signer and the forward path are built and unit-tested,
> and `verifyCasperX402Payment` lets you confirm acceptance against the live
> `/verify`. To run it you need a CSPR.cloud access token and a real CEP-18 asset
> hash + its token metadata; those aren't bundled here. Until you've seen
> `/verify` return `isValid: true` with your asset, treat this path as staged, not
> proven end-to-end.

---

## 6. Troubleshooting

- **`EMAIL_NOT_CONFIGURED` / no magic link** — add `KYX_DEV_TOKEN_EMAILS=atlas@fourotwo.dev`
  to the registry, or configure SMTP.
- **`nothing queued` at step 4** — `BATCH_AUTO_THRESHOLD_MOTES` is `0` or below the
  payment amount, so payments settled directly. Raise it above the amount.
- **`ADMIN_AUTH_NOT_CONFIGURED` / 503 on flush** — set `FACILITATOR_ADMIN_TOKEN` on
  both the facilitator and `run.mjs`.
- **`AGENT_NOT_REGISTERED` from `/verify`** — the registry didn't have the agent yet;
  re-run so step 2 completes before Atlas pays.
- **`could not launch "python"`** — set `PYTHON=python3` (or the full path) and
  `pip install -e packages/agent-sdk-py`.
