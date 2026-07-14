'use client';

import { useState } from 'react';

import { TransactionTable } from './TransactionTable';
import { NEXT_PUBLIC_KYX_REGISTRY_URL, type DashboardSettlement } from '@/lib/kyx';

export function AgentTransactions({
  did,
  initialSettlements,
}: {
  did: string;
  initialSettlements: DashboardSettlement[];
}) {
  const [settlements, setSettlements] = useState(initialSettlements);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setNote(null);
    try {
      const res = await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/agents/${encodeURIComponent(did)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`registry responded ${res.status}`);
      const body = (await res.json()) as { settlements: DashboardSettlement[] };
      setSettlements(body.settlements.slice(0, 5));
      setNote(`updated ${new Date().toLocaleTimeString()}`);
    } catch {
      setNote('refresh failed - is the registry reachable?');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[9px] uppercase tracking-wide2 text-text-dim">
          transactions{note ? ` · ${note}` : ''}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="border border-hairline px-3 py-1.5 text-[9px] uppercase tracking-wide2 text-text-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {refreshing ? 'refreshing…' : 'refresh'}
        </button>
      </div>
      <TransactionTable settlements={settlements} />
    </div>
  );
}
