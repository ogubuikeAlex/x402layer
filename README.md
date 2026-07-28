# layer402

```
 ___      _______  __   __  _______  ______    _   ___  _______  _______
|   |    |   _   ||  | |  ||       ||    _ |  | | |   ||  _    ||       |
|   |    |  |_|  ||  |_|  ||    ___||   | ||  | |_|   || | |   ||____   |
|   |    |       ||       ||   |___ |   |_||_ |       || | |   | ____|  |
|   |___ |       ||_     _||    ___||    __  ||___    || |_|   || ______|
|       ||   _   |  |   |  |   |___ |   |  | |    |   ||       || |_____
|_______||__| |__|  |___|  |_______||___|  |_|    |___||_______||_______|
```

> The trust, identity, and settlement layer for x402 agent payments on Casper.

[v1 project demo](https://www.youtube.com/watch?v=7Ya90nJyGCw&feature=youtu.be)

layer402 lets AI agents pay for API access automatically, while giving API providers the missing context around those payments: who the agent is, whether its operator is verified, what its trust score is, and whether the payment was settled. It adds KYX identity, signed receipts, settlement records, batching,
fees, and SDKs on top of the x402 flow.

Every transaction follows one loop:

```txt
pay      an agent receives HTTP 402 payment terms and signs them
verify   the facilitator checks signature, replay, balance, DID, and trust
settle   the payment settles directly, batches, or delegates upstream
score    the KYX registry records settlement history and updates trust
```

## What To Find Where

- **Live Services**: deployed dashboard, facilitator, registry, and demo app URLs.
- **What It Ships**: the main product features at a glance.
- **Casper x402 Facilitator Extension**: how layer402 extends Casper's x402
  Facilitator with KYX, trust, receipts, batching, fees, and observability.
- **Smart Contracts**: Casper Testnet contract package links and hashes.
- **Published Packages**: TypeScript and Python SDK install links.
- **Use It In 30 Seconds**: the smallest SDK integration example.
- **Demo Apps**: Atlas, Meridian, batch, Python, and scripted demos.
- **Repository Layout**: where packages, services, contracts, and demos live.
- **Local Development**: how to build, test, and run the stack locally.

## Live Services

| Service | URL |
| --- | --- |
| Website / docs / dashboard | https://x402layer-dashboard.vercel.app/ |
| Facilitator API | https://fourotwo-facilitator.onrender.com |
| KYX trust registry | https://x402layer-kyx-registry.onrender.com |
| Atlas agent demo | https://atlas-research-agent.onrender.com/ |
| Meridian merchant demo | https://meridian-fa2d.onrender.com/ |

## What It Ships

- **x402-compatible facilitator** with `/verify`, `/settle`, `/supported`, batch,
  fee, and health endpoints.
- **KYX registry** for operator magic-link verification, agent registration,
  DID lookup, trust scoring, and settlement history.
- **Portable agent DID model** derived from Casper public keys:
  `did:fourotwo:casper:<account-hash>`.
- **Trust-gated payments**: merchants can require a minimum agent trust score
  before serving a paid API response.
- **Signed settlement receipts**: every successful settlement returns an
  Ed25519-signed receipt the merchant and agent can keep.
- **Casper SettlementVault records** for auditable on-chain settlement metadata.
- **Batch settlement** for low-value/high-frequency calls: many payments can
  collapse into one SettlementVault record.
- **Platform fees** with accrual, reporting, and optional native CSPR collection.
- **TypeScript SDK** with a drop-in `agent.fetch(...)` that catches 402 responses,
  signs, retries, budgets spend, and logs transactions.
- **Python SDK** for autonomous agents using the same pay/verify/settle flow.
- **Reference apps**: Atlas, an agent UI with a global fetch interceptor, and Meridian, a paid RWA data API with a live settlements feed.

## Casper x402 Facilitator Extension

layer402 explicitly **extends the Casper x402 Facilitator** instead of replacing
it.

The native layer402 facilitator can verify and settle payments itself, but it can
also be configured with:

```env
UPSTREAM_FACILITATOR_URL=https://x402-facilitator.cspr.cloud
UPSTREAM_FACILITATOR_ACCESS_TOKEN=<cspr.cloud access token>
UPSTREAM_FACILITATOR_NETWORK=casper:casper-test
UPSTREAM_FACILITATOR_ASSET=<CEP-18 contract package hash>
UPSTREAM_FACILITATOR_ASSET_METADATA={"name":"...","version":"1","decimals":"...","symbol":"..."}
```

When enabled, layer402 forwards Casper x402 signed payloads to the upstream
Casper x402 Facilitator for CEP-18 settlement, then adds the layer402 features
around it: KYX trust checks, DID validation, signed receipts, settlement
reporting, batch-aware routing, and dashboard visibility.

In other words: Casper x402 handles the core x402 settlement path; layer402 adds
identity, trust, receipts, batching, fees, and application-level observability.

## Smart Contracts

| Name | URL | Contract Hash |
| --- | --- | --- |
| SettlementVault | [SettlementVault contract package](https://testnet.cspr.live/contract-package/7601c68914e92175b498040af9ebc320544b20509d2b5b2339249ff967a0ecf6) | `hash-7601c68914e92175b498040af9ebc320544b20509d2b5b2339249ff967a0ecf6` |
| KYXRegistry | [KYXRegistry contract package](https://testnet.cspr.live/contract-package/1e2b354d2f9128b8f1c42cc12046f514292f95f7a40e3b3a9329a4f261a312d0) | `hash-1e2b354d2f9128b8f1c42cc12046f514292f95f7a40e3b3a9329a4f261a312d0` |

Contract addresses are also recorded in
[`contracts/deployed-addresses.json`](./contracts/deployed-addresses.json).

## Published Packages

| Package | Install | Use |
| --- | --- | --- |
| [`@fourotwo/agent-sdk`](https://www.npmjs.com/package/@fourotwo/agent-sdk) | `npm i @fourotwo/agent-sdk` | TypeScript agent SDK for automatic x402 payments |
| [`@fourotwo/types`](https://www.npmjs.com/package/@fourotwo/types) | `npm i @fourotwo/types` | Shared types, DID derivation, and envelope encoding |
| [`fourotwo-agent-sdk`](https://pypi.org/project/fourotwo-agent-sdk/1.0.0/) | `pip install fourotwo-agent-sdk` | Python agent SDK |

## Use It In 30 Seconds

```ts
import { fourotwoAgent } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY,
  budget: { dailyTokens: 10, perRequestTokens: 0.5 },
});

const res = await agent.fetch('https://api.example.com/data/RE-NYC-001');
const data = await res.json();
```

The SDK automatically:

- detects `402 Payment Required`,
- reads the `PAYMENT-REQUIRED` header,
- signs the canonical envelope,
- attaches `PAYMENT-SIGNATURE` and `X-FOUROTWO-DID`,
- retries the request,
- records the transaction in the local ledger.

Full guides for agents, merchants, trust, and facilitator APIs live in the
[dashboard docs](https://x402layer-dashboard.vercel.app/docs).

## Demo Apps

| Demo | Path | What it shows |
| --- | --- | --- |
| Atlas agent app | `demos/agent-app` | Browser agent with global 402 fetch interceptor, wallet view, auto-pay mode, server-side signing, KYX registration, and optional native CSPR transfer |
| Meridian paid API | `demos/paid-api-provider` | Merchant API that returns 402 terms, verifies/settles retries through the facilitator, and shows a live earnings feed |
| v2 demo | `demos/v2-demo` | Magic-link operator verification, agent registration, Python autonomous payments, and batched settlement |
| Batch stream demo | `demos/batch-stream-demo` | High-frequency paid calls collapsed into one batch settlement |
| Python agent | `demos/python-agent` | Terminal agent using the Python SDK against Meridian |
| RWA oracle agent | `demos/rwa-oracle-agent` | Minimal TypeScript terminal agent for the pay/verify/settle loop |
| Mock RWA API | `demos/mock-rwa-api` | Small local merchant used by scripted demos |

## Repository Layout

This is an npm workspaces + Turborepo monorepo. Rust contracts use their own
Cargo/Odra toolchain and are not built by the JS workspace.

```txt
packages/
  types/          shared types, DID derivation, envelope codec
  agent-sdk/      TypeScript SDK for x402 payments
  agent-sdk-py/   Python SDK for x402 payments
services/
  facilitator/    Fastify facilitator: verify, settle, batch, fees, receipts
  kyx-registry/   Fastify KYX service: operators, agents, trust, settlements
  dashboard/      Next.js app: overview, playground, docs, agents, wallet
contracts/
  src/kyx_registry.rs      agent identity + trust score registry
  src/settlement_vault.rs  on-chain settlement records
demos/
  paid-api-provider/   Meridian merchant
  agent-app/           Atlas agent
  v2-demo/             scripted v2 demo
  batch-stream-demo/   batched payment demo
  python-agent/        Python SDK demo
  rwa-oracle-agent/    minimal terminal agent
  mock-rwa-api/        minimal mock merchant
```

## Local Development

```bash
npm install
npm run build
npm run test
```

Run the core services:

```bash
npm run dev -w @fourotwo/kyx-registry    # :4002
npm run dev -w @fourotwo/facilitator     # :4001
npm run dev -w @fourotwo/dashboard       # :3000
```

Run the paired Atlas/Meridian demo:

```bash
node demos/paid-api-provider/server.mjs   # merchant API
node demos/agent-app/server.mjs           # agent UI
```

Each service and demo reads its own `.env`; see the `.env.example` files for
Casper RPCs, contract hashes, CSPR.cloud credentials, signing keys, CORS origins,
KYX settings, and upstream Casper x402 facilitator settings.

For public judging/demo deployments, set `KYX_DEMO_OPEN_VERIFICATION=true` on the
KYX registry so testers can receive the operator verification link inline and
register agents without depending on SMTP delivery. Leave it off for production.

## License

Copyright (c) 2026. All rights reserved.
