# fourotwo-agent-sdk (Python)

Python SDK for automatic layer402 payment handling — the Python twin of
[`@fourotwo/agent-sdk`](../agent-sdk). Same DID derivation, same canonical
envelope signing, so a Python agent is verified by the same facilitator with
no server-side changes.

## Install

```bash
pip install ./packages/agent-sdk-py          # from the monorepo
# or once published:
pip install fourotwo-agent-sdk
```

Requires Python ≥ 3.9. Dependencies: `cryptography` (ed25519), `httpx`.

## Usage

```python
import os
from fourotwo import FourotwoAgent, SpendBudget

agent = FourotwoAgent(
    private_key_hex=os.environ["FOUROTWO_PRIVATE_KEY"],   # 32-byte ed25519 seed, hex
    budget=SpendBudget(daily_tokens=10.0, per_request_tokens=0.5),  # whole tokens
)

# 402s are handled automatically: decode terms -> budget check -> sign -> retry
response = agent.get("https://meridian-fa2d.onrender.com/api/assets/RE-NYC-001")
data = response.json()

# httpx-session style also works
with agent.session() as s:
    data = s.get("https://meridian-fa2d.onrender.com/api/assets/RE-NYC-001").json()

print(agent.did)                    # did:fourotwo:casper:<account-hash>
print(agent.get_transaction_log())  # local spend ledger
```

## What happens on a 402

1. Read + decode the `PAYMENT-REQUIRED` envelope
2. Check the spend budget (daily / per-request limits, in whole tokens)
3. Sign the canonical envelope bytes with the agent's ed25519 key
4. Retry with `PAYMENT-REQUIRED` (original bytes), `PAYMENT-SIGNATURE`, and `X-FOUROTWO-DID` headers
5. Log the result to the local ledger

## Keys

```python
from fourotwo import generate_casper_keypair, keypair_from_private_key

kp = generate_casper_keypair()      # ephemeral (unfunded) key for dry runs
kp = keypair_from_private_key("<64-char hex seed>")
kp.did, kp.tagged_public_key_hex    # 01-tagged Casper ed25519 public key
```

Only ed25519 keys are supported — fourotwo signs and verifies with ed25519.

## Tests

```bash
python -m pytest packages/agent-sdk-py/tests
```

`tests/vectors.json` is generated from the TypeScript SDK
(`node packages/agent-sdk-py/tests/generate-vectors.mjs` after `turbo build`),
so the suite proves both SDKs produce byte-identical DIDs, canonical messages,
and signatures.
