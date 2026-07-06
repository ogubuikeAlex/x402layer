# fourotwo contracts

Casper smart contracts for fourotwo, written with the [Odra](https://odra.dev)
framework.

| Contract | File | Purpose |
|---|---|---|
| `KyxRegistry` | [`src/kyx_registry.rs`](./src/kyx_registry.rs) | Agent DID identity + trust score registry (M1-T1) |
| `SettlementVault` | [`src/settlement_vault.rs`](./src/settlement_vault.rs) | On-chain settlement records, validated against the registry (M1-T3) |

## Toolchain

- Rust nightly pinned by [`rust-toolchain.toml`](./rust-toolchain.toml) +
  `wasm32-unknown-unknown` target
- [`cargo-odra`](https://github.com/odra-team/cargo-odra): `cargo install cargo-odra`
- Casper CLI: `casper-client` (for deployment)

```bash
rustup target add wasm32-unknown-unknown
cargo install cargo-odra
```

## Build & test

```bash
# Unit tests against the Odra MockVM (no node required)
cargo test

# Compile the contracts to Casper WASM (output in ./wasm)
cargo odra build
```

## Casper Testnet

- **RPC node:** `https://rpc.testnet.casperlabs.io/rpc`
- **CSPR.cloud REST (reads):** `https://api.testnet.cspr.cloud` (API key required, see service `.env`)
- **Block explorer:** `https://testnet.cspr.live`
- **Faucet:** `https://testnet.cspr.live/tools/faucet`
- **Network name:** `casper-test`

## Deployment

See [`scripts/deploy.sh`](./scripts/deploy.sh). Deployment requires:

1. A funded testnet account (`SECRET_KEY_PATH` -> `secret_key.pem`).
2. `casper-client` on `PATH`.
3. WASM built via `cargo odra build`.

Deploy order matters - `SettlementVault` takes the `KyxRegistry` contract hash as a
constructor arg:

```bash
SECRET_KEY_PATH=./keys/secret_key.pem \
FACILITATOR_ACCOUNT_HASH=account-hash-... \
  ./scripts/deploy.sh kyx_registry

SECRET_KEY_PATH=./keys/secret_key.pem \
FACILITATOR_ACCOUNT_HASH=account-hash-... \
  ./scripts/deploy.sh settlement_vault
```