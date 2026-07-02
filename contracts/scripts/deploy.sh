#!/usr/bin/env bash
#

set -euo pipefail

CONTRACT="${1:-}"
NODE_RPC="${NODE_RPC:-https://rpc.testnet.casperlabs.io/rpc}"
CHAIN_NAME="${CHAIN_NAME:-casper-test}"
SECRET_KEY_PATH="${SECRET_KEY_PATH:-./keys/secret_key.pem}"
PAYMENT_AMOUNT="${PAYMENT_AMOUNT:-300000000000}" # 300 CSPR, generous for contract install
ADDRESSES_FILE="$(dirname "$0")/../deployed-addresses.json"
WASM_DIR="$(dirname "$0")/../wasm"

if [[ -z "$CONTRACT" ]]; then
  echo "error: contract name required (kyx_registry | settlement_vault)" >&2
  exit 1
fi
if [[ -z "${FACILITATOR_ACCOUNT_HASH:-}" ]]; then
  echo "error: FACILITATOR_ACCOUNT_HASH must be set" >&2
  exit 1
fi
if [[ ! -f "$SECRET_KEY_PATH" ]]; then
  echo "error: secret key not found at $SECRET_KEY_PATH" >&2
  exit 1
fi

echo "==> Building WASM (cargo odra build)"
( cd "$(dirname "$0")/.." && cargo odra build )

# Odra's generated `call()` requires these install-config named args on a fresh
# deploy; without them the contract reverts on-chain. (odra 2.8.1)
odra_cfg_args=(
  --session-arg "odra_cfg_is_upgrade:bool='false'"
  --session-arg "odra_cfg_allow_key_override:bool='false'"
  --session-arg "odra_cfg_is_upgradable:bool='false'"
)

deploy_args=()
WASM_FILE=""
case "$CONTRACT" in
  kyx_registry)
    WASM_FILE="$WASM_DIR/KyxRegistry.wasm"
    deploy_args=(
      "${odra_cfg_args[@]}"
      --session-arg "odra_cfg_package_hash_key_name:string='kyx_registry'"
      --session-arg "facilitator:key='${FACILITATOR_ACCOUNT_HASH}'"
    )
    ;;
  settlement_vault)
    WASM_FILE="$WASM_DIR/SettlementVault.wasm"
    REGISTRY_HASH="${KYX_REGISTRY_HASH:-$(jq -r '.casper.kyx_registry.contract_hash // empty' "$ADDRESSES_FILE")}"
    if [[ -z "$REGISTRY_HASH" ]]; then
      echo "error: KyxRegistry must be deployed first (no kyx_registry hash in $ADDRESSES_FILE)" >&2
      exit 1
    fi
    deploy_args=(
      "${odra_cfg_args[@]}"
      --session-arg "odra_cfg_package_hash_key_name:string='settlement_vault'"
      --session-arg "registry:key='${REGISTRY_HASH}'"
      --session-arg "facilitator:key='${FACILITATOR_ACCOUNT_HASH}'"
    )
    ;;
  *)
    echo "error: unknown contract '$CONTRACT'" >&2
    exit 1
    ;;
esac

if [[ ! -f "$WASM_FILE" ]]; then
  echo "error: WASM not found at $WASM_FILE (did cargo odra build succeed?)" >&2
  exit 1
fi

echo "==> Deploying $CONTRACT to $CHAIN_NAME via $NODE_RPC"
# Capture the full response (stdout+stderr) without letting `set -e` abort the
# script on a non-zero exit, so we can always show what casper-client returned.
set +e
RESPONSE=$(casper-client put-deploy \
  --node-address "$NODE_RPC" \
  --chain-name "$CHAIN_NAME" \
  --secret-key "$SECRET_KEY_PATH" \
  --payment-amount "$PAYMENT_AMOUNT" \
  --session-path "$WASM_FILE" \
  "${deploy_args[@]}" 2>&1)
RC=$?
set -e
echo "---- casper-client output (exit $RC) ----"
printf '%s\n' "$RESPONSE"
echo "------------------------------------------"

# Prefer the JSON field; fall back to grepping a 64-char hex hash.
DEPLOY_HASH=$(printf '%s\n' "$RESPONSE" | jq -r '.result.deploy_hash // empty' 2>/dev/null)
if [[ -z "$DEPLOY_HASH" ]]; then
  DEPLOY_HASH=$(printf '%s\n' "$RESPONSE" | grep -oiE '[0-9a-f]{64}' | head -1)
fi
if [[ -z "$DEPLOY_HASH" ]]; then
  echo "error: no deploy hash in casper-client output. Raw response:" >&2
  printf '%s\n' "$RESPONSE" >&2
  exit 1
fi

echo "    deploy hash: $DEPLOY_HASH"
echo "==> Waiting for execution; check https://testnet.cspr.live/deploy/$DEPLOY_HASH"
echo ""
echo "After it succeeds, record the contract hash in $ADDRESSES_FILE:"
echo "  casper-client get-deploy --node-address $NODE_RPC $DEPLOY_HASH"
