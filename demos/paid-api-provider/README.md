# Meridian RWA Data API - reference merchant (facilitator user)

A fleshed-out demo of the **API-provider** side of fourotwo: a data API that monetises itself with layer402. Its homepage is a real **API-doc site** that teaches users how to call the paid endpoints, and every settled call is credited to the merchant and shown live on a settlements feed.

> This is a new, richer demo. The minimal original is untouched in
> [`demos/mock-rwa-api`](../mock-rwa-api).

Pairs with the [Atlas agent app](../agent-app), which pays these endpoints.

## Run

```bash
# from the repo root - the demo imports the built packages
npm run build

cp demos/paid-api-provider/.env.example demos/paid-api-provider/.env   # optional
node demos/paid-api-provider/server.mjs
# → http://localhost:5100
```

Open `http://localhost:5100` for the API docs. By default it verifies + settles
through the **live** facilitator (`https://fourotwo-facilitator.onrender.com`).

## Endpoints

| Method | Path              |          | Description                                                                |
| ------ | ----------------- | -------- | -------------------------------------------------------------------------- |
| GET    | `/api/catalog`    | free     | Assets, prices, and the merchant payout account.                           |
| GET    | `/api/assets/:id` | **paid** | Oracle-signed data. `402` until paid; returns data + receipt once settled. |
| GET    | `/api/earnings`   | free     | Recent settlements credited to this merchant.                              |

## How it charges

1. An unpaid `GET /api/assets/:id` returns **`402`** with a `PAYMENT-REQUIRED`
   header (the encoded payment terms). CORS exposes that header so a browser
   agent can read it.
2. On the paid retry (`PAYMENT-REQUIRED` + `PAYMENT-SIGNATURE` + `X-FOUROTWO-DID`
   headers), the server calls the facilitator's `/verify` then `/settle`.
3. On success it records the settlement (credit) and returns the dataset plus the
   facilitator-signed receipt.

## Config (`.env`)

| Var                  | Default                 |                                                                       |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `PORT`               | `5100`                  |                                                                       |
| `FACILITATOR_URL`    | live Render facilitator | verify/settle target                                                  |
| `MERCHANT_RECIPIENT` | _(mints a wallet)_      | real casper-test account hash to receive funds; blank → ephemeral one |
| `CORS_ORIGIN`        | `*`                     | the agent-app origin in production                                    |
| `CASPER_EXPLORER_URL`| `https://testnet.cspr.live` | base for the settlement links                                   |

For real native CSPR settlement, `MERCHANT_RECIPIENT` should be the recipient's
tagged Casper public key (`01...` for ed25519 or `02...` for secp256k1). Casper
account hashes are accepted for display compatibility, but Atlas cannot build a
real native transfer deploy from an account hash alone.

> Real funds move: the paying agent broadcasts an **actual native CSPR transfer**
> to `MERCHANT_RECIPIENT`, and the merchant records that deploy hash - the
> earnings feed links each one as **"view transfer on cspr.live"**, alongside the
> facilitator's signed receipt. Leave `MERCHANT_RECIPIENT` blank and Meridian
> mints an ephemeral payout wallet so transfers still have a valid target; set it
> to a stable account hash you control to watch one balance grow.
