import { MongoClient } from 'mongodb';

import type { FacilitatorConfig } from './config.js';
import { AdapterRegistry, buildAdapterRegistry } from './chains/registry.js';
import { FeeLedger, MongoFeeLedger, type FeeLedgerStore } from './fees/ledger.js';
import { FeeCollector, NativeCasperFeeTransfer } from './fees/collector.js';
import { UpstreamFacilitatorClient } from './settlement/upstream-facilitator.js';
import { ReplayCache, MongoReplayCache, type ReplayStore } from './replay/cache.js';
import {
  BatchQueue,
  InMemoryBatchJobStore,
  MongoBatchJobStore,
  type BatchJobStore,
} from './settlement/batch-queue.js';
import {
  InMemoryVerificationStore,
  MongoVerificationStore,
  type VerificationStore,
} from './verification/store.js';
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
  replayCache: ReplayStore;
  verifications: VerificationStore;
  receiptSigner: ReceiptSigner;
  vaultRecorder: VaultRecorder;
  trustClient: TrustClient;
  settlementReporter: SettlementReporter;
  feeLedger: FeeLedgerStore;
  batchQueue: BatchQueue;
  feeCollector?: FeeCollector;
  upstreamFacilitator?: UpstreamFacilitatorClient;
  mongoClient?: MongoClient;
}

export function buildContext(
  config: FacilitatorConfig,
  overrides: Partial<AppContext> = {},
): AppContext {
  const offChainTrust: TrustClient = config.kyxRegistryUrl
    ? new HttpTrustClient(config.kyxRegistryUrl)
    : new StubTrustClient();

  const trustClient: TrustClient =
    config.casper.kyxRegistryContractHash && config.casper.kyxRegistryStateUref
      ? new OnChainTrustClient({
          nodeRpcs: config.casper.nodeRpcs,
          stateUref: config.casper.kyxRegistryStateUref,
          fallback: offChainTrust,
        })
      : offChainTrust;

  const settlementReporter: SettlementReporter = config.kyxRegistryUrl
    ? new HttpSettlementReporter(config.kyxRegistryUrl, config.kyxFacilitatorToken)
    : new NoopSettlementReporter();
  if (!config.kyxRegistryUrl) {
    console.warn(
      '[kyx] KYX_REGISTRY_URL not set - settlements will NOT be reported to the registry (no dashboard history/volume)',
    );
  } else if (!config.kyxFacilitatorToken) {
    console.warn(
      '[kyx] KYX_FACILITATOR_TOKEN not set - settlement reports will be rejected by a secured registry',
    );
  }


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

  const resolvedVaultRecorder = overrides.vaultRecorder ?? vaultRecorder;
  const resolvedReporter = overrides.settlementReporter ?? settlementReporter;

  const mongoClient =
    overrides.mongoClient ?? (config.mongodbUri ? new MongoClient(config.mongodbUri) : undefined);
  if (!mongoClient && !overrides.verifications) {
    console.warn(
      '[store] MONGODB_URI not set - verifications, replay guard, fees and batch queue are in-memory only. ' +
        'Do NOT run more than one replica or expect state to survive a restart.',
    );
  }
  const db = config.mongodbDb;

  const replayCache: ReplayStore = mongoClient
    ? new MongoReplayCache(mongoClient, db)
    : new ReplayCache();
  const verifications: VerificationStore = mongoClient
    ? new MongoVerificationStore(mongoClient, db)
    : new InMemoryVerificationStore();
  const feeLedger: FeeLedgerStore = mongoClient
    ? new MongoFeeLedger(mongoClient, db, config.fees.bps, config.fees.recipient)
    : new FeeLedger(config.fees.bps, config.fees.recipient, config.fees.dataFile);
  const resolvedFeeLedger = overrides.feeLedger ?? feeLedger;
  const batchJobStore: BatchJobStore = mongoClient
    ? new MongoBatchJobStore(mongoClient, db)
    : new InMemoryBatchJobStore();


    let feeCollector: FeeCollector | undefined;
  if (config.fees.collectionEnabled) {
    if (!facilitatorKey) {
      console.warn(
        '[fees] FEE_COLLECTION_ENABLED but no facilitator key (FACILITATOR_SECRET_KEY[_PATH]) - fee collection disabled',
      );
    } else if (!config.fees.recipient) {
      console.warn('[fees] FEE_COLLECTION_ENABLED but FOUROTWO_FEE_RECIPIENT is unset - fee collection disabled');
    } else {
      feeCollector = new FeeCollector({
        ledger: resolvedFeeLedger,
        transfer: new NativeCasperFeeTransfer({
          secretKey: config.casper.facilitatorSecretKey,
          secretKeyPath: config.casper.facilitatorSecretKeyPath,
          keyAlgorithm: config.casper.facilitatorKeyAlgorithm,
          nodeRpcs: config.casper.nodeRpcs,
          chainName: config.casper.chainName,
        }),
        log: (msg, meta) => console.log(`[fees] ${msg}`, meta ?? ''),
      });
    }
  }

  const upstreamFacilitator = config.upstreamFacilitator.url
    ? new UpstreamFacilitatorClient({
        baseUrl: config.upstreamFacilitator.url,
        accessToken: config.upstreamFacilitator.accessToken,
        network: config.upstreamFacilitator.network,
        asset: config.upstreamFacilitator.asset,
        assetMetadata: config.upstreamFacilitator.assetMetadata,
        resourceUrl: config.upstreamFacilitator.resourceUrl,
      })
    : undefined;
  if (upstreamFacilitator) {
    console.log(
      `[settle] delegating settlement to upstream x402 facilitator at ${config.upstreamFacilitator.url}`,
    );
  }

  return {
    config,
    adapters: overrides.adapters ?? buildAdapterRegistry(config),
    replayCache: overrides.replayCache ?? replayCache,
    verifications: overrides.verifications ?? verifications,
    receiptSigner: overrides.receiptSigner ?? new ReceiptSigner(config.facilitatorReceiptSigningKey),
    vaultRecorder: resolvedVaultRecorder,
    trustClient: overrides.trustClient ?? trustClient,
    settlementReporter: resolvedReporter,
    feeLedger: resolvedFeeLedger,
    batchQueue:
      overrides.batchQueue ??
      new BatchQueue({
        windowMs: config.batch.windowMs,
        maxPending: config.batch.maxPending,
        vaultRecorder: resolvedVaultRecorder,
        settlementReporter: resolvedReporter,
        store: batchJobStore,
      }),
    feeCollector: overrides.feeCollector ?? feeCollector,
    upstreamFacilitator: overrides.upstreamFacilitator ?? upstreamFacilitator,
    mongoClient,
    ...overrides,
  };
}

export async function initContext(ctx: AppContext): Promise<void> {
  if (ctx.mongoClient) {
    await ctx.mongoClient.connect();
    console.log('[store] connected to MongoDB - money-flow state is durable and multi-instance safe');
  }
  await ctx.replayCache.init?.();
  await ctx.verifications.init?.();
  await ctx.feeLedger.init?.();
  await ctx.batchQueue.init?.();
}
