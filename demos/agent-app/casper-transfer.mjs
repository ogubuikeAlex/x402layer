/**
 * Real native CSPR settlement for the demo. The agent (which holds its own key)
 * signs and broadcasts an actual on-chain transfer from its wallet to the
 * merchant's account - so funds genuinely move and the deploy is viewable on
 * cspr.live. Tries each configured node in order (RPC fallback).
 *
 * Note: only the payer can authorise moving its own funds, so the transfer is
 * signed here (agent-side), not by the facilitator. The facilitator still
 * verifies the layer402 payment and issues the signed receipt / trust update.
 */
import { createRequire } from 'node:module';

const sdk = createRequire(import.meta.url)('casper-js-sdk');

// Casper native transfers have a protocol minimum of 2.5 CSPR.
export const MIN_TRANSFER_MOTES = 2_500_000_000n;
const DEFAULT_PAYMENT_MOTES = '100000000';
const DEFAULT_TTL_MS = 1800000;

/** Try each RPC endpoint in order; only the last failure propagates. */
async function tryEndpoints(endpoints, attempt) {
  let lastError;
  for (const endpoint of endpoints) {
    try {
      return await attempt(endpoint);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('no RPC endpoints configured');
}

/** Normalise a Casper public key hex string, or return null for account hashes. */
function toPublicKeyHex(recipient) {
  const hex = recipient.replace(/^0x/, '');
  if (!/^(01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/.test(hex)) return null;
  return hex;
}

function memoToTransferId(memo) {
  if (!memo) return Date.now();
  const idHex = Buffer.from(memo).toString('hex').slice(0, 12) || '0';
  return Number(BigInt(`0x${idHex}`));
}

/**
 * Broadcast a native CSPR transfer. Returns { txHash } on success, or
 * { skipped, reason } when the recipient isn't a Casper public key (so the demo
 * still runs against a placeholder merchant without throwing).
 */
export async function broadcastCsprTransfer({
  seedHex,
  recipient,
  amountMotes,
  chainName,
  nodeRpcs,
  paymentMotes = DEFAULT_PAYMENT_MOTES,
  memo,
}) {
  const recipientPublicKeyHex = toPublicKeyHex(recipient);
  if (!recipientPublicKeyHex) {
    return { skipped: true, reason: 'recipient_not_public_key' };
  }
  if (BigInt(amountMotes) < MIN_TRANSFER_MOTES) {
    return { skipped: true, reason: 'below_min_transfer' };
  }

  const signer = sdk.PrivateKey.fromHex(seedHex, sdk.KeyAlgorithm.ED25519);
  const deploy = sdk.makeCsprTransferDeploy({
    senderPublicKeyHex: signer.publicKey.toHex(),
    recipientPublicKeyHex,
    transferAmount: String(amountMotes),
    chainName,
    memo: String(memoToTransferId(memo)),
    ttl: DEFAULT_TTL_MS,
    gasPrice: 1,
    paymentAmount: String(paymentMotes),
  });
  deploy.sign(signer);

  const result = await tryEndpoints(nodeRpcs, (nodeRpc) => {
    const rpc = new sdk.RpcClient(new sdk.HttpHandler(nodeRpc));
    return rpc.putDeploy(deploy);
  });
  const txHash = result.deployHash?.toHex?.() ?? String(result.deployHash);
  return { txHash };
}

