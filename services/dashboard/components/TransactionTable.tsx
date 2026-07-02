import type { DashboardSettlement } from '@/lib/kyx';

export function TransactionTable({ settlements }: { settlements: DashboardSettlement[] }) {
  if (settlements.length === 0) {
    return (
      <div className="border border-dashed border-hairline bg-surface/40 p-8 text-center text-[12px] text-text-dim">
        No settlement history yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto border border-hairline bg-surface">
      <table className="min-w-full text-left text-[11px]">
        <thead className="border-b border-hairline bg-black/30 text-[9px] uppercase tracking-wide2 text-text-dim">
          <tr>
            <th className="px-4 py-3">timestamp</th>
            <th className="px-4 py-3">recipient</th>
            <th className="px-4 py-3">amount</th>
            <th className="px-4 py-3">status</th>
            <th className="px-4 py-3">trust</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {settlements.map((s) => (
            <tr key={s.settlementId}>
              <td className="whitespace-nowrap px-4 py-3 text-text-mid">{new Date(s.settledAt).toLocaleString()}</td>
              <td className="max-w-[220px] truncate px-4 py-3 text-text">{s.recipient}</td>
              <td className="whitespace-nowrap px-4 py-3 text-text">{s.amount} {s.token}</td>
              <td className="px-4 py-3 text-accent3">{s.status}</td>
              <td className="px-4 py-3 text-accent">{s.trustScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
