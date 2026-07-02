export class PaymentExpiredError extends Error {
  constructor(expiry: number) {
    super(`Payment request expired at ${expiry}`);
    this.name = 'PaymentExpiredError';
  }
}

export class PaymentSigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentSigningError';
  }
}

export class PaymentRequiredHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRequiredHeaderError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    readonly attemptedAmount: number,
    readonly limit: number,
    readonly scope: 'daily' | 'per-request',
  ) {
    super(
      `Payment amount ${attemptedAmount} exceeds ${scope} budget limit ${limit}`,
    );
    this.name = 'BudgetExceededError';
  }
}
