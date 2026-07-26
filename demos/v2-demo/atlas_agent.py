#!/usr/bin/env python3
"""Atlas - an autonomous fourotwo agent built on the Python SDK.

This is the v2 "no human in the loop" beat: the agent is handed a spend budget
once, then pays for data entirely on its own. Every 402 is intercepted by the
SDK, signed with the agent's key, and retried - there is no approval prompt.

Run standalone (facilitator + a paid merchant must be up), or let
``run.mjs`` drive it (it registers the agent first and injects the key).

Env:
  FOUROTWO_PRIVATE_KEY   hex ed25519 secret (required; generate with the SDK)
  MERCHANT_URL           paid endpoint base, default http://localhost:5000/data
  ASSET_IDS              comma-separated asset ids to buy, default a 4-item set
  PER_REQUEST_TOKENS     per-payment cap in whole tokens (default 1)
  DAILY_TOKENS           daily cap in whole tokens (default 10)
"""

from __future__ import annotations

import os
import sys

from fourotwo import BudgetExceededError, FourotwoAgent, SpendBudget

C = {
    "dim": lambda s: f"\x1b[2m{s}\x1b[0m",
    "cyan": lambda s: f"\x1b[36m{s}\x1b[0m",
    "green": lambda s: f"\x1b[32m{s}\x1b[0m",
    "red": lambda s: f"\x1b[31m{s}\x1b[0m",
    "bold": lambda s: f"\x1b[1m{s}\x1b[0m",
}


def main() -> int:
    private_key = (os.environ.get("FOUROTWO_PRIVATE_KEY") or "").strip()
    if not private_key:
        print(C["red"]("FOUROTWO_PRIVATE_KEY is required (a hex ed25519 secret)."))
        return 2

    merchant = os.environ.get("MERCHANT_URL", "http://localhost:5000/data").rstrip("/")
    asset_ids = [
        a.strip()
        for a in os.environ.get("ASSET_IDS", "RE-NYC-001,RE-NYC-001,RE-NYC-001,RE-NYC-001").split(",")
        if a.strip()
    ]

    # The budget is the ONLY control the operator sets. After this, Atlas pays on
    # its own - no per-payment human approval.
    budget = SpendBudget(
        per_request_tokens=float(os.environ.get("PER_REQUEST_TOKENS", "1")),
        daily_tokens=float(os.environ.get("DAILY_TOKENS", "10")),
    )
    agent = FourotwoAgent(private_key_hex=private_key, budget=budget)

    print(C["bold"]("\n  Atlas - autonomous Python-SDK agent\n"))
    print(f"  DID     {agent.did}")
    print(f"  budget  {budget.per_request_tokens}/req, {budget.daily_tokens}/day (whole tokens)")
    print(C["dim"](f"  paying {len(asset_ids)} request(s) at {merchant} with no human approval\n"))

    settled = 0
    for i, asset_id in enumerate(asset_ids, start=1):
        url = f"{merchant}/{asset_id}"
        try:
            res = agent.get(url)
        except BudgetExceededError as err:
            print(C["red"](f"  [{i}] budget stop: {err}"))
            break
        if res.status_code != 200:
            print(C["red"](f"  [{i}] {asset_id}: request failed ({res.status_code})"))
            continue

        body = res.json()
        pay = (body.get("payment") or {}).get("settle") or {}
        mode = pay.get("mode", "?")
        sid = pay.get("settlement_id", "?")
        batch = f" batch={pay.get('batch_id')}" if pay.get("batch_id") else ""
        print(
            f"  {C['cyan'](f'[{i}]')} paid {C['bold'](asset_id)} "
            f"-> {C['green'](mode)} {C['dim'](sid)}{C['dim'](batch)}"
        )
        settled += 1

    print(C["dim"]("\n  local transaction ledger:"))
    for entry in agent.get_transaction_log():
        mark = C["green"]("ok") if entry.status == "success" else C["red"](entry.status)
        print(f"    {mark}  {entry.amount} {entry.token} -> {entry.recipient}")

    print(C["green"](f"\n  Atlas settled {settled}/{len(asset_ids)} payment(s) autonomously.\n"))
    return 0 if settled > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
