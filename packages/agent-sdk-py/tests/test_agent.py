
import base64
import json
from pathlib import Path

import httpx
import pytest

from fourotwo import (
    BudgetExceededError,
    FourotwoAgent,
    SpendBudget,
    canonical_payment_bytes,
    encode_envelope,
)

VECTORS = json.loads((Path(__file__).parent / "vectors.json").read_text("utf-8"))
SEED = VECTORS["seed"]
PAYMENT = VECTORS["paymentRequired"]


def make_agent(budget=None):
    seen = {"paid_request": None}

    def merchant(request: httpx.Request) -> httpx.Response:
        if "payment-signature" not in request.headers:
            return httpx.Response(
                402, headers={"PAYMENT-REQUIRED": encode_envelope(PAYMENT)}
            )
        seen["paid_request"] = request
        return httpx.Response(200, json={"ok": True, "asset": "RE-NYC-001"})

    client = httpx.Client(transport=httpx.MockTransport(merchant))
    agent = FourotwoAgent(private_key_hex=SEED, budget=budget, client=client)
    return agent, seen


def test_pays_and_retries_transparently():
    agent, seen = make_agent()
    res = agent.get("https://merchant.test/api/assets/RE-NYC-001")
    assert res.status_code == 200
    assert res.json()["ok"] is True

    paid = seen["paid_request"]
    assert paid.headers["x-fourotwo-did"] == agent.did
    # The retried envelope is the merchant's original bytes, untouched.
    assert paid.headers["payment-required"] == encode_envelope(PAYMENT)
    # The signature verifies against the canonical bytes with the agent's key.
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    sig_envelope = json.loads(base64.b64decode(paid.headers["payment-signature"]))
    public = Ed25519PublicKey.from_public_bytes(bytes.fromhex(sig_envelope["payer"][2:]))
    public.verify(bytes.fromhex(sig_envelope["signature"]), canonical_payment_bytes(PAYMENT))

    log = agent.get_transaction_log()
    assert len(log) == 1 and log[0].status == "success"


def test_non_402_passthrough():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"free": True})

    agent = FourotwoAgent(
        private_key_hex=SEED, client=httpx.Client(transport=httpx.MockTransport(handler))
    )
    assert agent.get("https://merchant.test/free").json() == {"free": True}
    assert agent.get_transaction_log() == []


def test_budget_blocks_payment():
    # 5e9 motes CSPR (9 decimals) = 5 CSPR, over the 0.01-token per-request cap.
    agent, seen = make_agent(budget=SpendBudget(per_request_tokens=0.01))
    with pytest.raises(BudgetExceededError):
        agent.get("https://merchant.test/api/assets/RE-NYC-001")
    assert seen["paid_request"] is None
    log = agent.get_transaction_log()
    assert len(log) == 1 and log[0].status == "budget_rejected"
