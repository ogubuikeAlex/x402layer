import type { SettleRequest, SettlementReceipt, SettleResponse } from '@fourotwo/types';

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

  const record = ctx.verifications.get(req.verification_id);
  if (!record) {
    return {
      status: 404,
      body: { error: 'VERIFICATION_NOT_FOUND', detail: `Unknown or expired ${req.verification_id}` },
    };
  }
  if (record.settled) {
    return { status: 409, body: { error: 'ALREADY_SETTLED', detail: req.verification_id } };
  }

  const requestedMode = req.settlement_mode ?? 'auto';
  if (requestedMode !== 'auto' && requestedMode !== 'direct') {
    return {
      status: 400,
      body: {
        error: 'UNSUPPORTED_SETTLEMENT_MODE',
        detail: `Only direct settlement is supported (got "${requestedMode}")`,
      },
    };
  }

  const { payload, trustScore } = record;
  const adapter = ctx.adapters.get(payload.network);
  if (!adapter) {
    return {
      status: 400,
      body: { error: 'UNSUPPORTED_NETWORK', detail: payload.network },
    };
  }

  let txHash: string | undefined;
  let state: 'pending' | 'confirmed' | 'unconfigured' = 'pending';
  try {
    const result = await adapter.settleDirect(payload);
    txHash = result.txHash;
    state = result.state === 'confirmed' ? 'confirmed' : 'pending';
  } catch (err) {
    if (err instanceof SettlementUnconfiguredError) {
      // No live broadcaster configured; surface that clearly rather than fabricating a tx hash.
      state = 'unconfigured';
    } else {
      return {
        status: 502,
        body: { error: 'SETTLEMENT_FAILED', detail: (err as Error).message },
      };
    }
  }

  const sid = settlementId();
  const scoreAtSettlement = trustScore ?? 0;

  // Best-effort on-chain record; failure does not block the response.
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
    trustScore: scoreAtSettlement,
    settledAt: new Date().toISOString(),
  };
  const receipt: SettlementReceipt = {
    ...receiptBase,
    facilitatorSignature: ctx.receiptSigner.sign(receiptBase),
  };

  ctx.verifications.markSettled(req.verification_id);
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
      ...(vault.recorded && vault.detail ? { vault_tx: vault.detail } : {}),
      ...(state === 'unconfigured' ? { warning: 'live_settlement_unconfigured' } : {}),
    },
  };
}
