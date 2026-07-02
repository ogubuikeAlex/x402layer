# @fourotwo/types

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

> Shared types, DID derivation, and the x402 payment-envelope codec for [fourotwo](https://x402layer-dashboard.vercel.app/docs).

The single source of truth for the shapes and byte formats used across the
fourotwo facilitator, registry, SDK, and dashboard. Because every component
imports the same package, DIDs and signed payloads are byte-identical everywhere ensuring
no drift between signer and verifier.

Most agent developers use [`@fourotwo/agent-sdk`](https://www.npmjs.com/package/@fourotwo/agent-sdk) and never import this directly. Reach for it when you build a **server** that
accepts payments, or need DID/envelope primitives on their own.

## Install

```bash
npm install @fourotwo/types
```

## DID derivation

A fourotwo agent DID is `did:fourotwo:{network}:{address}`, derived deterministically
from a public key (Casper → blake2b account hash, Base → EVM address).

```ts
import { deriveDid, deriveAddress, parseDid } from '@fourotwo/types';

const did = deriveDid('casper', publicKeyHex);
// did:fourotwo:casper:3d5de8c609159a0954e773dd686fb7724428316cb30e00bdc...

const { network, address } = parseDid(did);
```

## Payment envelope codec

The `PAYMENT-REQUIRED` envelope a server sends on a 402, and the canonical bytes
that get signed. Use `encodeEnvelope` when issuing a 402; the signer and verifier
both sign `canonicalPaymentBytes` so signatures always line up.

```ts
import { encodeEnvelope, decodeEnvelope, canonicalPaymentBytes } from '@fourotwo/types';

const header = encodeEnvelope({
  amount: '5000',                 // smallest unit (motes / wei)
  recipient: 'account-hash-...',
  network: 'casper',
  token: 'CSPR',
  expiry: Math.floor(Date.now() / 1000) + 600,
  nonce: 'unique-per-request',    // replay protection
  facilitator: 'https://fourotwo-facilitator.onrender.com',
  minTrustScore: 40,              // optional gating
});

res.writeHead(402, { 'PAYMENT-REQUIRED': header });
```

## What's exported

- **DID / addresses** — `deriveDid`, `deriveAddress`, `formatDid`, `parseDid`,
  `isValidDid`, `casperAccountHash`, `baseAddress`, `DID_METHOD`
- **Envelope codec** — `encodeEnvelope`, `decodeEnvelope`, `canonicalPaymentBytes`,
  `canonicalPaymentMessage`
- **Trust helpers** — `tierForScore`, `TIER_COLOR`
- **Types** — `PaymentRequired`, `PaymentPayload`, `VerifyRequest`, `VerifyResponse`,
  `SettleRequest`, `SettleResponse`, `SettlementReceipt`, `SupportedResponse`,
  `TrustScore`, `TrustTier`, `TrustDimensions`, `ChainNetwork`, `SettlementMode`,
  and more.

## License & Terms of Service

Copyright (c) 2026. All rights reserved.

This repository is publicly visible for educational and review purposes only. By viewing this repository, you agree to the following terms:

* **No Duplication:** You may not copy, duplicate, reproduce, or clone this source code, in whole or in part, outside of the GitHub platform.
* **No Modification or Distribution:** You may not modify, distribute, publish, sub-license, or sell this code under any circumstances.
* **GitHub Platform Exception:** In accordance with the GitHub Terms of Service, you are permitted to view and fork this repository strictly within GitHub for your own personal use. 

Any unauthorized copying or use of this software constitutes copyright infringement.

