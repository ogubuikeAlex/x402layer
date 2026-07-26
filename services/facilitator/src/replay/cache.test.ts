import { describe, expect, it } from 'vitest';

import { ReplayCache } from './cache.js';

describe('ReplayCache', () => {
  it('detects a replayed nonce within the TTL window', async () => {
    let now = 1000;
    const cache = new ReplayCache(120_000, () => now);
    expect(await cache.has('casper', 'n1')).toBe(false);
    expect(await cache.record('casper', 'n1')).toBe(true);
    expect(await cache.has('casper', 'n1')).toBe(true);
    // A second reserve of the same nonce is rejected.
    expect(await cache.record('casper', 'n1')).toBe(false);
  });

  it('expires entries after the TTL', async () => {
    let now = 1000;
    const cache = new ReplayCache(120_000, () => now);
    await cache.record('casper', 'n1');
    now += 119_000;
    expect(await cache.has('casper', 'n1')).toBe(true);
    now += 2_000; // past 120s
    expect(await cache.has('casper', 'n1')).toBe(false);
  });

  it('scopes nonces by network', async () => {
    let now = 1000;
    const cache = new ReplayCache(120_000, () => now);
    await cache.record('casper', 'shared');
    expect(await cache.has('base', 'shared')).toBe(false);
  });
});
