import type { SupportedResponse } from '@fourotwo/types';
import { fetchWithTimeout } from '@fourotwo/types';

export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'http://localhost:4001';

export interface FacilitatorStatus {
  online: boolean;
  health?: { status: string };
  supported?: SupportedResponse;
  error?: string;
}

export async function getFacilitatorStatus(): Promise<FacilitatorStatus> {
  try {
    
    const [healthRes, supportedRes] = await Promise.all([
      fetchWithTimeout(fetch, `${FACILITATOR_URL}/health`, { cache: 'no-store', timeoutMs: 4_000 }),
      fetchWithTimeout(fetch, `${FACILITATOR_URL}/supported`, { cache: 'no-store', timeoutMs: 4_000 }),
    ]);

    if (!healthRes.ok) return { online: false, error: `health ${healthRes.status}` };
    return {
      online: true,
      health: await healthRes.json(),
      supported: supportedRes.ok ? await supportedRes.json() : undefined,
    };
  } catch (err) {
    return { online: false, error: (err as Error).message };
  }
}
