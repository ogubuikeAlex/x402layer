
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { tryEndpoints } from '../chains/rpc-fallback.js';
import type { FeeLedgerStore } from './ledger.js';

const sdk = createRequire(import.meta.url)('casper-js-sdk') as typeof import('casper-js-sdk');

export const MIN_TRANSFER_MOTES = 2_500_000_000n;

export interface CollectResult {
  collected: boolean;
  reason?:
    | 'no_fee_recipient'
    | 'recipient_not_public_key'
    | 'nothing_to_collect'
    | 'below_min_transfer'
    | 'transfer_failed';
  txHash?: string;
  amountMotes?: string;
  entryCount?: number;
  detail?: string;
}

export interface FeeTransfer {
  transfer(amountMotes: string, recipientPublicKeyHex: string): Promise<{ txHash: string }>;
}

export function isCasperPublicKey(value: string): boolean {
  const hex = value.trim().replace(/^0x/, '');
  return /^(01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/.test(hex);
}

export interface NativeCasperFeeTransferOptions {
  secretKey?: string;
  secretKeyPath?: string;
  keyAlgorithm: 'ed25519' | 'secp256k1';
  nodeRpcs: string[];
  chainName: string;
  paymentMotes?: number;
}

export class NativeCasperFeeTransfer implements FeeTransfer {
  private signerKey?: import('casper-js-sdk').PrivateKey;

  constructor(private readonly opts: NativeCasperFeeTransferOptions) {}

  private signer(): import('casper-js-sdk').PrivateKey {
    if (!this.signerKey) {
      const algo =
        this.opts.keyAlgorithm === 'secp256k1' ? sdk.KeyAlgorithm.SECP256K1 : sdk.KeyAlgorithm.ED25519;
      this.signerKey = sdk.PrivateKey.fromPem(this.loadPem(), algo);
    }
    return this.signerKey;
  }

  private loadPem(): string {
    const inline = this.opts.secretKey?.trim();
    if (inline) {
      if (inline.includes('-----BEGIN')) return inline;
      return Buffer.from(inline, 'base64').toString('utf8');
    }
    if (this.opts.secretKeyPath) return readFileSync(this.opts.secretKeyPath, 'utf8');
    throw new Error('no facilitator secret key configured (FACILITATOR_SECRET_KEY[_PATH])');
  }

  async transfer(amountMotes: string, recipientPublicKeyHex: string): Promise<{ txHash: string }> {
    const signer = this.signer();
    const deploy = sdk.makeCsprTransferDeploy({
      senderPublicKeyHex: signer.publicKey.toHex(),
      recipientPublicKeyHex: recipientPublicKeyHex.replace(/^0x/, ''),
      transferAmount: amountMotes,
      chainName: this.opts.chainName,
      paymentAmount: String(this.opts.paymentMotes ?? 100_000_000),
    });
    deploy.sign(signer);
    const result = await tryEndpoints(this.opts.nodeRpcs, (nodeRpc) => {
      const rpc = new sdk.RpcClient(new sdk.HttpHandler(nodeRpc));
      return rpc.putDeploy(deploy);
    });
    const txHash = result.deployHash?.toHex?.() ?? String(result.deployHash);
    return { txHash };
  }
}

export class FeeCollector {
  constructor(
    private readonly opts: {
      ledger: FeeLedgerStore;
      transfer: FeeTransfer;
      minTransferMotes?: bigint;
      log?: (msg: string, meta?: unknown) => void;
    },
  ) {}

  private get min(): bigint {
    return this.opts.minTransferMotes ?? MIN_TRANSFER_MOTES;
  }

  private log(msg: string, meta?: unknown): void {
    this.opts.log?.(msg, meta);
  }


  async collect(): Promise<CollectResult> {
    const { recipient, totalMotes, entryIds } = await this.opts.ledger.uncollected();
    if (!recipient) return { collected: false, reason: 'no_fee_recipient' };
    if (!isCasperPublicKey(recipient)) {
      return { collected: false, reason: 'recipient_not_public_key', detail: recipient };
    }
    if (entryIds.length === 0 || BigInt(totalMotes) === 0n) {
      return { collected: false, reason: 'nothing_to_collect', amountMotes: totalMotes, entryCount: 0 };
    }
    if (BigInt(totalMotes) < this.min) {
      return { collected: false, reason: 'below_min_transfer', amountMotes: totalMotes, entryCount: entryIds.length };
    }

    let txHash: string;
    try {
      ({ txHash } = await this.opts.transfer.transfer(totalMotes, recipient));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.log('fee collection transfer failed', { detail, amountMotes: totalMotes });
      return { collected: false, reason: 'transfer_failed', amountMotes: totalMotes, detail };
    }

    await this.opts.ledger.markCollected(entryIds, txHash);
    this.log('fees collected on-chain', { txHash, amountMotes: totalMotes, entryCount: entryIds.length });
    return { collected: true, txHash, amountMotes: totalMotes, entryCount: entryIds.length };
  }
}
