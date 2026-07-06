# @fourotwo/facilitator

The fourotwo layer402 facilitator. Standards-compliant `/verify`, `/settle`,
`/supported` endpoints with trust enrichment and chain-adapter routing.

## Endpoints (Milestone 1)

| Method | Path         | Ticket | Notes                                       |
| ------ | ------------ | ------ | ------------------------------------------- |
| GET    | `/health`    | M1-T5  | `{ "status": "ok" }`                        |
| GET    | `/supported` | M1-T10 | Networks, tokens, features (layer402-v2)    |
| POST   | `/verify`    | M1-T8  | Verify a payment payload + attach trust     |
| POST   | `/settle`    | M1-T9  | Direct on-chain settlement + signed receipt |

## Run

```bash
cp .env.example .env     # then fill in CSPR.cloud key / contract hashes
npm run dev              # tsx watch, default port 4001
```

## Wire formats

`POST /verify` body:

```json
{
  "payment_signature": "<base64 of {\"payer\":\"<pubkey hex>\",\"signature\":\"<hex|base64>\"}>",
  "payment_required": "<base64 of the PAYMENT-REQUIRED envelope JSON>",
  "agent_did": "did:fourotwo:casper:<account-hash>"
}
```

The signature is verified over the **canonical** envelope bytes
(`canonicalPaymentMessage` in `@fourotwo/types`) - the SDK and facilitator share
that function so they never drift.

`POST /settle` body:

```json
{ "verification_id": "vrf_...", "settlement_mode": "auto" }
```

Only `auto` / `direct` are accepted in MVP (AD: direct settlement only).

## Manual test (M1 exit criteria)

```bash
# 1. start the facilitator
npm run dev

# 2. craft a valid payload and verify it
node scripts/craft-payload.mjs > /tmp/verify.json
curl -s localhost:4001/verify -H 'content-type: application/json' -d @/tmp/verify.json | jq

# 3. settle using the returned verification_id
curl -s localhost:4001/settle -H 'content-type: application/json' \
  -d "{\"verification_id\":\"<vrf_...>\"}" | jq
```

## Automated tests

```bash
npm run test
```

`src/core/verify-settle.test.ts` exercises the full verify→settle round trip with a
real ed25519 signature and a mocked Casper RPC client, plus the rejection paths
(tampered signature, replay, expiry, insufficient balance, double settlement).

## Known MVP limitations

- **Live on-chain settlement** (`adapter.settleDirect`) requires the facilitator
  service account key wired through casper-js-sdk. Until then `/settle` returns a
  signed receipt flagged `live_settlement_unconfigured` rather than fabricating a
  tx hash. See root `KNOWN_ISSUES.md`.
- **Trust scores** are stubbed (`trust_pending: true`) until the KYX Registry
  service ships in Milestone 3 (wired via M3-T6).
- **Balance check** is best-effort: if the node/CSPR.cloud is unreachable it is
  skipped and the verification is flagged `balance_check_skipped` rather than
  failing the demo.
