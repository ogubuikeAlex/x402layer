#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
//! fourotwo Casper smart contracts.
//!
//! Two contracts for the MVP (see `fourotwo-adr.md`):
//! - [`kyx_registry`] — agent identity (DID) + trust score registry
//! - [`settlement_vault`] — on-chain settlement records, validated against the registry
//!
//! Both are written with the [Odra](https://odra.dev) framework so they can be
//! tested against the MockVM (`cargo test`) and compiled to Casper WASM
//! (`cargo odra build`).

extern crate alloc;

pub mod kyx_registry;
pub mod settlement_vault;
