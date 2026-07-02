use odra::prelude::*;

/// On-chain record for a registered agent.
///
/// Mirrors `AgentDid` in the product spec (Section 7) and the shared
/// `@fourotwo/types` `AgentDid` interface.
#[odra::odra_type]
pub struct AgentRecord {
    pub did: String,
    pub operator: Address,
    pub agent_name: String,
    pub public_key: String,
    pub registered_at: u64,
    pub is_active: bool,
    pub kyc_verified: bool,
}

#[odra::odra_type]
pub struct TrustScoreRecord {
    pub score: u8,
    pub tier: String,
    // Casper's CLType has no u16; basis points (0..=10000) fit comfortably in u32.
    pub completion_rate_bps: u32,
    pub total_transactions: u64,
    pub total_disputes: u64,
    pub last_updated: u64,
}

#[odra::odra_error]
#[derive(PartialEq, Eq, Debug)]
pub enum Error {
    /// A different agent is already registered with this public key.
    DuplicatePublicKey = 1,
    /// No agent is registered under the given DID.
    AgentNotFound = 2,
    /// Caller is not the facilitator service account or admin.
    Unauthorized = 3,
    /// An agent is already registered under this DID.
    AgentAlreadyRegistered = 4,
}

#[odra::event]
pub struct AgentRegistered {
    pub did: String,
    pub operator: Address,
}

#[odra::event]
pub struct TrustScoreUpdated {
    pub did: String,
    pub score: u8,
    pub tier: String,
}

/// Agent identity + trust score registry.
#[odra::module(events = [AgentRegistered, TrustScoreUpdated], errors = Error)]
pub struct KyxRegistry {
    agents: Mapping<String, AgentRecord>,
    scores: Mapping<String, TrustScoreRecord>,
    /// public_key -> did, used for duplicate-registration detection.
    pubkey_to_did: Mapping<String, String>,
    /// Service account allowed to write trust scores.
    facilitator: Var<Address>,
    /// Deployer; may rotate the facilitator account.
    admin: Var<Address>,
    total_agents: Var<u64>,
}

#[odra::module]
impl KyxRegistry {
    /// Initialize with the facilitator service account that is authorized to
    /// write trust scores. The deployer becomes admin.
    pub fn init(&mut self, facilitator: Address) {
        self.admin.set(self.env().caller());
        self.facilitator.set(facilitator);
        self.total_agents.set(0);
    }

    /// Register a new agent. Reverts on duplicate public key or DID.
    pub fn register_agent(
        &mut self,
        did: String,
        operator: Address,
        agent_name: String,
        public_key: String,
    ) {
        if self.pubkey_to_did.get(&public_key).is_some() {
            self.env().revert(Error::DuplicatePublicKey);
        }
        if self.agents.get(&did).is_some() {
            self.env().revert(Error::AgentAlreadyRegistered);
        }

        let record = AgentRecord {
            did: did.clone(),
            operator,
            agent_name,
            public_key: public_key.clone(),
            registered_at: self.env().get_block_time(),
            is_active: true,
            kyc_verified: false,
        };
        self.agents.set(&did, record);
        self.pubkey_to_did.set(&public_key, did.clone());
        self.total_agents.set(self.total_agents.get_or_default() + 1);

        self.env().emit_event(AgentRegistered { did, operator });
    }

    /// Read an agent record. Returns `None` for an unknown DID (does not revert).
    pub fn get_agent(&self, did: String) -> Option<AgentRecord> {
        self.agents.get(&did)
    }

    /// Write/refresh an agent's trust score. Facilitator/admin only.
    /// Reverts if the DID is not registered.
    pub fn update_trust_score(
        &mut self,
        did: String,
        score: u8,
        tier: String,
        completion_rate_bps: u32,
        total_transactions: u64,
        total_disputes: u64,
    ) {
        self.assert_facilitator();
        if self.agents.get(&did).is_none() {
            self.env().revert(Error::AgentNotFound);
        }

        let record = TrustScoreRecord {
            score,
            tier: tier.clone(),
            completion_rate_bps,
            total_transactions,
            total_disputes,
            last_updated: self.env().get_block_time(),
        };
        self.scores.set(&did, record);

        self.env().emit_event(TrustScoreUpdated { did, score, tier });
    }

    /// Read the on-chain trust score. Returns `None` if never synced.
    pub fn get_trust_score(&self, did: String) -> Option<TrustScoreRecord> {
        self.scores.get(&did)
    }

    /// Mark an operator's KYC status for an agent. Facilitator/admin only.
    pub fn set_kyc_verified(&mut self, did: String, verified: bool) {
        self.assert_facilitator();
        let mut record = match self.agents.get(&did) {
            Some(r) => r,
            None => self.env().revert(Error::AgentNotFound),
        };
        record.kyc_verified = verified;
        self.agents.set(&did, record);
    }

    /// Total number of registered agents.
    pub fn total_agents(&self) -> u64 {
        self.total_agents.get_or_default()
    }

    /// Rotate the facilitator service account. Admin only.
    pub fn set_facilitator(&mut self, facilitator: Address) {
        if self.admin.get() != Some(self.env().caller()) {
            self.env().revert(Error::Unauthorized);
        }
        self.facilitator.set(facilitator);
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
    use odra::host::Deployer;

    fn deploy() -> (odra::host::HostEnv, KyxRegistryHostRef) {
        let env = odra_test::env();
        // account(0) = deployer/admin, account(1) = facilitator service account
        let init_args = KyxRegistryInitArgs {
            facilitator: env.get_account(1),
        };
        let contract = KyxRegistry::deploy(&env, init_args);
        (env, contract)
    }

    #[test]
    fn successful_registration() {
        let (env, mut contract) = deploy();
        let operator = env.get_account(2);

        contract.register_agent(
            "did:fourotwo:casper:0xabc".to_string(),
            operator,
            "oracle-agent".to_string(),
            "01aabbccdd".to_string(),
        );

        let agent = contract.get_agent("did:fourotwo:casper:0xabc".to_string());
        assert!(agent.is_some());
        let agent = agent.unwrap();
        assert_eq!(agent.agent_name, "oracle-agent");
        assert_eq!(agent.operator, operator);
        assert!(agent.is_active);
        assert!(!agent.kyc_verified);
        assert_eq!(contract.total_agents(), 1);
    }

    #[test]
    fn duplicate_public_key_reverts() {
        let (env, mut contract) = deploy();
        let operator = env.get_account(2);

        contract.register_agent(
            "did:fourotwo:casper:0xabc".to_string(),
            operator,
            "agent-a".to_string(),
            "01deadbeef".to_string(),
        );

        // Same public key, different DID -> must revert.
        let result = contract.try_register_agent(
            "did:fourotwo:casper:0xdef".to_string(),
            operator,
            "agent-b".to_string(),
            "01deadbeef".to_string(),
        );
        assert_eq!(result, Err(Error::DuplicatePublicKey.into()));
    }

    #[test]
    fn unauthorized_score_update_reverts() {
        let (env, mut contract) = deploy();
        let operator = env.get_account(2);

        contract.register_agent(
            "did:fourotwo:casper:0xabc".to_string(),
            operator,
            "agent-a".to_string(),
            "01deadbeef".to_string(),
        );

        // account(3) is neither admin nor facilitator.
        env.set_caller(env.get_account(3));
        let result = contract.try_update_trust_score(
            "did:fourotwo:casper:0xabc".to_string(),
            87,
            "VERIFIED".to_string(),
            9910,
            42,
            0,
        );
        assert_eq!(result, Err(Error::Unauthorized.into()));
    }

    #[test]
    fn facilitator_can_update_score() {
        let (env, mut contract) = deploy();
        let operator = env.get_account(2);

        contract.register_agent(
            "did:fourotwo:casper:0xabc".to_string(),
            operator,
            "agent-a".to_string(),
            "01deadbeef".to_string(),
        );

        env.set_caller(env.get_account(1)); // facilitator
        contract.update_trust_score(
            "did:fourotwo:casper:0xabc".to_string(),
            87,
            "VERIFIED".to_string(),
            9910,
            42,
            0,
        );

        let score = contract
            .get_trust_score("did:fourotwo:casper:0xabc".to_string())
            .unwrap();
        assert_eq!(score.score, 87);
        assert_eq!(score.tier, "VERIFIED");
        assert_eq!(score.completion_rate_bps, 9910);
    }

    #[test]
    fn score_update_for_unknown_did_reverts() {
        let (env, mut contract) = deploy();
        env.set_caller(env.get_account(1)); // facilitator
        let result = contract.try_update_trust_score(
            "did:fourotwo:casper:0xunknown".to_string(),
            50,
            "STANDARD".to_string(),
            0,
            0,
            0,
        );
        assert_eq!(result, Err(Error::AgentNotFound.into()));
    }
}
