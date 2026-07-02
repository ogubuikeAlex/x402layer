import type { TrustScore } from '@fourotwo/types';

interface CompactTrust {
  score: number;
  tier: string;
  completionRate: number;
  operatorVerified: boolean;
  volumeTierScore: number;
  transactionCount: number;
  flags?: string[];
}

function normalize(trust?: TrustScore | CompactTrust): CompactTrust | null {
  if (!trust) return null;
  if ('dimensions' in trust) {
    return {
      score: trust.score,
      tier: trust.tier,
      completionRate: trust.dimensions.completionRate * 100,
      operatorVerified: trust.dimensions.operatorVerified,
      volumeTierScore:
        trust.dimensions.volumeTier === 'HIGH'
          ? 100
          : trust.dimensions.volumeTier === 'MEDIUM'
            ? 75
            : trust.dimensions.volumeTier === 'LOW'
              ? 50
              : 25,
      transactionCount: trust.history.totalTransactions,
      flags: trust.flags,
    };
  }
  return trust;
}

export function TrustScoreCard({ trust }: { trust?: TrustScore | CompactTrust }) {
  const t = normalize(trust);
  if (!t) {
    return (
      <div className="border border-hairline bg-surface p-5 text-[12px] text-text-dim">
        Trust score unavailable. Start the KYX registry on port 4002.
      </div>
    );
  }
  const tone =
    t.tier === 'ELITE' || t.tier === 'VERIFIED'
      ? 'text-accent3'
      : t.tier === 'STANDARD'
        ? 'text-accent'
        : t.tier === 'RESTRICTED'
          ? 'text-accent-warn'
          : 'text-accent2';

  return (
    <div className="border border-hairline bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide2 text-text-dim">trust score</div>
          <div className="mt-2 font-display text-[48px] font-extrabold leading-none text-text">
            {t.score}
          </div>
        </div>
        <span className={`border border-hairline px-3 py-1 text-[10px] uppercase tracking-wide2 ${tone}`}>
          {t.tier}
        </span>
      </div>
      <div className="mt-5 grid gap-3 text-[11px] sm:grid-cols-3">
        <Metric label="completion" value={`${Math.round(t.completionRate)}%`} />
        <Metric label="operator" value={t.operatorVerified ? 'verified' : 'pending'} />
        <Metric label="volume" value={`${Math.round(t.volumeTierScore)}%`} />
      </div>
      <div className="mt-4 text-[10px] uppercase tracking-wide2 text-text-dim">
        {t.transactionCount} settled transaction{t.transactionCount === 1 ? '' : 's'}
      </div>
      {t.flags && t.flags.length > 0 && (
        <p className="mt-3 text-[10px] text-accent-warn">{t.flags.join(' · ')}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline bg-bg/50 p-3">
      <div className="text-[9px] uppercase tracking-wide2 text-text-dim">{label}</div>
      <div className="mt-1 text-text">{value}</div>
    </div>
  );
}
