import type { PaymentPayload, SettleRequest, SettlementReceipt, SettleResponse } from '@fourotwo/types';

import type { AppContext } from '../context.js';
import { SettlementUnconfiguredError } from '../chains/casper.js';
import { settlementId } from '../util/ids.js';

export interface SettleOutcome {
  status: number;
  body: SettleResponse | { error: string; detail: string };
}

export async function runSettle(ctx: AppContext, req: SettleRequest): Promise<SettleOutcome> {
  if (!req || typeof req.verification_id !== 'string') {
    return { status: 400, body: { error: 'MALFORMED_REQUEST', detail: 'verification_id required' } };
  }

  const existing = await ctx.verifications.get(req.verification_id);
  if (!existing) {
    return {
      status: 404,
      body: { error: 'VERIFICATION_NOT_FOUND', detail: `Unknown or expired ${req.verification_id}` },
    };
  }

  const requestedMode = req.settlement_mode ?? 'auto';
  if (requestedMode !== 'auto' && requestedMode !== 'direct' && requestedMode !== 'batch') {
    return {
      status: 400,
      body: {
        error: 'UNSUPPORTED_SETTLEMENT_MODE',
        detail: `Supported settlement modes: auto, direct, batch (got "${requestedMode}")`,
      },
    };
  }

  const record = await ctx.verifications.claim(req.verification_id);
  if (!record) {
    return { status: 409, body: { error: 'ALREADY_SETTLED', detail: req.verification_id } };
  }

  const { payload, trustScore } = record;

  const { autoThresholdMotes } = ctx.config.batch;
  const useBatch =
    requestedMode === 'batch' ||
    (requestedMode === 'auto' &&
      autoThresholdMotes > 0n &&
      BigInt(payload.paymentRequired.amount) <= autoThresholdMotes);
  if (useBatch) {
    return settleBatched(ctx, req.verification_id, payload, trustScore ?? 0);
  }
  let txHash: string | undefined;
  let state: 'pending' | 'confirmed' = 'pending';
  let warning: string | undefined;
  let liveSettlementUnconfigured = false;
  if (ctx.upstreamFacilitator) {
    try {
      const result = await ctx.upstreamFacilitator.settle(payload);
      txHash = result.txHash;
      state = result.state;
    } catch (err) {
      await ctx.verifications.unclaim(req.verification_id);
      return {
        status: 502,
        body: { error: 'UPSTREAM_SETTLEMENT_FAILED', detail: (err as Error).message },
      };
    }
  } else {
    const adapter = ctx.adapters.get(payload.network);
    if (!adapter) {
      await ctx.verifications.unclaim(req.verification_id);
      return { status: 400, body: { error: 'UNSUPPORTED_NETWORK', detail: payload.network } };
    }
    try {
      const result = await adapter.settleDirect(payload);
      txHash = result.txHash;
      state = result.state === 'confirmed' ? 'confirmed' : 'pending';
    } catch (err) {
      if (err instanceof SettlementUnconfiguredError) {
        liveSettlementUnconfigured = true;
        warning = 'live_settlement_unconfigured: no funds moved and no fee was charged';
      } else {
        await ctx.verifications.unclaim(req.verification_id);
        return { status: 502, body: { error: 'SETTLEMENT_FAILED', detail: (err as Error).message } };
      }
    }
  }

  const sid = settlementId();
  const scoreAtSettlement = trustScore ?? 0;

  const feeMotes = liveSettlementUnconfigured
    ? '0'
    : await ctx.feeLedger.charge({
        settlementId: sid,
        did: payload.agentDid,
        merchant: payload.paymentRequired.recipient,
        amountMotes: payload.paymentRequired.amount,
        mode: 'direct',
      });

  const vault = await ctx.vaultRecorder.record({
    did: payload.agentDid,
    amount: payload.paymentRequired.amount,
    recipient: payload.paymentRequired.recipient,
    settlementId: sid,
    trustScore: scoreAtSettlement,
  });

  const receiptBase: Omit<SettlementReceipt, 'facilitatorSignature'> = {
    settlementId: sid,
    did: payload.agentDid,
    amount: payload.paymentRequired.amount,
    token: payload.paymentRequired.token,
    network: payload.network,
    settlementMode: 'direct',
    txHash,
    feeMotes,
    trustScore: scoreAtSettlement,
    settledAt: new Date().toISOString(),
  };
  const receipt: SettlementReceipt = {
    ...receiptBase,
    facilitatorSignature: ctx.receiptSigner.sign(receiptBase),
  };

  await ctx.verifications.markSettled(req.verification_id);
  void ctx.settlementReporter
    .report({
      payload,
      receipt,
      status: state === 'confirmed' ? 'confirmed' : 'pending',
    })
    .catch((err: Error) =>
      console.error(`[kyx] settlement report failed for ${sid} (${payload.agentDid}): ${err.message}`),
    );

  return {
    status: 200,
    body: {
      settlement_id: sid,
      status: state === 'confirmed' ? 'confirmed' : 'pending',
      mode: 'direct',
      estimated_confirmation_ms: 3000,
      receipt,
      vault_recorded: vault.recorded,
      fee_motes: feeMotes,
      ...(warning ? { warning } : {}),
      ...(vault.recorded && vault.detail ? { vault_tx: vault.detail } : {}),
    },
  };
}

async function settleBatched(
  ctx: AppContext,
  verificationId: string,
  payload: PaymentPayload,
  trustScore: number,
): Promise<SettleOutcome> {
  const sid = settlementId();
  const feeMotes = await ctx.feeLedger.charge({
    settlementId: sid,
    did: payload.agentDid,
    merchant: payload.paymentRequired.recipient,
    amountMotes: payload.paymentRequired.amount,
    mode: 'batch',
  });

  const receiptBase: Omit<SettlementReceipt, 'facilitatorSignature'> = {
    settlementId: sid,
    did: payload.agentDid,
    amount: payload.paymentRequired.amount,
    token: payload.paymentRequired.token,
    network: payload.network,
    settlementMode: 'batch',
    batchId: ctx.batchQueue.currentBatchId,
    feeMotes,
    trustScore,
    settledAt: new Date().toISOString(),
  };
  const receipt: SettlementReceipt = {
    ...receiptBase,
    facilitatorSignature: ctx.receiptSigner.sign(receiptBase),
  };

  await ctx.verifications.markSettled(verificationId);
  const { batchId } = await ctx.batchQueue.enqueue({ settlementId: sid, payload, receipt, trustScore });

  return {
    status: 200,
    body: {
      settlement_id: sid,
      status: 'pending',
      mode: 'batch',
      estimated_confirmation_ms: ctx.config.batch.windowMs,
      receipt,
      batch_id: batchId,
      fee_motes: feeMotes,
    },
  };
}
