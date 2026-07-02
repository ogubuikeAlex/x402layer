import type { PaymentRequired } from '@fourotwo/types';

import { BudgetExceededError } from './errors.js';

export interface SpendBudget {
  dailyUsd?: number;
  perRequestUsd?: number;
  amountToUsd?: (payment: PaymentRequired) => number;
}

export class BudgetTracker {
  private spentTodayUsd = 0;
  private day: string;

  constructor(
    private readonly budget: SpendBudget = {},
    private readonly now: () => Date = () => new Date(),
  ) {
    this.day = this.utcDay();
  }

  check(payment: PaymentRequired): number {
    this.resetIfNeeded();
    const amountUsd = this.budget.amountToUsd?.(payment) ?? Number(payment.amount) / 1_000_000;
    if (this.budget.perRequestUsd !== undefined && amountUsd > this.budget.perRequestUsd) {
      throw new BudgetExceededError(amountUsd, this.budget.perRequestUsd, 'per-request');
    }
    if (this.budget.dailyUsd !== undefined && this.spentTodayUsd + amountUsd > this.budget.dailyUsd) {
      throw new BudgetExceededError(amountUsd, this.budget.dailyUsd, 'daily');
    }
    return amountUsd;
  }

  commit(amountUsd: number): void {
    this.resetIfNeeded();
    this.spentTodayUsd += amountUsd;
  }

  snapshot(): { spentTodayUsd: number; utcDay: string } {
    this.resetIfNeeded();
    return { spentTodayUsd: this.spentTodayUsd, utcDay: this.day };
  }

  private resetIfNeeded(): void {
    const current = this.utcDay();
    if (current !== this.day) {
      this.day = current;
      this.spentTodayUsd = 0;
    }
  }

  private utcDay(): string {
    return this.now().toISOString().slice(0, 10);
  }
}
