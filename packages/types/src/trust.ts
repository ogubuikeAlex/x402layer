/** Trust tier helpers (product spec Section 6.2). */

import type { TrustTier } from './types.js';

/** Map a 0–100 score to its tier band. */
export function tierForScore(score: number): TrustTier {
  if (score >= 90) return 'ELITE';
  if (score >= 70) return 'VERIFIED';
  if (score >= 40) return 'STANDARD';
  if (score >= 1) return 'RESTRICTED';
  return 'BLOCKED';
}

/** Tailwind-friendly badge color per tier, for the dashboard (M3-T12). */
export const TIER_COLOR: Record<TrustTier, string> = {
  ELITE: 'emerald',
  VERIFIED: 'green',
  STANDARD: 'amber',
  RESTRICTED: 'orange',
  BLOCKED: 'red',
};
