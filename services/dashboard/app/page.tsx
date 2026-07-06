import Link from 'next/link';

import { getFacilitatorStatus } from '@/lib/facilitator';
import { Reveal } from '@/components/Reveal';
import { Counter } from '@/components/Counter';
import { Ticker } from '@/components/Ticker';

export const dynamic = 'force-dynamic';

const LOOP = [
  { num: '01', step: 'pay', desc: 'Agent SDK signs an x402 payment on a 402 response.' },
  { num: '02', step: 'verify', desc: 'Facilitator checks signature, replay, and trust.' },
  { num: '03', step: 'settle', desc: 'Direct on-chain settlement + a signed receipt.' },
  { num: '04', step: 'score', desc: 'Trust score recomputed for the paying agent.' },
];

export default async function OverviewPage() {
  const status = await getFacilitatorStatus();
  const networks = status.supported?.networks ?? [];
  const features = status.supported?.features ?? [];

  return (
    <div className="space-y-24">
      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="grid items-center gap-y-12 lg:grid-cols-2 lg:gap-x-20 xl:gap-x-28">
        <div className="fade-up">
          <span className="mb-8 inline-flex items-center gap-2 border border-hairline-accent px-3.5 py-1.5 text-[10px] uppercase tracking-label text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: 'pulse 2s infinite' }} />
            x402 facilitator · trust registry
          </span>
          <h1 className="font-display text-[clamp(44px,6vw,76px)] font-extrabold leading-[0.95] tracking-[-2px]">
            Trust,
            <br />
            <span className="text-text-mid">attached to every</span>
            <br />
            <span className="text-accent">agent payment.</span>
          </h1>
          <p className="mt-7 max-w-md font-serif text-[17px] font-light leading-relaxed text-text-mid">
            layer402 is an x402-compatible payment facilitator that gives every AI agent a
            verifiable trust score on every transaction. One loop:{' '}
            <span className="text-text">pay → verify → settle → score</span>.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/playground"
              className="bg-accent px-8 py-4 text-[12px] font-medium uppercase tracking-wide2 text-bg transition-transform hover:-translate-y-0.5"
            >
              Run the payment loop
            </Link>
            <Link
              href="/agents"
              className="border border-hairline px-8 py-4 text-[12px] uppercase tracking-wide2 text-text-dim transition-colors hover:border-text-dim hover:text-text"
            >
              View agents
            </Link>
          </div>
        </div>

        {/* facilitator status window */}
        <div className="fade-up">
          <div className="scan-sweep relative overflow-hidden border border-hairline bg-surface">
            <div className="scan-overlay" />
            <div className="flex items-center justify-between border-b border-hairline bg-black/30 px-5 py-3.5">
              <span className="text-[10px] uppercase tracking-label text-text-dim">
                Facilitator - live status
              </span>
              <span
                className={`flex items-center gap-2 text-[10px] uppercase tracking-wide2 ${status.online ? 'text-accent3' : 'text-accent2'
                  }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: status.online ? 'var(--accent3)' : 'var(--accent2)',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                {status.online ? 'online' : 'offline'}
              </span>
            </div>

            <div className="divide-y divide-[var(--border)]">
              <Row k="endpoint" v="/health · /supported · /verify · /settle" />
              <Row k="version" v={status.supported?.version ?? '-'} />
              <Row k="networks" v={networks.map((n) => n.network).join(' · ') || '-'} />
              <Row
                k="tokens"
                v={
                  networks.length
                    ? networks.map((n) => `${n.network}:${n.tokens.join('/')}`).join('  ')
                    : '-'
                }
              />
              <Row k="features" v={features.join(' · ') || '-'} />
            </div>

            <div className="grid grid-cols-3 border-t border-hairline bg-black/20">
              <Stat label="networks" value={networks.length} />
              <Stat label="features" value={features.length} />
              <Stat label="endpoints" value={4} />
            </div>
          </div>
          {!status.online && (
            <p className="mt-3 text-[11px] text-text-dim">
              start it: <code className="bg-surface px-1.5 py-0.5 text-accent">npm run dev -w @fourotwo/facilitator</code>
            </p>
          )}
        </div>
      </section>

      <Ticker />

      {/* ── THE LOOP ──────────────────────────────────────── */}
      <section>
        <Reveal>
          <div className="section-label mb-4">the loop</div>
          <h2 className="section-heading mb-12">
            Four steps.
            <br />
            One settled transaction.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <div className="grid hairline-grid sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((l) => (
              <div
                key={l.step}
                className="group relative overflow-hidden bg-surface p-7 transition-colors hover:bg-surface2"
              >
                <span className="pointer-events-none absolute right-5 top-4 font-display text-[52px] font-extrabold leading-none text-white/[0.03]">
                  {l.num}
                </span>
                <div className="font-display text-[15px] font-bold uppercase tracking-wide text-accent">
                  {l.step}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-text-dim">{l.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── METRICS ───────────────────────────────────────── */}
      <section>
        <Reveal>
          <div className="section-label mb-4">the platform</div>
          <h2 className="section-heading mb-12">Payments with provenance.</h2>
        </Reveal>
        <Reveal delay={80}>
          <div className="grid hairline-grid grid-cols-2 lg:grid-cols-4">
            <Metric value={<Counter to={4} />} label="facilitator endpoints" desc="verify · settle · supported · trust" />
            <Metric value={<Counter to={2} />} label="chains supported" desc="Casper (primary) + Base (fallback)" />
            <Metric value={<Counter to={3} />} label="trust dimensions" desc="completion · operator KYC · volume" />
            <Metric value={<Counter to={2} />} label="on-chain contracts" desc="KyxRegistry + SettlementVault" />
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-3">
      <span className="text-[10px] uppercase tracking-wide2 text-text-dim">{k}</span>
      <span className="text-right text-[11px] text-text-mid">{v}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-hairline px-5 py-4 first:border-l-0">
      <div className="font-display text-2xl font-bold text-text">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide2 text-text-dim">{label}</div>
    </div>
  );
}

function Metric({
  value,
  label,
  desc,
}: {
  value: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <div className="group relative overflow-hidden bg-surface p-8">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-hairline transition-colors group-hover:bg-accent" />
      <div className="font-display text-[52px] font-extrabold leading-none tracking-[-2px] text-text">
        {value}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wide2 text-text-dim">{label}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-dim">{desc}</p>
    </div>
  );
}
