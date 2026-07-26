import { fetchWithTimeout } from '@fourotwo/types';

export interface BalanceResult {
  balanceMotes: string | null;
  error?: string;
}

const CSPR_TIMEOUT_MS = 5_000;

const NODE_RPCS = [
  ...(process.env.CASPER_NODE_RPC ? [process.env.CASPER_NODE_RPC] : []),
  ...(process.env.CASPER_NODE_RPC_FALLBACKS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  'https://node.testnet.casper.network/rpc',
];

async function balanceFromCsprCloud(accountHashHex: string, apiKey: string): Promise<string> {
  const baseUrl = process.env.CSPR_CLOUD_API_URL ?? 'https://api.testnet.cspr.cloud';
  const res = await fetchWithTimeout(fetch, `${baseUrl}/accounts/${accountHashHex}`, {
    cache: 'no-store',
    timeoutMs: CSPR_TIMEOUT_MS,
    headers: { accept: 'application/json', authorization: apiKey },
  });
  if (!res.ok) throw new Error(`CSPR.cloud ${res.status}`);
  const body = (await res.json()) as { data?: { balance?: string } };
  return body.data?.balance ?? '0';
}

async function balanceFromRpc(accountHashHex: string, nodeRpc: string): Promise<string> {
  const res = await fetchWithTimeout(fetch, nodeRpc, {
    method: 'POST',
    cache: 'no-store',
    timeoutMs: CSPR_TIMEOUT_MS,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query_balance',
      params: { purse_identifier: { main_purse_under_account_hash: `account-hash-${accountHashHex}` } },
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = (await res.json()) as { result?: { balance?: string }; error?: { message?: string } };
  const balance = body.result?.balance;
  if (balance == null) {
    // An account that never received funds has no main purse yet - that's a zero balance.
    if (body.error?.message?.toLowerCase().includes('purse')) return '0';
    throw new Error(body.error?.message ?? 'no balance in RPC response');
  }
  return String(balance);
}

export async function getCasperBalance(accountHashHex: string): Promise<BalanceResult> {
  // CSPR.cloud requires an API key; without one, read the balance straight off a node.
  const apiKey = process.env.CSPR_CLOUD_API_KEY;
  const attempts = [
    ...(apiKey ? [() => balanceFromCsprCloud(accountHashHex, apiKey)] : []),
    ...NODE_RPCS.map((rpc) => () => balanceFromRpc(accountHashHex, rpc)),
  ];
  let lastError = 'no balance sources configured';
  for (const attempt of attempts) {
    try {
      return { balanceMotes: await attempt() };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { balanceMotes: null, error: lastError };
}

export function formatCspr(motes: string | null): string {
  if (motes === null) return 'unavailable';
  let value: bigint;
  try {
    value = BigInt(motes);
  } catch {
    return 'unavailable';
  }
  // BigInt math preserves integer precision above 2^53 motes (~9M CSPR), which
  // plain Number(motes) silently corrupts.
  const base = 1_000_000_000n;
  const whole = value / base;
  const frac = ((value % base) * 10_000n) / base; // 4 decimal places
  const fracStr = frac.toString().padStart(4, '0').replace(/0+$/, '');
  // whole is a count of CSPR (<= total supply, well within Number's safe range).
  const wholeStr = Number(whole).toLocaleString();
  return fracStr ? `${wholeStr}.${fracStr} CSPR` : `${wholeStr} CSPR`;
}
