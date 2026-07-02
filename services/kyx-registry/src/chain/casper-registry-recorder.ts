/**
 * Live `KyxRegistry` recorder (M3-T2 / M3-T7). Broadcasts `register_agent` and
 * `update_trust_score` contract calls to the deployed registry, signed with the
 * facilitator/service key.
 *
 * Mirrors the facilitator's `CasperVaultRecorder`. Like trust sync (AD-3) the
 * on-chain write is best-effort: any failure is reported (and never breaks the
 * registration / scoring response). RPC calls fall back across configured nodes.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { PrivateKey } from 'casper-js-sdk';

import { tryEndpoints } from './rpc-fallback.js';

// casper-js-sdk ships a CommonJS bundle marked `__esModule` with no `default`
// export. ESM named/default/namespace imports each break under one of tsx
// (esbuild) or node — so load it via real `require`, which returns the full
// module object identically in both runtimes. Types come from `import type`.
const sdk = createRequire(import.meta.url)('casper-js-sdk') as typeof import('casper-js-sdk');

export interface CasperRegistryRecorderOptions {
  /** Deployed KyxRegistry package hash, e.g. `hash-1e2b…` or bare hex. */
  registryPackageHash: string;
  /** Service-account key material directly: PEM text, or base64-of-PEM (preferred on PaaS). */
  secretKey?: string;
  /** Path to the service-account secret key PEM (fallback to {@link secretKey}). */
  secretKeyPath?: string;
  /** Key algorithm of the PEM: 'ed25519' (default) or 'secp256k1'. */
  keyAlgorithm: 'ed25519' | 'secp256k1';
  /** Casper node JSON-RPC endpoints, tried in order until one succeeds. */
  nodeRpcs: string[];
  chainName: string;
  /** Gas payment in motes for a call (default 10 CSPR). */
  paymentMotes: number;
  log?: (msg: string, meta?: unknown) => void;
}

export interface RegisterAgentArgs {
  did: string;
  /** Casper account-hash hex of the operator/agent (bare or `account-hash-…`). */
  operatorAccountHash: string;
  agentName: string;
  publicKey: string;
}

export interface UpdateTrustScoreArgs {
  did: string;
  /** 0–100 trust score (contract stores u8). */
  score: number;
  tier: string;
  /** Completion rate as a 0–1 fraction; broadcast as basis points (u32). */
  completionRate: number;
  transactionCount: number;
  totalDisputes: number;
}

export class CasperRegistryRecorder {
  private signerKey?: PrivateKey;
  private readonly log: (msg: string, meta?: unknown) => void;

  constructor(private readonly opts: CasperRegistryRecorderOptions) {
    this.log = opts.log ?? (() => {});
  }

  private signer(): PrivateKey {
    if (!this.signerKey) {
      const algo =
        this.opts.keyAlgorithm === 'secp256k1'
          ? sdk.KeyAlgorithm.SECP256K1
          : sdk.KeyAlgorithm.ED25519;
      this.signerKey = sdk.PrivateKey.fromPem(this.loadPem(), algo);
    }
    return this.signerKey;
  }

  /** Resolve the PEM from the inline key (PEM or base64-of-PEM) or, failing that, a file. */
  private loadPem(): string {
    const inline = this.opts.secretKey?.trim();
    if (inline) {
      if (inline.includes('-----BEGIN')) return inline;
      // Treat as base64-encoded PEM (robust against env-var newline mangling).
      return Buffer.from(inline, 'base64').toString('utf8');
    }
    if (this.opts.secretKeyPath) return readFileSync(this.opts.secretKeyPath, 'utf8');
    throw new Error('no registry service key configured (KYX_REGISTRY_SECRET_KEY[_PATH])');
  }

  async registerAgent(args: RegisterAgentArgs): Promise<{ recorded: boolean; detail?: string }> {
    const operatorKey = args.operatorAccountHash.startsWith('account-hash-')
      ? args.operatorAccountHash
      : `account-hash-${args.operatorAccountHash}`;
    return this.broadcast('register_agent', () =>
      sdk.Args.fromMap({
        did: sdk.CLValue.newCLString(args.did),
        operator: sdk.CLValue.newCLKey(sdk.Key.newKey(operatorKey)),
        agent_name: sdk.CLValue.newCLString(args.agentName),
        public_key: sdk.CLValue.newCLString(args.publicKey),
      }),
      args,
    );
  }

  async updateTrustScore(args: UpdateTrustScoreArgs): Promise<{ recorded: boolean; detail?: string }> {
    const completionRateBps = Math.round(args.completionRate * 10_000);
    return this.broadcast('update_trust_score', () =>
      sdk.Args.fromMap({
        did: sdk.CLValue.newCLString(args.did),
        score: sdk.CLValue.newCLUint8(args.score),
        tier: sdk.CLValue.newCLString(args.tier),
        completion_rate_bps: sdk.CLValue.newCLUInt32(completionRateBps),
        total_transactions: sdk.CLValue.newCLUint64(args.transactionCount),
        total_disputes: sdk.CLValue.newCLUint64(args.totalDisputes),
      }),
      args,
    );
  }

  private async broadcast(
    entryPoint: string,
    buildArgs: () => ReturnType<typeof sdk.Args.fromMap>,
    meta: unknown,
  ): Promise<{ recorded: boolean; detail?: string }> {
    try {
      const signer = this.signer();
      const packageHash = this.opts.registryPackageHash.replace(/^hash-/, '');

      const transaction = new sdk.ContractCallBuilder()
        .byPackageHash(packageHash)
        .entryPoint(entryPoint)
        .runtimeArgs(buildArgs())
        .from(signer.publicKey)
        .chainName(this.opts.chainName)
        .payment(this.opts.paymentMotes)
        .build();

      transaction.sign(signer);
      // Broadcast via each node in turn; only the last endpoint's failure propagates.
      const result = await tryEndpoints(this.opts.nodeRpcs, (nodeRpc) => {
        const rpc = new sdk.RpcClient(new sdk.HttpHandler(nodeRpc));
        return rpc.putTransaction(transaction);
      });
      const txHash = result.transactionHash.toHex?.() ?? String(result.transactionHash);

      this.log(`KyxRegistry ${entryPoint} broadcast`, { txHash, ...(meta as object) });
      return { recorded: true, detail: txHash };
    } catch (err) {
      this.log(`KyxRegistry ${entryPoint} failed (best-effort)`, {
        error: err instanceof Error ? err.message : String(err),
        ...(meta as object),
      });
      return { recorded: false, detail: 'broadcast_failed' };
    }
  }
}
