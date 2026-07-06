//! SettlementVault — on-chain record of settled layer402 payments (Casper / Odra).
//!
//! Records each settlement and cross-checks that the paying agent's
//! DID exists in the `KyxRegistry` before recording. This is the on-chain artifact
//! the dashboard transaction history and audit trail read from.

use crate::kyx_registry::KyxRegistryContractRef;
use odra::prelude::*;
use odra::ContractRef;

/// On-chain settlement record. Mirrors the off-chain `SettlementReceipt` —
/// the fields needed for an auditable on-chain trail.
#[odra::odra_type]
pub struct SettlementRecord {
    pub settlement_id: String,
    pub did: String,
    /// Amount in token smallest unit (string to avoid precision loss).
    pub amount: String,
    pub recipient: Address,
    /// Trust score at the time of settlement.
    pub trust_score: u8,
    pub settled_at: u64,
}

#[odra::odra_error]
#[derive(PartialEq, Eq, Debug)]
pub enum Error {
    /// The paying DID is not registered in the KyxRegistry.
    UnknownAgent = 10,
    /// A settlement with this id already exists.
    DuplicateSettlement = 11,
    /// Caller is not the facilitator service account or admin.
    Unauthorized = 12,
}

#[odra::event]
pub struct SettlementRecorded {
    pub settlement_id: String,
    pub did: String,
    pub amount: String,
}

/// Records settled payments, validated against the KyxRegistry.
#[odra::module(events = [SettlementRecorded], errors = Error)]
pub struct SettlementVault {
    settlements: Mapping<String, SettlementRecord>,
    /// Address of the deployed `KyxRegistry` contract.
    registry: Var<Address>,
    facilitator: Var<Address>,
    admin: Var<Address>,
    total_settlements: Var<u64>,
}

#[odra::module]
impl SettlementVault {
    /// Initialize with the KyxRegistry address and the facilitator service
    /// account allowed to record settlements.
    pub fn init(&mut self, registry: Address, facilitator: Address) {
        self.admin.set(self.env().caller());
        self.registry.set(registry);
        self.facilitator.set(facilitator);
        self.total_settlements.set(0);
    }

    /// Record a settlement. Facilitator/admin only. Reverts if the DID is unknown
    /// in the registry or the settlement id was already recorded.
    pub fn record_settlement(
        &mut self,
        did: String,
        amount: String,
        recipient: Address,
        settlement_id: String,
        trust_score: u8,
    ) {
        self.assert_facilitator();

        if self.settlements.get(&settlement_id).is_some() {
            self.env().revert(Error::DuplicateSettlement);
        }

        // Cross-contract call: the agent must exist in the KyxRegistry.
        let registry_addr = self.registry.get().unwrap_or_revert(&self.env());
        let registry = KyxRegistryContractRef::new(self.env(), registry_addr);
        if registry.get_agent(did.clone()).is_none() {
            self.env().revert(Error::UnknownAgent);
        }

        let record = SettlementRecord {
            settlement_id: settlement_id.clone(),
            did: did.clone(),
            amount: amount.clone(),
            recipient,
            trust_score,
            settled_at: self.env().get_block_time(),
        };
        self.settlements.set(&settlement_id, record);
        self.total_settlements
            .set(self.total_settlements.get_or_default() + 1);

        self.env().emit_event(SettlementRecorded {
            settlement_id,
            did,
            amount,
        });
    }

    pub fn get_settlement(&self, settlement_id: String) -> Option<SettlementRecord> {
        self.settlements.get(&settlement_id)
    }

    pub fn total_settlements(&self) -> u64 {
        self.total_settlements.get_or_default()
    }

    fn assert_facilitator(&self) {
        let caller = self.env().caller();
        let is_facilitator = self.facilitator.get() == Some(caller);
        let is_admin = self.admin.get() == Some(caller);
        if !is_facilitator && !is_admin {
            self.env().revert(Error::Unauthorized);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kyx_registry::{KyxRegistry, KyxRegistryHostRef, KyxRegistryInitArgs};
    use odra::host::Deployer;

    fn setup() -> (
        odra::host::HostEnv,
        KyxRegistryHostRef,
        SettlementVaultHostRef,
    ) {
        let env = odra_test::env();
        let facilitator = env.get_account(1);

        let registry = KyxRegistry::deploy(
            &env,
            KyxRegistryInitArgs {
                facilitator,
            },
        );
        let vault = SettlementVault::deploy(
            &env,
            SettlementVaultInitArgs {
                registry: registry.address(),
                facilitator,
            },
        );
        (env, registry, vault)
    }

    #[test]
    fn record_settlement_for_registered_agent() {
        let (env, mut registry, mut vault) = setup();
        let operator = env.get_account(2);
        let recipient = env.get_account(4);

        registry.register_agent(
            "did:fourotwo:casper:0xabc".to_string(),
            operator,
            "oracle-agent".to_string(),
            "01deadbeef".to_string(),
        );

        env.set_caller(env.get_account(1)); // facilitator
        vault.record_settlement(
            "did:fourotwo:casper:0xabc".to_string(),
            "10000".to_string(),
            recipient,
            "stl_001".to_string(),
            87,
        );

        let rec = vault.get_settlement("stl_001".to_string()).unwrap();
        assert_eq!(rec.did, "did:fourotwo:casper:0xabc");
        assert_eq!(rec.amount, "10000");
        assert_eq!(rec.trust_score, 87);
        assert_eq!(vault.total_settlements(), 1);
    }

    #[test]
    fn record_for_unknown_did_reverts() {
        let (env, _registry, mut vault) = setup();
        let recipient = env.get_account(4);

        env.set_caller(env.get_account(1)); // facilitator
        let result = vault.try_record_settlement(
            "did:fourotwo:casper:0xnope".to_string(),
            "10000".to_string(),
            recipient,
            "stl_002".to_string(),
            50,
        );
        assert_eq!(result, Err(Error::UnknownAgent.into()));
    }
}
