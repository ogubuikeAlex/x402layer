import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { PaymentPayload } from '@fourotwo/types';

import type { ChainAdapter, SettlementResult, TxStatus } from './types.js';
import { SettlementUnconfiguredError } from './casper.js';

function keccak(bytes: Uint8Array): Uint8Array {
  return keccak_256(bytes);
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function pad32(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

function uint256(value: bigint): Uint8Array {
  let hex = value.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return pad32(hexToBytes(hex));
}

function addr32(address: string): Uint8Array {
  return pad32(hexToBytes(address.toLowerCase().replace(/^0x/, '')));
}

function bytes32FromNonce(nonce: string): Uint8Array {
  if (/^0x[0-9a-fA-F]{64}$/.test(nonce)) return hexToBytes(nonce.slice(2));
  return keccak(new TextEncoder().encode(nonce));
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

const TRANSFER_WITH_AUTH_TYPEHASH = keccak(
  utf8(
    'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)',
  ),
);

const EIP712_DOMAIN_TYPEHASH = keccak(
  utf8('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
);

export interface BaseEip712Domain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: string;
}

export interface BaseRpcClient {
  getErc20Balance(token: string, address: string): Promise<bigint>;
  broadcastTransferWithAuthorization(payload: PaymentPayload): Promise<{ txHash: string }>;
  getTransactionStatus(txHash: string): Promise<TxStatus>;
}

export class BaseAdapter implements ChainAdapter {
  readonly network = 'base' as const;

  constructor(
    private readonly client: BaseRpcClient,
    private readonly domain: BaseEip712Domain,
  ) {}

  private domainSeparator(): Uint8Array {
    return keccak(
      concat(
        EIP712_DOMAIN_TYPEHASH,
        keccak(utf8(this.domain.name)),
        keccak(utf8(this.domain.version)),
        uint256(this.domain.chainId),
        addr32(this.domain.verifyingContract),
      ),
    );
  }

  private digest(payload: PaymentPayload): Uint8Array {
    const pr = payload.paymentRequired;
    const structHash = keccak(
      concat(
        TRANSFER_WITH_AUTH_TYPEHASH,
        addr32(payload.payer),
        addr32(pr.recipient),
        uint256(BigInt(pr.amount)),
        uint256(0n), // validAfter
        uint256(BigInt(pr.expiry)), // validBefore
        bytes32FromNonce(pr.nonce),
      ),
    );
    return keccak(concat(Uint8Array.from([0x19, 0x01]), this.domainSeparator(), structHash));
  }

  async verifySignature(payload: PaymentPayload): Promise<boolean> {
    try {
      const sigHex = payload.signature.startsWith('0x')
        ? payload.signature.slice(2)
        : payload.signature;
      const sigBytes = hexToBytes(sigHex);
      if (sigBytes.length !== 65) return false;
      const r = sigBytes.slice(0, 32);
      const s = sigBytes.slice(32, 64);
      let v = sigBytes[64]!;
      if (v >= 27) v -= 27;
      if (v !== 0 && v !== 1) return false;

      const digest = this.digest(payload);
      const sig = secp256k1.Signature.fromCompact(concat(r, s)).addRecoveryBit(v);
      const point = sig.recoverPublicKey(digest);
      const pub = point.toRawBytes(false); // 65 bytes, 0x04 prefix
      const recovered = '0x' + bytesToHex(keccak(pub.slice(1)).slice(-20));
      return recovered.toLowerCase() === payload.payer.toLowerCase();
    } catch {
      return false;
    }
  }

  async checkBalance(address: string, amount: bigint): Promise<boolean> {
    const balance = await this.client.getErc20Balance(this.domain.verifyingContract, address);
    return balance >= amount;
  }

  async settleDirect(payload: PaymentPayload): Promise<SettlementResult> {
    const { txHash } = await this.client.broadcastTransferWithAuthorization(payload);
    return { txHash, state: 'pending', mode: 'direct' };
  }

  async getTransactionStatus(txHash: string): Promise<TxStatus> {
    return this.client.getTransactionStatus(txHash);
  }
}

/** Default Base client over JSON-RPC. Reads are live; broadcast requires a key. */
export class JsonRpcBaseClient implements BaseRpcClient {
  constructor(
    private readonly opts: { rpcUrl: string; fetchImpl?: typeof fetch },
  ) {}

  private get fetch(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await this.fetch(this.opts.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`Base RPC ${method} failed: ${body.error.message}`);
    return body.result as T;
  }

  async getErc20Balance(token: string, address: string): Promise<bigint> {
    // balanceOf(address) selector 0x70a08231
    const data = '0x70a08231' + bytesToHex(addr32(address));
    const result = await this.rpc<string>('eth_call', [{ to: token, data }, 'latest']);
    return BigInt(result ?? '0x0');
  }

  async broadcastTransferWithAuthorization(): Promise<{ txHash: string }> {
    throw new SettlementUnconfiguredError(
      'Base live settlement is not wired in this environment. Provide the ' +
        'facilitator EVM relayer key to enable transferWithAuthorization relaying.',
    );
  }

  async getTransactionStatus(txHash: string): Promise<TxStatus> {
    const receipt = await this.rpc<{ status?: string; blockNumber?: string } | null>(
      'eth_getTransactionReceipt',
      [txHash],
    );
    if (!receipt) return { txHash, state: 'pending' };
    return {
      txHash,
      state: receipt.status === '0x1' ? 'confirmed' : 'failed',
      blockHeight: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
    };
  }
}
