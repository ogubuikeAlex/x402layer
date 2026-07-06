const TERMS: { label: string; tone?: 'accent' | 'red' }[] = [
  { label: 'x402 protocol', tone: 'accent' },
  { label: 'Casper testnet' },
  { label: 'KYX registry', tone: 'red' },
  { label: 'trust scoring' },
  { label: 'POST /verify', tone: 'accent' },
  { label: 'POST /settle' },
  { label: 'ed25519 signatures' },
  { label: 'replay protection', tone: 'red' },
  { label: 'chain-adapter routing' },
  { label: 'signed receipts', tone: 'accent' },
  { label: 'direct settlement' },
  { label: 'agent DID identity' },
];

export function Ticker() {
  const items = [...TERMS, ...TERMS];
  return (
    <div className="overflow-hidden border-y border-hairline bg-bg2 py-3">
      <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
        {items.map((t, i) => (
          <span
            key={i}
            className={`border-r border-hairline px-8 text-[10px] uppercase tracking-label ${t.tone === 'accent'
                ? 'text-accent'
                : t.tone === 'red'
                  ? 'text-accent2'
                  : 'text-text-dim'
              }`}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
