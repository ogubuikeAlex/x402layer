import { NextResponse } from 'next/server';

import { FACILITATOR_URL } from '@/lib/facilitator';
import { KYX_REGISTRY_URL } from '@/lib/kyx';

export const dynamic = 'force-dynamic';

async function probe(name: string, url: string): Promise<{ name: string; ok: boolean; ms: number }> {
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    return { name, ok: res.ok, ms: Date.now() - startedAt };
  } catch {
    return { name, ok: false, ms: Date.now() - startedAt };
  }
}

export async function GET() {
  const dependencies = await Promise.all([
    probe('kyx-registry', `${KYX_REGISTRY_URL}/health`),
    probe('facilitator', `${FACILITATOR_URL}/health`),
  ]);
  const healthy = dependencies.every((d) => d.ok);
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'dashboard',
      time: new Date().toISOString(),
      dependencies,
    },
    { status: healthy ? 200 : 503 },
  );
}
