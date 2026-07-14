import Link from 'next/link';

import { AgentRegistration } from '@/components/AgentRegistration';
import { AgentTransactions } from '@/components/AgentTransactions';
import { TrustScoreCard } from '@/components/TrustScoreCard';
import { getAgentsResult } from '@/lib/kyx';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const { agents, status } = await getAgentsResult();
  const registryUnavailable = status !== 'ok';

  return (
    <div className="space-y-10">
      <header>
        <div className="section-label mb-4">agents</div>
        <h1 className="section-heading mb-4">Register, score, audit.</h1>
        <p className="max-w-2xl font-serif text-[16px] leading-relaxed text-text-mid">
          Client-side key generation, email-only operator verification, local KYX registry storage,
          and trust scoring after every settlement.
        </p>
      </header>

      <AgentRegistration />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-extrabold">Registered agents</h2>
          <span className="text-[10px] uppercase tracking-wide2 text-text-dim">
            {registryUnavailable ? status : `${agents.length} total`}
          </span>
        </div>

        {registryUnavailable ? (
          <div className="border border-hairline bg-surface/60 p-6 text-[12px] leading-relaxed text-text-mid">
            <div className="mb-2 text-[10px] uppercase tracking-wide2 text-accent">
              {status === 'timeout' ? 'KYX registry is taking too long' : 'KYX registry unavailable'}
            </div>
            The dashboard stopped waiting so this page stays responsive. Check that the KYX registry is running ,then refresh to load registered agents.
          </div>
        ) : agents.length === 0 ? (
          <div className="border border-dashed border-hairline bg-surface/40 p-10 text-center text-[12px] text-text-dim">
            Start the KYX registry, then register an agent above.
          </div>
        ) : (
          <div className="grid gap-5">
            {agents.map((agent) => (
              <article key={agent.did} className="grid gap-5 border border-hairline bg-surface p-5 lg:grid-cols-[1fr_360px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-xl font-extrabold">{agent.agentName}</h3>
                    <span className="border border-hairline px-2 py-1 text-[9px] uppercase tracking-wide2 text-text-dim">
                      {agent.onChainStatus}
                    </span>
                  </div>
                  <code className="mt-3 block break-all text-[11px] text-accent">{agent.did}</code>
                  <dl className="mt-5 grid gap-3 text-[11px] sm:grid-cols-3">
                    <Field label="operator" value={agent.operatorEmail} />
                    <Field label="network" value={agent.network} />
                    <Field label="wallet" value={agent.walletAddress} />
                  </dl>
                  <div className="mt-5">
                    <Link href={`/agents/${encodeURIComponent(agent.did)}`} className="text-[10px] uppercase tracking-wide2 text-accent">
                      Open detail
                    </Link>
                  </div>
                  <div className="mt-5">
                    <AgentTransactions did={agent.did} initialSettlements={agent.settlements} />
                  </div>
                </div>
                <TrustScoreCard trust={agent.trust} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wide2 text-text-dim">{label}</dt>
      <dd className="mt-1 truncate text-text">{value}</dd>
    </div>
  );
}
