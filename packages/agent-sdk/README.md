# @fourotwo/agent-sdk

```
  /$$$$$$                               /$$$$$$    /$$                            
 /$$__  $$                             /$$__  $$  | $$                            
| $$  \__//$$$$$$  /$$   /$$  /$$$$$$ | $$  \ $$ /$$$$$$   /$$  /$$  /$$  /$$$$$$ 
| $$$$   /$$__  $$| $$  | $$ /$$__  $$| $$  | $$|_  $$_/  | $$ | $$ | $$ /$$__  $$
| $$_/  | $$  \ $$| $$  | $$| $$  \__/| $$  | $$  | $$    | $$ | $$ | $$| $$  \ $$
| $$    | $$  | $$| $$  | $$| $$      | $$  | $$  | $$ /$$| $$ | $$ | $$| $$  | $$
| $$    |  $$$$$$/|  $$$$$$/| $$      |  $$$$$$/  |  $$$$/|  $$$$$/$$$$/|  $$$$$$/
|__/     \______/  \______/ |__/       \______/    \___/   \_____/\___/  \______/ 
                                                                                  
```
> A drop-in `fetch` that pays for [x402](https://www.x402.org/)-gated APIs automatically.

When your agent calls an API that answers with **HTTP 402 Payment Required**, this
SDK detects it, checks your spend budget, signs the payment with the agent's key,
retries the request, and logs every payment transparently. You call `fetch`;
it handles the money.

Part of [fourotwo](https://x402layer-dashboard.vercel.app/docs): the trust & settlement layer for agent payments.

## Install

```bash
npm install @fourotwo/agent-sdk
```

## Quickstart

```ts
import { fourotwoAgent } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY, // signs locally, never sent
  budget: { dailyUsd: 10, perRequestUsd: 0.5 },    // optional spend caps
});

// behaves exactly like fetch but pays when it has to
const res = await agent.fetch('https://api.example.com/data/RE-NYC-001');
const data = await res.json();
```

The agent's DID is derived from your key automatically. Pass `did` explicitly only
if you registered under a specific identity.

## Generate an agent key

```ts
import { generateCasperKeypair } from '@fourotwo/agent-sdk';

const { privateKeyHex, publicKeyHex, did } = generateCasperKeypair();
// store privateKeyHex somewhere safe because it is the agent's identity + wallet
```

## What happens on a 402

```
1. Your call gets a 402 + a PAYMENT-REQUIRED header
2. The SDK decodes the terms (amount, recipient, network, expiry, nonce)
3. It checks your budget — throws BudgetExceededError if over
4. It signs the canonical payment envelope with your key
5. It retries with PAYMENT-SIGNATURE + X-FOUROTWO-DID headers attached
6. On success it commits the spend and logs the payment to the ledger
```

## Spend budgets

Budgets **reject** — they do not queue. If a payment would exceed a limit, the SDK
throws `BudgetExceededError` **before** anything is signed, so a runaway loop can
never drain the wallet. The daily counter resets at UTC midnight.

```ts
import { fourotwoAgent, BudgetExceededError } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY,
  budget: { dailyUsd: 25, perRequestUsd: 1 },
});

try {
  await agent.fetch(url);
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.warn(`over budget (${err.scope}):`, err.message); // scope: 'daily' | 'per-request'
  }
}
```

## Constructor options

| Option | Type | Notes |
| --- | --- | --- |
| `privateKeyHex` | `string` **(required)** | Agent signing key. Stays in your process. |
| `did` | `string` | Defaults to the DID derived from the key. |
| `publicKeyHex` | `string` | Override the derived public key (rarely needed). |
| `budget` | `SpendBudget` | `{ dailyUsd?, perRequestUsd?, amountToUsd? }`. |
| `logFilePath` | `string` | Where to persist the transaction ledger. |
| `fetchImpl` | `typeof fetch` | Custom fetch (tracing, tests, proxies). |

## Transaction ledger

Every attempt is recorded locally — successes, failures, and budget rejections.

```ts
const log = agent.getTransactionLog();
// [{ did, amount, recipient, network, status, responseStatus, ... }]
// status: 'success' | 'failed' | 'budget_rejected'
```

## Also exported

`generateCasperKeypair`, `keypairFromPrivateKey`, `deriveAgentDid`,
`signPayment`, `readPaymentRequiredHeader`, `TransactionLedger`, and the error
types `BudgetExceededError`, `PaymentExpiredError`, `PaymentRequiredHeaderError`,
`PaymentSigningError`.

## License & Terms of Service

Copyright (c) 2026. All rights reserved.

This repository is publicly visible for educational and review purposes only. By viewing this repository, you agree to the following terms:

* **No Duplication:** You may not copy, duplicate, reproduce, or clone this source code, in whole or in part, outside of the GitHub platform.
* **No Modification or Distribution:** You may not modify, distribute, publish, sub-license, or sell this code under any circumstances.
* **GitHub Platform Exception:** In accordance with the GitHub Terms of Service, you are permitted to view and fork this repository strictly within GitHub for your own personal use. 

Any unauthorized copying or use of this software constitutes copyright infringement.
