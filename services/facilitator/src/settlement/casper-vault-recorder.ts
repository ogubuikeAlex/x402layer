/**
 * The on-chain write is best-effort: any failure is reported as
 * `recorded: false` and never breaks the /settle response.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { PrivateKey } from 'casper-js-sdk';
import type { VaultRecorder, VaultRecordArgs } from './vault-recorder.js';
import { tryEndpoints } from '../chains/rpc-fallback.js';

// casper-js-sdk ships a CommonJS bundle marked `__esModule` with no `default`
// export. ESM named/default/namespace imports each break under one of tsx
// (esbuild) or node - so load it via real `require`, which returns the full
// module object identically in both runtimes. Types come from `import type`.
const sdk = createRequire(import.meta.url)('casper-js-sdk') as typeof import('casper-js-sdk');

export interface CasperVaultRecorderOptions {
  /** Deployed SettlementVault package hash, e.g. `hash-7601…` or bare hex. */
  vaultPackageHash: string;
  /** Service-account key material directly: PEM text, or base64-of-PEM (preferred on PaaS). */
  secretKey?: string;
  /** Path to the service-account secret key PEM (fallback to {@link secretKey}). */
  secretKeyPath?: string;
  /** Key algorithm of the PEM: 'ed25519' (default) or 'secp256k1'. */
  keyAlgorithm: 'ed25519' | 'secp256k1';
  /** Casper node JSON-RPC endpoint(s). When multiple, tried in order on failure. */
  nodeRpc: string;
  /** Optional extra RPC endpoints (incl. the primary) tried in order. */
  nodeRpcs?: string[];
  chainName: string;
  /** Gas payment in motes for the call (cross-contract; default 10 CSPR). */
  paymentMotes: number;
  log?: (msg: string, meta?: unknown) => void;
}

export class CasperVaultRecorder implements VaultRecorder {
  private signerKey?: PrivateKey;
  private readonly nodeRpcs: string[];
  private readonly log: (msg: string, meta?: unknown) => void;

  constructor(private readonly opts: CasperVaultRecorderOptions) {
    this.nodeRpcs = opts.nodeRpcs && opts.nodeRpcs.length > 0 ? opts.nodeRpcs : [opts.nodeRpc];
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
    throw new Error('no facilitator secret key configured (FACILITATOR_SECRET_KEY[_PATH])');
  }

  async record(args: VaultRecordArgs): Promise<{ recorded: boolean; detail?: string }> {
    try {
      const signer = this.signer();
      const packageHash = this.opts.vaultPackageHash.replace(/^hash-/, '');

      const transaction = new sdk.ContractCallBuilder()
        .byPackageHash(packageHash)
        .entryPoint('record_settlement')
        .runtimeArgs(
          sdk.Args.fromMap({
            did: sdk.CLValue.newCLString(args.did),
            amount: sdk.CLValue.newCLString(args.amount),
            recipient: sdk.CLValue.newCLKey(sdk.Key.newKey(args.recipient)),
            settlement_id: sdk.CLValue.newCLString(args.settlementId),
            trust_score: sdk.CLValue.newCLUint8(args.trustScore),
          }),
        )
        .from(signer.publicKey)
        .chainName(this.opts.chainName)
        .payment(this.opts.paymentMotes)
        .build();

      transaction.sign(signer);
      // Broadcast via each node in turn; only the last endpoint's failure propagates.
      const result = await tryEndpoints(this.nodeRpcs, (nodeRpc) => {
        const rpc = new sdk.RpcClient(new sdk.HttpHandler(nodeRpc));
        return rpc.putTransaction(transaction);
      });
      const txHash = result.transactionHash.toHex?.() ?? String(result.transactionHash);

      this.log('SettlementVault record broadcast', { txHash, ...args });
      return { recorded: true, detail: txHash };
    } catch (err) {
      this.log('SettlementVault record failed (best-effort)', {
        error: err instanceof Error ? err.message : String(err),
        ...args,
      });
      return { recorded: false, detail: 'broadcast_failed' };
    }
  }
}
