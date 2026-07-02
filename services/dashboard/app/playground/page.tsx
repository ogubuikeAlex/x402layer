'use client';

import { useState } from 'react';

interface TraceStep {
  label: string;
  request?: unknown;
  status?: number;
  response?: any;
  ok: boolean;
}
interface DemoResult {
  did: string;
  trace: TraceStep[];
  settled: boolean;
  error?: string;
}

export default function PlaygroundPage() {
  const [amount, setAmount] = useState('5000');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);

  async function runDemo() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ did: '', trace: [], settled: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const settleResponse = result?.trace.find((s) => s.label === 'POST /settle')?.response;
  const receipt = settleResponse?.receipt;
  const vaultTx: string | undefined = settleResponse?.vault_tx;

  return (
    <div className="space-y-10">
      <header>
        <div className="section-label mb-4">facilitator playground</div>
        <h1 className="section-heading mb-4">
          Craft a payment.
          <br />
          Watch it settle.
        </h1>
        <p className="max-w-xl font-serif text-[16px] font-light leading-relaxed text-text-mid">
          Signs a real Casper x402 payment and runs it through the live facilitator —{' '}
          <span className="text-text">/verify → /settle</span>. A step-by-step trace of the
          verify → settle round trip and the signed receipt it returns.
        </p>
      </header>

      {/* control bar */}
      <div className="flex flex-wrap items-end gap-5 border border-hairline bg-surface p-6">
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide2 text-text-dim">amount · motes</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            className="w-44 border border-hairline bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <button
          onClick={runDemo}
          disabled={loading}
          className="bg-accent px-7 py-3 text-[12px] font-medium uppercase tracking-wide2 text-bg transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {loading ? 'running…' : 'run payment loop'}
        </button>
        {result && !result.error && (
          <span
            className={`ml-auto flex items-center gap-2 text-[10px] uppercase tracking-wide2 ${
              result.settled ? 'text-accent3' : 'text-accent-warn'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: result.settled ? 'var(--accent3)' : 'var(--accent-warn)',
              }}
            />
            {result.settled ? 'settled' : 'verified'}
          </span>
        )}
      </div>

      {result?.error && (
        <div className="border border-[rgba(255,60,90,0.3)] bg-[rgba(255,60,90,0.08)] p-4 text-sm text-accent2">
          {result.error} — is the facilitator running on the configured URL?
        </div>
      )}

      {result && result.trace.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="uppercase tracking-wide2 text-text-dim">agent</span>
            <code className="truncate bg-surface px-2 py-1 text-accent">{result.did}</code>
          </div>

          {result.trace.map((step, i) => (
            <div key={i} className="overflow-hidden border border-hairline bg-surface">
              <div className="flex items-center justify-between border-b border-hairline bg-black/30 px-4 py-2.5">
                <span className="text-[12px] tracking-wide text-text">{step.label}</span>
                <span
                  className={`px-2.5 py-1 text-[9px] uppercase tracking-wide2 ${
                    step.ok
                      ? 'border border-[rgba(127,255,110,0.2)] bg-[rgba(127,255,110,0.1)] text-accent3'
                      : 'border border-[rgba(255,60,90,0.3)] bg-[rgba(255,60,90,0.15)] text-accent2'
                  }`}
                >
                  {step.status ?? '—'} {step.ok ? 'ok' : 'fail'}
                </span>
              </div>
              <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-text-mid">
                {JSON.stringify(step.response, null, 2)}
              </pre>
            </div>
          ))}

          {receipt && (
            <div className="border border-[rgba(127,255,110,0.25)] bg-[rgba(127,255,110,0.04)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="live-dot" />
                <h3 className="text-[11px] uppercase tracking-wide2 text-accent3">
                  signed settlement receipt
                </h3>
              </div>
              <dl className="grid gap-4 text-[11px] sm:grid-cols-2">
                <Field label="settlement_id" value={receipt.settlementId} />
                <Field label="amount" value={`${receipt.amount} ${receipt.token}`} />
                <Field label="mode" value={receipt.settlementMode} />
                <Field label="network" value={receipt.network} />
                <Field label="tx_hash" value={receipt.txHash ?? '(live broadcast unconfigured)'} />
                <Field label="settled_at" value={receipt.settledAt} />
                {vaultTx && (
                  <Field label="vault_tx · on-chain record" value={vaultTx} />
                )}
              </dl>
              {vaultTx && (
                <a
                  href={`https://testnet.cspr.live/deploy/${vaultTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block break-all font-mono text-[10px] text-accent underline"
                >
                  view SettlementVault record on cspr.live ↗
                </a>
              )}
              <p className="mt-4 break-all font-mono text-[10px] text-text-dim">
                facilitator sig · {receipt.facilitatorSignature}
              </p>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="border border-dashed border-hairline bg-surface/40 p-10 text-center text-[12px] text-text-dim">
          Press <span className="text-accent">run payment loop</span> to craft and settle a payment.
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide2 text-text-dim">{label}</dt>
      <dd className="mt-1 break-all text-text">{value}</dd>
    </div>
  );
}
