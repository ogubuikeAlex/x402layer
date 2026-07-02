#!/usr/bin/env bash

set -euo pipefail

ACTION="${1:-}"
NODE_RPC="${NODE_RPC:-https://rpc.testnet.casperlabs.io/rpc}"
CHAIN_NAME="${CHAIN_NAME:-casper-test}"
SECRET_KEY_PATH="${SECRET_KEY_PATH:-./keys/secret_key.pem}"
PAYMENT_AMOUNT="${PAYMENT_AMOUNT:-5000000000}" # 5 CSPR per call
ADDRESSES_FILE="$(dirname "$0")/../deployed-addresses.json"

# KyxRegistry contract package hash (bare hex, no `hash-` prefix).
REGISTRY_PKG="${KYX_REGISTRY_PACKAGE:-$(jq -r '.casper.kyx_registry.package_hash' "$ADDRESSES_FILE" | sed 's/^hash-//')}"

# --- Deterministic playground demo agent (dashboard app/api/demo/route.ts) ---
DID="${AGENT_DID:-did:fourotwo:casper:3d5de8c609159a0954e773dd686fb7724428316cb30e00bdc899976127747f55}"
AGENT_PUBLIC_KEY="${AGENT_PUBLIC_KEY:-01ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c}"
AGENT_NAME="${AGENT_NAME:-Playground Demo Agent}"
# Operator account that controls the agent (any valid account-hash Key).
OPERATOR="${OPERATOR_ACCOUNT_HASH:-account-hash-3d5de8c609159a0954e773dd686fb7724428316cb30e00bdc899976127747f55}"

# --- Trust score values (for `score`) ---
SCORE="${SCORE:-87}"
TIER="${TIER:-gold}"
COMPLETION_BPS="${COMPLETION_BPS:-9800}"
TOTAL_TX="${TOTAL_TX:-128}"
TOTAL_DISPUTES="${TOTAL_DISPUTES:-1}"

if [[ "$ACTION" != "register" && "$ACTION" != "score" ]]; then
  echo "usage: $0 <register|score>" >&2
  exit 1
fi
if [[ ! -f "$SECRET_KEY_PATH" ]]; then
  echo "error: secret key not found at $SECRET_KEY_PATH" >&2
  exit 1
fi
if [[ -z "$REGISTRY_PKG" || "$REGISTRY_PKG" == "null" ]]; then
  echo "error: kyx_registry package hash missing from $ADDRESSES_FILE" >&2
  exit 1
fi

case "$ACTION" in
  register)
    ENTRY_POINT=register_agent
    args=(
      --session-arg "did:string='${DID}'"
      --session-arg "operator:key='${OPERATOR}'"
      --session-arg "agent_name:string='${AGENT_NAME}'"
      --session-arg "public_key:string='${AGENT_PUBLIC_KEY}'"
    )
    ;;
  score)
    ENTRY_POINT=update_trust_score
    args=(
      --session-arg "did:string='${DID}'"
      --session-arg "score:u8='${SCORE}'"
      --session-arg "tier:string='${TIER}'"
      --session-arg "completion_rate_bps:u32='${COMPLETION_BPS}'"
      --session-arg "total_transactions:u64='${TOTAL_TX}'"
      --session-arg "total_disputes:u64='${TOTAL_DISPUTES}'"
    )
    ;;
esac

echo "==> ${ENTRY_POINT} on KyxRegistry (${REGISTRY_PKG}) via ${NODE_RPC}"
echo "    DID: ${DID}"

set +e
RESPONSE=$(casper-client put-deploy \
  --node-address "$NODE_RPC" \
  --chain-name "$CHAIN_NAME" \
  --secret-key "$SECRET_KEY_PATH" \
  --payment-amount "$PAYMENT_AMOUNT" \
  --session-package-hash "$REGISTRY_PKG" \
  --session-entry-point "$ENTRY_POINT" \
  "${args[@]}" 2>&1)
RC=$?
set -e
echo "---- casper-client output (exit $RC) ----"
printf '%s\n' "$RESPONSE"
echo "------------------------------------------"

DEPLOY_HASH=$(printf '%s\n' "$RESPONSE" | jq -r '.result.deploy_hash // empty' 2>/dev/null)
if [[ -z "$DEPLOY_HASH" ]]; then
  DEPLOY_HASH=$(printf '%s\n' "$RESPONSE" | grep -oiE '[0-9a-f]{64}' | head -1)
fi
if [[ -z "$DEPLOY_HASH" ]]; then
  echo "error: no deploy hash in output (see above)" >&2
  exit 1
fi

echo "    deploy hash: $DEPLOY_HASH"
echo "    verify:  casper-client get-deploy --node-address $NODE_RPC $DEPLOY_HASH"
echo "    explorer: https://testnet.cspr.live/deploy/$DEPLOY_HASH"
