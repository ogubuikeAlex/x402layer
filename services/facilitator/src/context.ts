import type { FacilitatorConfig } from './config.js';
import { AdapterRegistry, buildAdapterRegistry } from './chains/registry.js';
import { ReplayCache } from './replay/cache.js';
import { VerificationStore } from './verification/store.js';
import { ReceiptSigner } from './receipts/signer.js';
import { LoggingVaultRecorder, type VaultRecorder } from './settlement/vault-recorder.js';
import { CasperVaultRecorder } from './settlement/casper-vault-recorder.js';
import { HttpTrustClient, StubTrustClient, type TrustClient } from './kyx/client.js';
import { OnChainTrustClient } from './kyx/onchain-client.js';
import {
  HttpSettlementReporter,
  NoopSettlementReporter,
  type SettlementReporter,
} from './kyx/settlements.js';

export interface AppContext {
  config: FacilitatorConfig;
  adapters: AdapterRegistry;
  replayCache: ReplayCache;
  verifications: VerificationStore;
  receiptSigner: ReceiptSigner;
  vaultRecorder: VaultRecorder;
  trustClient: TrustClient;
  settlementReporter: SettlementReporter;
}

export function buildContext(
  config: FacilitatorConfig,
  overrides: Partial<AppContext> = {},
): AppContext {
  const offChainTrust: TrustClient = config.kyxRegistryUrl
    ? new HttpTrustClient(config.kyxRegistryUrl)
    : new StubTrustClient();
  // Prefer on-chain reads when the KyxRegistry contract + its `state` dict URef
  // are configured; the off-chain client remains the fallback.
  const trustClient: TrustClient =
    config.casper.kyxRegistryContractHash && config.casper.kyxRegistryStateUref
      ? new OnChainTrustClient({
          nodeRpcs: config.casper.nodeRpcs,
          stateUref: config.casper.kyxRegistryStateUref,
          fallback: offChainTrust,
        })
      : offChainTrust;

  const settlementReporter: SettlementReporter = config.kyxRegistryUrl
    ? new HttpSettlementReporter(config.kyxRegistryUrl)
    : new NoopSettlementReporter();
  if (!config.kyxRegistryUrl) {
    console.warn(
      '[kyx] KYX_REGISTRY_URL not set - settlements will NOT be reported to the registry (no dashboard history/volume)',
    );
  }

  // Live on-chain settlement record when the vault hash + service key are wired;
  // otherwise log-only so the gap stays observable.
  const facilitatorKey = config.casper.facilitatorSecretKey ?? config.casper.facilitatorSecretKeyPath;
  const vaultRecorder: VaultRecorder =
    config.casper.settlementVaultContractHash && facilitatorKey
      ? new CasperVaultRecorder({
          vaultPackageHash: config.casper.settlementVaultContractHash,
          secretKey: config.casper.facilitatorSecretKey,
          secretKeyPath: config.casper.facilitatorSecretKeyPath,
          keyAlgorithm: config.casper.facilitatorKeyAlgorithm,
          nodeRpc: config.casper.nodeRpc,
          nodeRpcs: config.casper.nodeRpcs,
          chainName: config.casper.chainName,
          paymentMotes: config.casper.settlementPaymentMotes,
          log: (msg, meta) => console.log(`[vault] ${msg}`, meta ?? ''),
        })
      : new LoggingVaultRecorder(config.casper.settlementVaultContractHash);

  return {
    config,
    adapters: overrides.adapters ?? buildAdapterRegistry(config),
    replayCache: overrides.replayCache ?? new ReplayCache(),
    verifications: overrides.verifications ?? new VerificationStore(),
    receiptSigner: overrides.receiptSigner ?? new ReceiptSigner(config.facilitatorReceiptSigningKey),
    vaultRecorder: overrides.vaultRecorder ?? vaultRecorder,
    trustClient: overrides.trustClient ?? trustClient,
    settlementReporter: overrides.settlementReporter ?? settlementReporter,
    ...overrides,
  };
}
