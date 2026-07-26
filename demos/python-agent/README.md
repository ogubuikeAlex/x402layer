# Python-agent demo — the layer402 loop from Python

A terminal agent built on the **Python SDK** (`packages/agent-sdk-py`). It
browses the Meridian catalog (free), buys one asset (paid — the SDK detects
the 402, signs the payment envelope with its ed25519 key, and retries), and
prints the settled data, the facilitator-signed receipt, and the SDK's local
spend ledger.

## Run

```bash
pip install -e packages/agent-sdk-py        # once, from the repo root
python demos/python-agent/agent.py
```

Defaults to the live Meridian API. Env:

| Var | Default | Meaning |
| --- | --- | --- |
| `MERCHANT_URL` | `https://meridian-fa2d.onrender.com` | Paid API to buy from |
| `FOUROTWO_PRIVATE_KEY` | *(ephemeral key)* | Funded casper-test **ed25519** seed hex |
| `ASSET_ID` | first catalog entry | Which asset to buy |

Without `FOUROTWO_PRIVATE_KEY` the agent runs with an ephemeral unfunded key —
fine when the facilitator's balance check is best-effort, but fund a key for
the full experience (`node demos/agent-app/keyinfo.mjs` to inspect one).
