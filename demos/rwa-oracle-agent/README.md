# RWA Oracle Agent (demo)

The first fourotwo SDK consumer. It uses `@fourotwo/agent-sdk`
to fetch data from the mock RWA API and completes a full **402 → pay → settle → data** cycle with zero manual signing. Every step is logged for demo narration.

## Run the full loop

Three processes, from the repo root:

```bash
# 1. facilitator (verify/settle)
npm run dev -w @fourotwo/facilitator          # :4001

# 2. mock RWA merchant (402-gated)
node demos/mock-rwa-api/server.js             # :5000

# 3. the agent
node demos/rwa-oracle-agent/agent.mjs
```

Expected output (abridged):

```
[1] Agent identity
    DID  did:fourotwo:casper:…
[2] Fetching RWA data: GET http://localhost:5000/data/RE-NYC-001
[3] 402 Payment Required received
[4] Retried with payment - server responded 200
[5] Data received ✓
[6] Signed settlement receipt
[7] Local transaction ledger
    ✓ success  5000 CSPR → account-hash-merchant
  ✓ Full layer402 loop completed with zero manual signing.
```

## Full stack with trust scoring

Start the KYX registry too and point the agent at it so it self-registers
(operator email → verify → register) and earns a real trust score:

```bash
npm run dev -w @fourotwo/kyx-registry         # :4002
# tell the facilitator to use it
KYX_REGISTRY_URL=http://localhost:4002 npm run dev -w @fourotwo/facilitator
# run the agent against the registry
KYX_REGISTRY_URL=http://localhost:4002 node demos/rwa-oracle-agent/agent.mjs
```

## Env

| Var                                     | Default                 | Purpose                                 |
| --------------------------------------- | ----------------------- | --------------------------------------- |
| `MOCK_RWA_URL`                          | `http://localhost:5000` | mock merchant base URL                  |
| `ASSET_ID`                              | `RE-NYC-001`            | asset to fetch                          |
| `FOUROTWO_PRIVATE_KEY`                  | generated               | hex ed25519 secret (reuse the same DID) |
| `KYX_REGISTRY_URL`                      | -                       | if set, the agent self-registers first  |
| `OPERATOR_EMAIL`                        | `oracle@fourotwo.dev`   | operator email for registration         |
| `AGENT_DAILY_USD` / `AGENT_PER_REQ_USD` | `10` / `1`              | spend budget limits                     |
