import Link from 'next/link';

import { formatCspr, getCasperBalance } from '@/lib/cspr';
import { getAgents } from '@/lib/kyx';

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const agents = await getAgents();
  const casperAgents = agents.filter((a) => a.network === 'casper');
  const balances = await Promise.all(
    casperAgents.map(async (agent) => ({
      agent,
      balance: await getCasperBalance(agent.walletAddress),
    })),
  );

  return (
    <div className="space-y-10">
      <header>
        <div className="section-label mb-4">wallet</div>
        <h1 className="section-heading mb-4">Balances and funding.</h1>
        <p className="max-w-2xl font-serif text-[16px] leading-relaxed text-text-mid">
          Casper balances are read from CSPR.cloud. Programmatic faucet funding is not standardized,
          so layer402 links to the public testnet faucet and refreshes on reload.
        </p>
      </header>

      <div className="grid gap-5">
        {balances.length === 0 ? (
          <div className="border border-dashed border-hairline bg-surface/40 p-10 text-center text-[12px] text-text-dim">
            Register a Casper agent first.
          </div>
        ) : (
          balances.map(({ agent, balance }) => (
            <div key={agent.did} className="border border-hairline bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-extrabold">{agent.agentName}</h2>
                  <code className="mt-2 block break-all text-[11px] text-accent">{agent.walletAddress}</code>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide2 text-text-dim">balance</div>
                  <div className="mt-1 font-display text-2xl font-extrabold text-text">
                    {formatCspr(balance.balanceMotes)}
                  </div>
                </div>
              </div>
              {balance.error && <p className="mt-4 text-[11px] text-accent-warn">{balance.error}</p>}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="https://testnet.cspr.live/tools/faucet"
                  className="bg-accent px-5 py-3 text-[10px] uppercase tracking-wide2 text-bg"
                >
                  Open testnet faucet
                </Link>
                <Link
                  href={`/agents/${encodeURIComponent(agent.did)}`}
                  className="border border-hairline px-5 py-3 text-[10px] uppercase tracking-wide2 text-text-dim"
                >
                  View agent
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
