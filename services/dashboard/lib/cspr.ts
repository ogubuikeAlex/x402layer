export interface BalanceResult {
  balanceMotes: string | null;
  error?: string;
}

export async function getCasperBalance(accountHashHex: string): Promise<BalanceResult> {
  const baseUrl = process.env.CSPR_CLOUD_API_URL ?? 'https://api.testnet.cspr.cloud';
  try {
    const res = await fetch(`${baseUrl}/accounts/${accountHashHex}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { balanceMotes: null, error: `CSPR.cloud ${res.status}` };
    const body = (await res.json()) as { data?: { balance?: string } };
    return { balanceMotes: body.data?.balance ?? '0' };
  } catch (err) {
    return { balanceMotes: null, error: (err as Error).message };
  }
}

export function formatCspr(motes: string | null): string {
  if (motes === null) return 'unavailable';
  const cspr = Number(motes) / 1_000_000_000;
  return `${cspr.toLocaleString(undefined, { maximumFractionDigits: 4 })} CSPR`;
}
