"""Python-SDK demo agent: buys RWA data from the Meridian paid API.

The Python twin of demos/rwa-oracle-agent - it uses the `fourotwo` package
(packages/agent-sdk-py) to drive the full layer402 loop: hit a paid endpoint,
get a 402, sign the payment envelope with an ed25519 key, retry, and read the
settled data + signed receipt.

    pip install -e packages/agent-sdk-py     # once, from the repo root
    python demos/python-agent/agent.py

Env:
    MERCHANT_URL           paid API to buy from (default: live Meridian)
    FOUROTWO_PRIVATE_KEY   funded ed25519 seed hex (optional - ephemeral if unset)
    ASSET_ID               catalog asset to buy (default: first in catalog)
"""

import os
import sys

# Windows consoles often default to cp1252, which cannot print '▸' / '✓'.
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fourotwo import FourotwoAgent, SpendBudget, generate_casper_keypair

MERCHANT_URL = os.environ.get("MERCHANT_URL", "https://meridian-fa2d.onrender.com").rstrip("/")

DIM = "\033[2m"
CYAN = "\033[36m"
GREEN = "\033[32m"
BOLD = "\033[1m"
END = "\033[0m"


def main() -> int:
    seed = os.environ.get("FOUROTWO_PRIVATE_KEY", "").strip()
    if seed:
        key_source = "FOUROTWO_PRIVATE_KEY"
    else:
        seed = generate_casper_keypair().private_key_hex
        key_source = "ephemeral (unfunded dry run)"

    agent = FourotwoAgent(
        private_key_hex=seed,
        budget=SpendBudget(per_request_tokens=10_000.0),  # generous cap, in whole tokens
    )
    print(f"\n{BOLD}▸ python-sdk demo agent{END}")
    print(f"{DIM}  merchant : {MERCHANT_URL}{END}")
    print(f"{DIM}  key      : {key_source}{END}")
    print(f"  agent DID  {CYAN}{agent.did}{END}\n")

    print(f"{BOLD}1 · browse the catalog (free endpoint){END}")
    catalog = agent.get(f"{MERCHANT_URL}/api/catalog").json()
    for asset in catalog["assets"]:
        print(f"  {asset['id']:<14} {asset['name']:<38} {int(asset['priceMotes']) / 1e9} CSPR")

    asset_id = os.environ.get("ASSET_ID") or catalog["assets"][0]["id"]
    print(f"\n{BOLD}2 · buy {asset_id} - the SDK pays the 402 automatically{END}")
    res = agent.get(f"{MERCHANT_URL}/api/assets/{asset_id}")
    body = res.json()
    if not res.is_success:
        print(f"  payment failed: {body}")
        print(f"{DIM}  (an unfunded ephemeral key can fail the facilitator's balance check -")
        print(f"   set FOUROTWO_PRIVATE_KEY to a funded casper-test ed25519 seed){END}")
        return 1

    data = body.get("data", body)
    settlement = body.get("settlement") or {}
    receipt = body.get("receipt") or {}
    print(f"  {GREEN}✓ paid & settled{END}")
    print(f"  data keys   : {', '.join(sorted(data)) if isinstance(data, dict) else type(data).__name__}")
    print(f"  settlement  : {settlement.get('settlementId', 'n/a')} mode={settlement.get('mode', 'n/a')}")
    if receipt.get("facilitatorSignature"):
        print(f"  receipt     : signed by facilitator (fee {receipt.get('feeMotes', '0')} motes)")

    print(f"\n{BOLD}3 · the SDK's local spend ledger{END}")
    for entry in agent.get_transaction_log():
        print(
            f"  {entry.timestamp}  {entry.status:<8} {int(entry.amount) / 1e9} {entry.token} "
            f"→ {entry.recipient[:24]}…"
        )

    print(f"\n{GREEN}✓ full layer402 loop from Python: 402 → sign → retry → data + receipt{END}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
