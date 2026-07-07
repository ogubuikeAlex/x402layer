import { sha512 } from '@noble/hashes/sha2';
import * as ed25519 from '@noble/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import type { PaymentPayload } from '@fourotwo/types';
import { canonicalPaymentBytes } from '@fourotwo/types';

import type { ChainAdapter, SettlementResult, TxStatus } from './types.js';
import { decodeSignature, isHex } from './signature-util.js';
import { tryEndpoints } from './rpc-fallback.js';

// Wire ed25519 hashing (required by @noble/ed25519 v2 before verify works).
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/** Thrown when settlement is requested but no live broadcaster is configured. */
export class SettlementUnconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementUnconfiguredError';
  }
}

export interface CasperRpcClient {
  /** Balance of an account (by account-hash hex) in motes. */
  getBalanceMotes(accountHashHex: string): Promise<bigint>;
  /** Broadcast a native CSPR transfer; returns the deploy hash. */
  broadcastTransfer(args: {
    recipient: string;
    amountMotes: bigint;
    memo: string;
  }): Promise<{ deployHash: string }>;
  /** Status of a previously broadcast deploy. */
  getDeployStatus(deployHash: string): Promise<TxStatus>;
}

/** Strip a leading `01`/`02` Casper algorithm tag from a public key hex. */
function rawCasperPublicKey(pubHex: string): Uint8Array {
  const hex = (pubHex.startsWith('0x') ? pubHex.slice(2) : pubHex).toLowerCase();
  const stripped = (hex.length === 66 || hex.length === 68) && /^0[12]/.test(hex) ? hex.slice(2) : hex;
  return hexToBytes(stripped);
}

export class CasperAdapter implements ChainAdapter {
  readonly network = 'casper' as const;

  constructor(private readonly client: CasperRpcClient) {}

  async verifySignature(payload: PaymentPayload): Promise<boolean> {
    try {
      const message = canonicalPaymentBytes(payload.paymentRequired);
      const sig = decodeSignature(payload.signature);
      const pub = rawCasperPublicKey(payload.payer);
      // Ed25519 signatures are 64 bytes, public keys 32 bytes.
      if (sig.length !== 64 || pub.length !== 32) return false;
      return ed25519.verify(sig, message, pub);
    } catch {
      return false;
    }
  }

  async checkBalance(address: string, amount: bigint): Promise<boolean> {
    const accountHash = address.startsWith('account-hash-')
      ? address.slice('account-hash-'.length)
      : address;
    const balance = await this.client.getBalanceMotes(accountHash);
    return balance >= amount;
  }

  async settleDirect(payload: PaymentPayload): Promise<SettlementResult> {
    const { recipient, amount } = payload.paymentRequired;
    const { deployHash } = await this.client.broadcastTransfer({
      recipient,
      amountMotes: BigInt(amount),
      memo: payload.agentDid,
    });
    return { txHash: deployHash, state: 'pending', mode: 'direct' };
  }

  async getTransactionStatus(txHash: string): Promise<TxStatus> {
    return this.client.getDeployStatus(txHash);
  }
}

/**
 * Reads are live; `broadcastTransfer` throws {@link SettlementUnconfiguredError}
 * until a live broadcaster is configured, so the gap is loud rather than silent.
 */
export class CsprCloudCasperClient implements CasperRpcClient {
  constructor(
    private readonly opts: {
      csprCloudApiUrl: string;
      csprCloudApiKey?: string | undefined;
      nodeRpc: string;
      /** Optional extra RPC endpoints (incl. the primary) tried in order. */
      nodeRpcs?: string[];
      fetchImpl?: typeof fetch;
    },
  ) {}

  private get fetch(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  /** All configured RPC endpoints, primary first. */
  private get nodeRpcs(): string[] {
    return this.opts.nodeRpcs && this.opts.nodeRpcs.length > 0
      ? this.opts.nodeRpcs
      : [this.opts.nodeRpc];
  }

  async getBalanceMotes(accountHashHex: string): Promise<bigint> {
    const url = `${this.opts.csprCloudApiUrl}/accounts/${accountHashHex}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.opts.csprCloudApiKey) headers.authorization = this.opts.csprCloudApiKey;
    const res = await this.fetch(url, { headers });
    if (!res.ok) throw new Error(`CSPR.cloud balance lookup failed: ${res.status}`);
    const body = (await res.json()) as { data?: { balance?: string } };
    return BigInt(body.data?.balance ?? '0');
  }

  async broadcastTransfer(): Promise<{ deployHash: string }> {
    throw new SettlementUnconfiguredError(
      'Casper live settlement is not wired in this environment. Configure the ' +
        'facilitator service key + casper-js-sdk broadcaster to enable real ' +
        'on-chain settlement.',
    );
  }

  async getDeployStatus(deployHash: string): Promise<TxStatus> {
    try {
      // Try each node in turn; only the last endpoint's failure propagates.
      return await tryEndpoints(this.nodeRpcs, async (nodeRpc) => {
        const res = await this.fetch(nodeRpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'info_get_deploy',
            params: { deploy_hash: deployHash },
          }),
        });
        if (!res.ok) throw new Error(`info_get_deploy HTTP ${res.status}`);
        const body = (await res.json()) as {
          result?: { execution_results?: { result?: { Success?: unknown; Failure?: unknown } }[] };
        };
        const exec = body.result?.execution_results?.[0]?.result;
        if (!exec) return { txHash: deployHash, state: 'pending' as const };
        return { txHash: deployHash, state: exec.Success ? ('confirmed' as const) : ('failed' as const) };
      });
    } catch {
      // All endpoints failed - status is genuinely unknown, not an error to throw.
      return { txHash: deployHash, state: 'unknown' };
    }
  }
}

export { isHex };
