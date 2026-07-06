'use client';

import { useState, type ReactNode } from 'react';

export type DocStatus = 'live' | 'mvp' | 'upcoming' | 'planned';

const STATUS_STYLE: Record<DocStatus, { label: string; cls: string }> = {
  live: {
    label: 'live',
    cls: 'border-[rgba(127,255,110,0.25)] bg-[rgba(127,255,110,0.1)] text-accent3',
  },
  mvp: {
    label: 'mvp',
    cls: 'border-[rgba(0,212,255,0.3)] bg-[rgba(0,212,255,0.1)] text-accent',
  },
  upcoming: {
    label: 'upcoming',
    cls: 'border-[rgba(255,159,67,0.3)] bg-[rgba(255,159,67,0.08)] text-accent-warn',
  },
  planned: {
    label: 'planned',
    cls: 'border-hairline bg-white/[0.02] text-text-dim',
  },
};

export function Badge({ status }: { status: DocStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-block border px-2 py-0.5 text-[9px] uppercase tracking-wide2 ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function DocH2({ children, status }: { children: ReactNode; status?: DocStatus }) {
  return (
    <h2 className="mt-12 flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-text first:mt-0">
      {children}
      {status && <Badge status={status} />}
    </h2>
  );
}

export function DocH3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-8 font-display text-[15px] font-semibold uppercase tracking-wide text-accent">
      {children}
    </h3>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 max-w-2xl font-serif text-[15px] font-light leading-relaxed text-text-mid">
      {children}
    </p>
  );
}

export function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'border-[rgba(255,159,67,0.3)] bg-[rgba(255,159,67,0.06)] text-accent-warn'
      : 'border-hairline-accent bg-[rgba(0,212,255,0.05)] text-text-mid';
  return (
    <div className={`mt-5 border-l-2 px-4 py-3 text-[12px] leading-relaxed ${cls}`}>{children}</div>
  );
}

export function CodeBlock({ code, lang = '' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-5 overflow-hidden border border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline bg-black/30 px-4 py-2">
        <span className="text-[10px] uppercase tracking-wide2 text-text-dim">{lang || 'code'}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-[10px] uppercase tracking-wide2 text-text-dim transition-colors hover:text-accent"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-relaxed text-text-mid">
        {code}
      </pre>
    </div>
  );
}

export function DocTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto border border-hairline">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="bg-black/30">
            {headers.map((h) => (
              <th
                key={h}
                className="border-b border-hairline px-4 py-2.5 text-[10px] uppercase tracking-wide2 text-text-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="bg-surface transition-colors hover:bg-surface2">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-hairline px-4 py-2.5 align-top text-text-mid last:border-r-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Endpoint({
  method,
  path,
  status,
  children,
}: {
  method: 'GET' | 'POST';
  path: string;
  status: DocStatus;
  children?: ReactNode;
}) {
  const methodCls = method === 'GET' ? 'text-accent3' : 'text-accent';
  return (
    <div className="mt-6 border border-hairline bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-black/20 px-4 py-3">
        <span className={`font-mono text-[11px] font-medium uppercase ${methodCls}`}>{method}</span>
        <code className="font-mono text-[13px] text-text">{path}</code>
        <span className="ml-auto">
          <Badge status={status} />
        </span>
      </div>
      {children && <div className="px-4 py-3 text-[12px] leading-relaxed text-text-mid">{children}</div>}
    </div>
  );
}

export function KeyVal({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="border-l border-hairline pl-3">
          <dt className="text-[10px] uppercase tracking-wide2 text-text-dim">{k}</dt>
          <dd className="mt-1 text-[13px] text-text-mid">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
