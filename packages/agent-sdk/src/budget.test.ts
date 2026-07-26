import { describe, expect, it } from 'vitest';

import { BudgetTracker } from './budget.js';
import { BudgetExceededError } from './errors.js';

// 500000 base units of USDC (6 decimals) = 0.5 USDC.
const payment = { amount: '500000', token: 'USDC', network: 'casper', recipient: 'r', expiry: 9999999999, nonce: 'n' } as const;

describe('BudgetTracker', () => {
  it('rejects payments over the per-request limit before commit', () => {
    const budget = new BudgetTracker({ perRequestTokens: 0.1 });
    expect(() => budget.check(payment)).toThrow(BudgetExceededError);
  });

  it('converts base units to whole tokens using the token decimals', () => {
    const budget = new BudgetTracker({});
    expect(budget.check(payment)).toBe(0.5);
    // CSPR has 9 decimals: 2e9 motes = 2 CSPR.
    const cspr = { ...payment, token: 'CSPR', amount: '2000000000' } as const;
    expect(budget.check(cspr)).toBe(2);
  });

  it('rejects a non-numeric amount instead of disabling the cap', () => {
    const budget = new BudgetTracker({ perRequestTokens: 1 });
    const bad = { ...payment, amount: 'abc' } as const;
    expect(() => budget.check(bad)).toThrow();
  });

  it('resets the daily counter at UTC midnight', () => {
    let now = new Date('2026-06-21T23:59:00Z');
    const budget = new BudgetTracker({ dailyTokens: 1 }, () => now);
    const amount = budget.check(payment);
    budget.commit(amount);
    expect(budget.snapshot().spentTodayTokens).toBe(0.5);
    now = new Date('2026-06-22T00:00:01Z');
    expect(budget.snapshot().spentTodayTokens).toBe(0);
  });
});
