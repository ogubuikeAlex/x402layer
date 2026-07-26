import { describe, expect, it } from 'vitest';

import { FeeLedger } from './ledger.js';
import { FeeCollector, type FeeTransfer } from './collector.js';

const PUBKEY = '01' + 'a'.repeat(64); // a well-formed ed25519 Casper public key

function mockTransfer(txHash = 'deploy-abc') {
  const calls: { amountMotes: string; recipient: string }[] = [];
  const transfer: FeeTransfer = {
    async transfer(amountMotes, recipient) {
      calls.push({ amountMotes, recipient });
      return { txHash };
    },
  };
  return { transfer, calls };
}

async function charge(ledger: FeeLedger, id: string, amountMotes: string) {
  await ledger.charge({ settlementId: id, did: 'd', merchant: 'm', amountMotes, mode: 'direct' });
}

describe('FeeCollector', () => {
  it('does not collect when no recipient is configured', async () => {
    const ledger = new FeeLedger(10, undefined);
    await charge(ledger, 's1', '1000000000');
    const collector = new FeeCollector({ ledger, transfer: mockTransfer().transfer, minTransferMotes: 1n });
    const res = await collector.collect();
    expect(res).toMatchObject({ collected: false, reason: 'no_fee_recipient' });
  });

  it('rejects a recipient that is not a Casper public key', async () => {
    const ledger = new FeeLedger(10, 'account-hash-deadbeef');
    await charge(ledger, 's1', '1000000000');
    const collector = new FeeCollector({ ledger, transfer: mockTransfer().transfer, minTransferMotes: 1n });
    const res = await collector.collect();
    expect(res).toMatchObject({ collected: false, reason: 'recipient_not_public_key' });
  });

  it('sweeps accrued fees on-chain, marks them collected, and does not double-collect', async () => {
    const ledger = new FeeLedger(10000, PUBKEY); // 100% fee keeps the math obvious
    await charge(ledger, 's1', '2000000000');
    await charge(ledger, 's2', '1000000000');
    const { transfer, calls } = mockTransfer('deploy-xyz');
    const collector = new FeeCollector({ ledger, transfer, minTransferMotes: 1n });

    const res = await collector.collect();
    expect(res).toMatchObject({ collected: true, txHash: 'deploy-xyz', amountMotes: '3000000000', entryCount: 2 });
    expect(calls).toEqual([{ amountMotes: '3000000000', recipient: PUBKEY }]);

    const summary = await ledger.summary();
    expect(summary.collectedFeesMotes).toBe('3000000000');
    expect(summary.uncollectedFeesMotes).toBe('0');

    const again = await collector.collect();
    expect(again).toMatchObject({ collected: false, reason: 'nothing_to_collect' });
    expect(calls).toHaveLength(1); // no second transfer
  });

  it('skips below the native-transfer minimum and leaves fees uncollected', async () => {
    const ledger = new FeeLedger(10000, PUBKEY);
    await charge(ledger, 's1', '1000');
    const collector = new FeeCollector({ ledger, transfer: mockTransfer().transfer, minTransferMotes: 2_500_000_000n });
    const res = await collector.collect();
    expect(res).toMatchObject({ collected: false, reason: 'below_min_transfer', amountMotes: '1000' });
    expect((await ledger.summary()).uncollectedFeesMotes).toBe('1000');
  });

  it('leaves fees uncollected when the on-chain transfer fails', async () => {
    const ledger = new FeeLedger(10000, PUBKEY);
    await charge(ledger, 's1', '3000000000');
    const failing: FeeTransfer = {
      async transfer() {
        throw new Error('rpc down');
      },
    };
    const collector = new FeeCollector({ ledger, transfer: failing, minTransferMotes: 1n });
    const res = await collector.collect();
    expect(res).toMatchObject({ collected: false, reason: 'transfer_failed' });
    expect((await ledger.summary()).uncollectedFeesMotes).toBe('3000000000');
  });
});
