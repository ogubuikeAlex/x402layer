/**
 * Zero-dep metrics + structured request logging for the demo servers, with a
 * Prometheus text exposition. Mirrors the services' metrics.ts.
 *
 * Usage:
 *   const metrics = createMetrics('atlas');
 *   // in the request handler, first thing:
 *   if (instrumentRequest(req, res, pathname, metrics, normalizeRoute)) return;
 */

function labelString(labels = {}) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(',')}}`;
}

export function createMetrics(prefix) {
  const counters = new Map();
  const durations = new Map();
  const startedAt = Date.now();

  return {
    inc(name, labels, by = 1) {
      const key = `${prefix}_${name}${labelString(labels)}`;
      counters.set(key, (counters.get(key) ?? 0) + by);
    },
    observeHttp(method, route, status, ms) {
      this.inc('http_requests_total', { method, route, status });
      const key = `${prefix}_http_request_duration_ms${labelString({ method, route })}`;
      const agg = durations.get(key) ?? { count: 0, sumMs: 0, maxMs: 0 };
      agg.count += 1;
      agg.sumMs += ms;
      agg.maxMs = Math.max(agg.maxMs, ms);
      durations.set(key, agg);
    },
    render() {
      const lines = [];
      for (const [key, value] of [...counters.entries()].sort()) lines.push(`${key} ${value}`);
      for (const [key, agg] of [...durations.entries()].sort()) {
        const i = key.indexOf('{');
        const base = i === -1 ? key : key.slice(0, i);
        const label = i === -1 ? '' : key.slice(i);
        lines.push(`${base}_count${label} ${agg.count}`);
        lines.push(`${base}_sum${label} ${Math.round(agg.sumMs)}`);
        lines.push(`${base}_max${label} ${Math.round(agg.maxMs)}`);
        lines.push(`${base}_avg${label} ${agg.count ? Math.round(agg.sumMs / agg.count) : 0}`);
      }
      lines.push(`${prefix}_process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`);
      lines.push(`${prefix}_process_memory_rss_bytes ${process.memoryUsage().rss}`);
      return lines.join('\n') + '\n';
    },
  };
}

/**
 * Logs + records every request, and serves GET /metrics and GET /health.
 * Returns true when it already answered the request (metrics/health).
 */
export function instrumentRequest(req, res, pathname, metrics, normalizeRoute = (p) => p) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    const route = normalizeRoute(pathname);
    if (route !== '/metrics') metrics.observeHttp(req.method ?? 'GET', route, res.statusCode, ms);
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : 'info',
        method: req.method,
        path: pathname,
        status: res.statusCode,
        ms,
      }),
    );
  });

  if (req.method === 'GET' && pathname === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
    res.end(metrics.render());
    return true;
  }
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime_seconds: Math.round(process.uptime()) }));
    return true;
  }
  return false;
}
