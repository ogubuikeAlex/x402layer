# fourotwo

```

 /$$$$$$$$                                   /$$$$$$$$
| $$_____/                                  |__  $$__/
| $$     /$$$$$$  /$$   /$$  /$$$$$$   /$$$$$$ | $$ /$$  /$$  /$$  /$$$$$$
| $$$$$ /$$__  $$| $$  | $$ /$$__  $$ /$$__  $$| $$| $$ | $$ | $$ /$$__  $$
| $$__/| $$  \ $$| $$  | $$| $$  \__/| $$  \ $$| $$| $$ | $$ | $$| $$  \ $$
| $$   | $$  | $$| $$  | $$| $$      | $$  | $$| $$| $$ | $$ | $$| $$  | $$
| $$   |  $$$$$$/|  $$$$$$/| $$      |  $$$$$$/| $$|  $$$$$/$$$$/|  $$$$$$/
|__/    \______/  \______/ |__/       \______/ |__/ \_____/\___/  \______/

```

> The trust & settlement layer for [layer402](layer402layer-dashboard.vercel.app) agent payments.

fourotwo lets AI agents pay for API access automatically, verifies and settles
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
| Facilitator API    | https://fourotwo-facilitator.onrender.com       |
| KYX trust registry | https://layer402layer-kyx-registry.onrender.com |

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
reference all live on the dashboard [**docs**](https://layer402layer-dashboard.vercel.app/docs) page.

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

This repository is publicly visible for educational and review purposes only. By viewing this repository, you agree to the following terms:

- **No Duplication:** You may not copy, duplicate, reproduce, or clone this source code, in whole or in part, outside of the GitHub platform.
- **No Modification or Distribution:** You may not modify, distribute, publish, sub-license, or sell this code under any circumstances.
- **GitHub Platform Exception:** In accordance with the GitHub Terms of Service, you are permitted to view and fork this repository strictly within GitHub for your own personal use.

Any unauthorized copying or use of this software constitutes copyright infringement.
