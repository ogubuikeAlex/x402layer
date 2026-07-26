import type { FastifyInstance } from 'fastify';

interface DurationAgg {
  count: number;
  sumMs: number;
  maxMs: number;
}

function labelString(labels: Record<string, string | number> = {}): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(',')}}`;
}

export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, DurationAgg>();
  private readonly startedAt = Date.now();

  constructor(private readonly prefix: string) {}

  inc(name: string, labels?: Record<string, string | number>, by = 1): void {
    const key = `${this.prefix}_${name}${labelString(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  observeHttp(method: string, route: string, status: number, ms: number): void {
    this.inc('http_requests_total', { method, route, status });
    const key = `${this.prefix}_http_request_duration_ms${labelString({ method, route })}`;
    const agg = this.durations.get(key) ?? { count: 0, sumMs: 0, maxMs: 0 };
    agg.count += 1;
    agg.sumMs += ms;
    agg.maxMs = Math.max(agg.maxMs, ms);
    this.durations.set(key, agg);
  }

  render(): string {
    const lines: string[] = [];
    for (const [key, value] of [...this.counters.entries()].sort()) {
      lines.push(`${key} ${value}`);
    }
    for (const [key, agg] of [...this.durations.entries()].sort()) {
      const label = key.includes('{') ? key.slice(key.indexOf('{')) : '';
      const base = key.includes('{') ? key.slice(0, key.indexOf('{')) : key;
      lines.push(`${base}_count${label} ${agg.count}`);
      lines.push(`${base}_sum${label} ${Math.round(agg.sumMs)}`);
      lines.push(`${base}_max${label} ${Math.round(agg.maxMs)}`);
      lines.push(`${base}_avg${label} ${agg.count ? Math.round(agg.sumMs / agg.count) : 0}`);
    }
    lines.push(`${this.prefix}_process_uptime_seconds ${Math.round((Date.now() - this.startedAt) / 1000)}`);
    lines.push(`${this.prefix}_process_memory_rss_bytes ${process.memoryUsage().rss}`);
    return lines.join('\n') + '\n';
  }
}

export function registerMetrics(app: FastifyInstance, metrics: Metrics): void {
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? request.url.split('?')[0] ?? 'unknown';
    if (route !== '/metrics') {
      metrics.observeHttp(request.method, route, reply.statusCode, reply.elapsedTime ?? 0);
    }
    done();
  });
  app.get('/metrics', async (_request, reply) => {
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(metrics.render());
  });
}

export const metrics = new Metrics('facilitator');
