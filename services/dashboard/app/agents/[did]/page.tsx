import { notFound } from 'next/navigation';

import { TransactionTable } from '@/components/TransactionTable';
import { TrustScoreCard } from '@/components/TrustScoreCard';
import { getAgentDetail } from '@/lib/kyx';

export const dynamic = 'force-dynamic';

export default async function AgentDetailPage({ params }: { params: { did: string } }) {
  const detail = await getAgentDetail(decodeURIComponent(params.did));
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <header>
        <div className="section-label mb-4">agent detail</div>
        <h1 className="section-heading mb-4">{detail.agent.agentName}</h1>
        <code className="block break-all text-[12px] text-accent">{detail.agent.did}</code>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="border border-hairline bg-surface p-5">
            <dl className="grid gap-4 text-[11px] sm:grid-cols-2">
              <Field label="operator" value={detail.agent.operatorEmail} />
              <Field label="network" value={detail.agent.network} />
              <Field label="wallet" value={detail.agent.walletAddress} />
              <Field label="registered" value={new Date(detail.agent.registeredAt).toLocaleString()} />
            </dl>
          </div>
          <TransactionTable settlements={detail.settlements} />
        </section>
        <TrustScoreCard trust={detail.trust} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wide2 text-text-dim">{label}</dt>
      <dd className="mt-1 break-all text-text">{value}</dd>
    </div>
  );
}
