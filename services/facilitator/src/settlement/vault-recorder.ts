/**
 * Records settlements in the on-chain `SettlementVault` (M1-T9). Like the trust
 * sync (AD-3), the on-chain write is best-effort — a failure is logged but does
 * not fail the settlement response.
 */
export interface VaultRecordArgs {
  did: string;
  amount: string;
  recipient: string;
  settlementId: string;
  trustScore: number;
}

export interface VaultRecorder {
  record(args: VaultRecordArgs): Promise<{ recorded: boolean; detail?: string }>;
}

/**
 * Default recorder. The actual `record_settlement` contract call requires the
 * deployed vault hash + facilitator service key wired through casper-js-sdk
 * (M1-T4 / M1-T9). Until then it logs the intent and reports `recorded: false`
 * so the gap is observable without breaking the demo flow.
 */
export class LoggingVaultRecorder implements VaultRecorder {
  constructor(
    private readonly vaultContractHash: string | undefined,
    private readonly log: (msg: string, meta?: unknown) => void = () => {},
  ) {}

  async record(args: VaultRecordArgs): Promise<{ recorded: boolean; detail?: string }> {
    if (!this.vaultContractHash) {
      this.log('SettlementVault not configured; skipping on-chain record', args);
      return { recorded: false, detail: 'vault_contract_hash_unset' };
    }
    // A live implementation broadcasts record_settlement(did, amount, recipient,
    // settlement_id, trust_score) to the vault contract here.
    this.log('SettlementVault on-chain record pending live broadcaster', {
      vault: this.vaultContractHash,
      ...args,
    });
    return { recorded: false, detail: 'broadcaster_unconfigured' };
  }
}
