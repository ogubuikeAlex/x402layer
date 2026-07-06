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
    this.log('SettlementVault on-chain record pending live broadcaster', {
      vault: this.vaultContractHash,
      ...args,
    });
    return { recorded: false, detail: 'broadcaster_unconfigured' };
  }
}
