import { describe, expect, it } from 'vitest';

import { BudgetTracker } from './budget.js';
import { BudgetExceededError } from './errors.js';

const payment = { amount: '500000', token: 'USDC', network: 'casper', recipient: 'r', expiry: 9999999999, nonce: 'n' } as const;

describe('BudgetTracker', () => {
  it('rejects payments over the per-request limit before commit', () => {
    const budget = new BudgetTracker({ perRequestUsd: 0.1 });
    expect(() => budget.check(payment)).toThrow(BudgetExceededError);
  });

  it('resets the daily counter at UTC midnight', () => {
    let now = new Date('2026-06-21T23:59:00Z');
    const budget = new BudgetTracker({ dailyUsd: 1 }, () => now);
    const amount = budget.check(payment);
    budget.commit(amount);
    expect(budget.snapshot().spentTodayUsd).toBe(0.5);
    now = new Date('2026-06-22T00:00:01Z');
    expect(budget.snapshot().spentTodayUsd).toBe(0);
  });
});
