import type { PaymentRequired } from '@fourotwo/types';

export interface LedgerEntry {
  id: string;
  timestamp: string;
  did: string;
  recipient: string;
  amount: string;
  token: string;
  network: string;
  status: 'success' | 'failed' | 'budget_rejected';
  responseStatus?: number;
  error?: string;
}

export class TransactionLedger {
  private readonly entries: LedgerEntry[] = [];

  constructor(private readonly logFilePath?: string) {}

  async append(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    if (!this.logFilePath) return;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(this.logFilePath, JSON.stringify(this.entries, null, 2), 'utf8');
  }

  all(): LedgerEntry[] {
    return [...this.entries];
  }
}

export function ledgerEntryForPayment(args: {
  did: string;
  payment: PaymentRequired;
  status: LedgerEntry['status'];
  responseStatus?: number;
  error?: string;
}): LedgerEntry {
  return {
    id: `pay_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    timestamp: new Date().toISOString(),
    did: args.did,
    recipient: args.payment.recipient,
    amount: args.payment.amount,
    token: args.payment.token,
    network: args.payment.network,
    status: args.status,
    responseStatus: args.responseStatus,
    error: args.error,
  };
}
