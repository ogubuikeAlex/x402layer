import { describe, expect, it } from 'vitest';

import { ReplayCache } from './cache.js';

describe('ReplayCache', () => {
  it('detects a replayed nonce within the TTL window', () => {
    let now = 1000;
    const cache = new ReplayCache(120_000, () => now);
    expect(cache.has('casper', 'n1')).toBe(false);
    cache.record('casper', 'n1');
    expect(cache.has('casper', 'n1')).toBe(true);
  });

  it('expires entries after the TTL', () => {
    let now = 1000;
    const cache = new ReplayCache(120_000, () => now);
    cache.record('casper', 'n1');
    now += 119_000;
    expect(cache.has('casper', 'n1')).toBe(true);
    now += 2_000; // past 120s
    expect(cache.has('casper', 'n1')).toBe(false);
  });

  it('scopes nonces by network', () => {
    let now = 1000;
    const cache = new ReplayCache(120_000, () => now);
    cache.record('casper', 'shared');
    expect(cache.has('base', 'shared')).toBe(false);
  });
});
