# Atlas - reference agent app (agent-sdk user)

A fleshed-out demo of the **consumer** side of fourotwo: a browser app whose agent
buys data from a paid API. Its headline feature is a **global `window.fetch`
interceptor** - when any request returns `402`, the UI blocks and shows a payment
approval modal with the wallet balance, the amount to be deducted, and the
projected balance after. Signing and settlement happen **server-side** via
[`@fourotwo/agent-sdk`](../../packages/agent-sdk), so the private key never
touches the browser.

> New demo. The minimal terminal version is untouched in
> [`demos/rwa-oracle-agent`](../rwa-oracle-agent).

Pairs with the [Meridian paid API](../paid-api-provider), which it pays.

## Run (both apps)

```bash
# from the repo root
npm run build

# 1) start the paid API (terminal A)
node demos/paid-api-provider/server.mjs        # :5100

# 2) configure the agent wallet, then start Atlas (terminal B)
cp demos/agent-app/.env.example demos/agent-app/.env
#   → set AGENT_PRIVATE_KEY_HEX to a FUNDED casper-test key (see below)
node demos/agent-app/server.mjs                # :5200
```

Open `http://localhost:5200`, pick a dataset, and click **Pull data**. Atlas
calls the paid API, the interceptor catches the `402`, and you approve the spend.

## The demo flow

```
browser: fetch(MERIDIAN/api/assets/RE-NYC-001)   ← plain fetch, no payment
   ↓ 402 + PAYMENT-REQUIRED (interceptor catches it)
browser → /api/pay/preview   ← decode terms, read balance → breakdown modal
   ↓ user clicks "Approve & pay"
browser → /api/pay/execute   ← backend: (1) broadcasts a REAL native CSPR transfer
                                to the merchant, (2) signs the x402 envelope + retries
   ↓ merchant verifies + settles via the facilitator, returns data + receipt
browser: interceptor resolves the original fetch; result links the transfer on cspr.live
```

## Real on-chain settlement (funds actually move)

On approval the backend signs and broadcasts an **actual native CSPR transfer**
from the agent's wallet to the merchant's account. Only the payer can authorise
moving its own funds, so this is signed agent-side; the facilitator still verifies
the payment and issues the signed receipt. The response includes a real deploy
hash, surfaced as a **"view transfer on cspr.live"** link in both apps.

Requirements for a real transfer to land:
- a **funded** ed25519 agent key (below),
- a reachable **Casper testnet RPC** - set `CASPER_NODE_RPC` (and
  `CASPER_NODE_RPC_FALLBACKS`, comma-separated) if the default node is blocked
  from your network. RPCs are tried in order.

Native transfers have a **2.5 CSPR protocol minimum**; the demo asset prices are
all ≥ 2.5 CSPR for this reason. With an unfunded key the transfer is skipped and
the rest of the flow still runs.

## Registration (so the agent appears on /agents)

A fourotwo DID is *derived* from the keypair - deterministic, computable offline -
but **derivation is not registration**. On startup Atlas runs the operator
magic-link + `/agents/register` flow against `KYX_REGISTRY_URL`, so the agent
shows up on the dashboard's `/agents` page with a trust score. Configure
`AGENT_OPERATOR_EMAIL` / `AGENT_NAME`, or set `AGENT_AUTO_REGISTER=false` to skip.

## The agent wallet

The demo wallet **must be an ed25519 key** - fourotwo signs (and the facilitator
verifies) with ed25519 only. A secp256k1 Casper key (its PEM says
`BEGIN EC PRIVATE KEY`) will **not** work anywhere in the payment path.

Your Casper wallet exports a `secret_key.pem`, not a hex string - so just point
the app at it. Provide the key any one of these ways (checked in order):

| Env var | What to put |
| --- | --- |
| `AGENT_SECRET_KEY_PATH` | Path to your `secret_key.pem` (easiest). |
| `AGENT_SECRET_KEY_PEM` | The PEM inline, or its base64 (good for hosting). |
| `AGENT_PRIVATE_KEY_HEX` | Raw 32-byte ed25519 seed as hex (advanced). |

Inspect a key (prints DID, account hash to fund, and the hex seed) - also a handy
PEM→hex converter:

```bash
node demos/agent-app/keyinfo.mjs /path/to/secret_key.pem
```

Don't have an ed25519 key? Create one and fund it:

```bash
casper-client keygen -a ed25519 ./my-agent-key      # writes secret_key.pem
node demos/agent-app/keyinfo.mjs ./my-agent-key/secret_key.pem   # shows account hash
# fund that account at https://testnet.cspr.live/tools/faucet
```

Leave all three unset for a dry run: an ephemeral (unfunded) ed25519 key is
generated, the full flow still runs, and the modal marks the balance as illustrative.

## Backend endpoints (browser-facing)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/wallet` | Agent DID, account hash, live balance. |
| POST | `/api/pay/preview` | Decode 402 terms → `{ amount, balance, after }`. |
| POST | `/api/pay/execute` | Sign + retry the paid request; return data + receipt + balances. |

## Config (`.env`)

| Var | Default | |
| --- | --- | --- |
| `PORT` | `5200` | |
| `AGENT_PRIVATE_KEY_HEX` | _(ephemeral)_ | funded casper-test seed, hex |
| `MERCHANT_URL` | `http://localhost:5100` | the paid API to buy from |
| `CSPR_CLOUD_API_URL` | testnet CSPR.cloud | balance reads |
| `CSPR_CLOUD_API_KEY` | _(none)_ | optional |
