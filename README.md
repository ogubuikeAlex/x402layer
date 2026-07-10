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

> The trust & settlement layer for [x402](https://x402.org/wp-content/uploads/sites/10/2026/06/x402-whitepaper.pdf) agent payments.

layer402 lets AI agents pay for API access automatically, verifies and settles
those payments on-chain, and attaches a **portable trust score** to every agent -
so providers know who they're transacting with. It's built on the layer402 standard
and adds the compliance and reputation layer on top.

Every transaction is one loop: **pay → verify → settle → score**.

```
pay      an agent signs an layer402 payment when it gets an HTTP 402 response
verify   the facilitator checks signature, replay, balance, and trust
settle   the payment settles on-chain and returns a signed receipt
score    the agent's trust score updates from the settled payment
```

## Live services

| Service            | URL                                             |
| ------------------ | ----------------------------------------------- |
| Website | https://x402layer-dashboard.vercel.app/ |
| Facilitator API    | https://fourotwo-facilitator.onrender.com      |
| KYX trust registry | https://x402layer-kyx-registry.onrender.com |
| Demo user of agent SDK | https://atlas-research-agent.onrender.com/ |
| Demo user of Facilitator | https://meridian-fa2d.onrender.com/ |

## Smart Contracts

| Name            | URL                                             | Contract Hash |
| ------------------ | ----------------------------------------------- | ----------- |
| Settlement_Vault  | [Settlement_Vault Contract Package](https://testnet.cspr.live/contract-package/7601c68914e92175b498040af9ebc320544b20509d2b5b2339249ff967a0ecf6)      | hash-7601c68914e92175b498040af9ebc320544b20509d2b5b2339249ff967a0ecf6 |
| KYX_Registry | [KYX_Registry Contract Package](https://testnet.cspr.live/contract-package/1e2b354d2f9128b8f1c42cc12046f514292f95f7a40e3b3a9329a4f261a312d0) | hash-1e2b354d2f9128b8f1c42cc12046f514292f95f7a40e3b3a9329a4f261a312d0 |

## Published packages

| Package                                                                    | Install                     | Use                                          |
| -------------------------------------------------------------------------- | --------------------------- | -------------------------------------------- |
| [`@fourotwo/agent-sdk`](https://www.npmjs.com/package/@fourotwo/agent-sdk) | `npm i @fourotwo/agent-sdk` | Pay for layer402 APIs from an agent          |
| [`@fourotwo/types`](https://www.npmjs.com/package/@fourotwo/types)         | `npm i @fourotwo/types`     | Shared types, DID derivation, envelope codec |

## Use it in 30 seconds

```ts
import { fourotwoAgent } from "@fourotwo/agent-sdk";

const agent = new fourotwoAgent({
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY, // never leaves your process
  budget: { dailyUsd: 10, perRequestUsd: 0.5 }, // optional spend limits
});

// drop-in fetch - pays automatically when it gets a 402
const res = await agent.fetch("https://api.example.com/data/RE-NYC-001");
const data = await res.json();
```

Full integration guides - paying, accepting payments, trust, and the HTTP API
reference all live on the dashboard [**docs**](https://x402layer-dashboard.vercel.app/) page.

## Repository layout

This is an npm-workspaces + Turborepo monorepo. Rust contracts use their own
Cargo/Odra toolchain and are not built by the JS workspace.

```
packages/
  types/          @fourotwo/types    - shared types, DID derivation, envelope codec (published)
  agent-sdk/      @fourotwo/agent-sdk - drop-in fetch that handles layer402 payments (published)
services/
  facilitator/    layer402 facilitator (Fastify): /verify, /settle, /supported, /trust
  kyx-registry/   agent identity + trust registry (Fastify): operators, agents, trust
  dashboard/      Next.js app: overview, playground, docs, agents, wallet
contracts/        Casper smart contracts (Rust + Odra)
  src/kyx_registry.rs      agent identity + trust score registry
  src/settlement_vault.rs  on-chain settlement records
demos/            reference merchant (mock RWA API) + reference agent
```

## Local development

```bash
npm install
npm run build
npm run test
npm run dev
```

Run individual services:

```bash
npm run dev -w @fourotwo/facilitator     # :4001
npm run dev -w @fourotwo/kyx-registry    # :4002
npm run dev -w @fourotwo/dashboard       # :3000
```

Each service reads its own `.env`; see the `.env.example` in each service
directory for the available settings (Casper node RPC + fallbacks, contract
hashes, CSPR.cloud keys, service signing keys, CORS origins).

## On-chain

The `KyxRegistry` and `SettlementVault` contracts are written with Odra and
deployed to Casper Testnet (`casper-test`). Package hashes are recorded in
[`contracts/deployed-addresses.json`](./contracts/deployed-addresses.json) and
wired into the facilitator and registry via environment variables.

## License & Terms of Service

Copyright (c) 2026. All rights reserved.
