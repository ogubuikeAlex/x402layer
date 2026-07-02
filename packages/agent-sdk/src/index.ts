import { BudgetTracker, type SpendBudget } from './budget.js';
import { keypairFromPrivateKey, type AgentKeypair } from './did.js';
import { BudgetExceededError } from './errors.js';
import { TransactionLedger, ledgerEntryForPayment, type LedgerEntry } from './ledger.js';
import { readPaymentRequiredHeader, signPayment } from './payment.js';

export * from './budget.js';
export * from './did.js';
export * from './errors.js';
export * from './ledger.js';
export * from './payment.js';

export interface FourotwoAgentOptions {
  did?: string;
  privateKeyHex: string;
  publicKeyHex?: string;
  budget?: SpendBudget;
  logFilePath?: string;
  fetchImpl?: typeof fetch;
}

export class fourotwoAgent {
  readonly did: string;
  readonly keypair: AgentKeypair;
  private readonly budget: BudgetTracker;
  private readonly ledger: TransactionLedger;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FourotwoAgentOptions) {
    this.keypair = keypairFromPrivateKey(options.privateKeyHex);
    this.did = options.did ?? this.keypair.did;
    this.budget = new BudgetTracker(options.budget);
    this.ledger = new TransactionLedger(options.logFilePath);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const first = await this.fetchImpl(input, init);
    if (first.status !== 402) return first;

    const paymentRequired = readPaymentRequiredHeader(first.headers);
    let amountUsd = 0;
    try {
      amountUsd = this.budget.check(paymentRequired);
      const signed = signPayment({
        paymentRequired,
        privateKeyHex: this.keypair.privateKeyHex,
        payerPublicKeyHex: this.keypair.taggedPublicKeyHex,
      });
      const headers = new Headers(init.headers);
      headers.set('PAYMENT-REQUIRED', signed.paymentRequiredEncoded);
      headers.set('PAYMENT-SIGNATURE', signed.paymentSignature);
      headers.set('X-FOUROTWO-DID', this.did);

      const retry = await this.fetchImpl(input, { ...init, headers });
      const status = retry.ok ? 'success' : 'failed';
      if (retry.ok) this.budget.commit(amountUsd);
      await this.ledger.append(
        ledgerEntryForPayment({
          did: this.did,
          payment: paymentRequired,
          status,
          responseStatus: retry.status,
          error: retry.ok ? undefined : `HTTP ${retry.status}`,
        }),
      );
      return retry;
    } catch (err) {
      await this.ledger.append(
        ledgerEntryForPayment({
          did: this.did,
          payment: paymentRequired,
          status: err instanceof BudgetExceededError ? 'budget_rejected' : 'failed',
          error: (err as Error).message,
        }),
      );
      throw err;
    }
  }

  getTransactionLog(): LedgerEntry[] {
    return this.ledger.all();
  }
}
