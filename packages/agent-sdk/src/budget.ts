import type { PaymentRequired } from '@fourotwo/types';

import { BudgetExceededError } from './errors.js';

const TOKEN_DECIMALS: Record<string, number> = {
  CSPR: 9,
  USDC: 6,
};

/** Decimals for a token symbol; defaults to 9 (Casper native) for unknown tokens. */
export function tokenDecimals(token: string): number {
  return TOKEN_DECIMALS[token.toUpperCase()] ?? 9;
}

export function amountToTokenUnits(payment: PaymentRequired): number {
  const raw = String(payment.amount);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Payment amount "${payment.amount}" is not a non-negative integer`);
  }
  const decimals = tokenDecimals(payment.token);
  const base = 10n ** BigInt(decimals);
  const value = BigInt(raw);
  const whole = Number(value / base);
  const frac = Number(value % base) / Number(base);
  return whole + frac;
}

export interface SpendBudget {
  dailyTokens?: number;
  perRequestTokens?: number;
  amountToTokens?: (payment: PaymentRequired) => number;
}

export class BudgetTracker {
  private spentTodayTokens = 0;
  private day: string;

  constructor(
    private readonly budget: SpendBudget = {},
    private readonly now: () => Date = () => new Date(),
  ) {
    this.day = this.utcDay();
  }

  check(payment: PaymentRequired): number {
    this.resetIfNeeded();
    const amountTokens = this.budget.amountToTokens?.(payment) ?? amountToTokenUnits(payment);
    if (this.budget.perRequestTokens !== undefined && amountTokens > this.budget.perRequestTokens) {
      throw new BudgetExceededError(amountTokens, this.budget.perRequestTokens, 'per-request');
    }
    if (
      this.budget.dailyTokens !== undefined &&
      this.spentTodayTokens + amountTokens > this.budget.dailyTokens
    ) {
      throw new BudgetExceededError(amountTokens, this.budget.dailyTokens, 'daily');
    }
    return amountTokens;
  }

  commit(amountTokens: number): void {
    if (!Number.isFinite(amountTokens)) return;
    this.resetIfNeeded();
    this.spentTodayTokens += amountTokens;
  }

  snapshot(): { spentTodayTokens: number; utcDay: string } {
    this.resetIfNeeded();
    return { spentTodayTokens: this.spentTodayTokens, utcDay: this.day };
  }

  private resetIfNeeded(): void {
    const current = this.utcDay();
    if (current !== this.day) {
      this.day = current;
      this.spentTodayTokens = 0;
    }
  }

  private utcDay(): string {
    return this.now().toISOString().slice(0, 10);
  }
}
