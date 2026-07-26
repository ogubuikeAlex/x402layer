const API = 'https://api.uptimerobot.com/v2';
const KEY = process.env.UPTIMEROBOT_API_KEY;

const MONITORS = [
  { name: 'fourotwo dashboard (full stack)', url: 'https://x402layer-dashboard.vercel.app/api/health' },
  { name: 'fourotwo facilitator', url: 'https://fourotwo-facilitator.onrender.com/health' },
  { name: 'fourotwo KYX registry', url: 'https://x402layer-kyx-registry.onrender.com/health' },
  { name: 'Atlas demo agent', url: 'https://atlas-research-agent.onrender.com/health' },
  { name: 'Meridian demo API', url: 'https://meridian-fa2d.onrender.com/health' },
];

if (!KEY) {
  console.error('Set UPTIMEROBOT_API_KEY (Main API key from dashboard.uptimerobot.com → Integrations & API).');
  process.exit(1);
}

async function call(path, params) {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: KEY, format: 'json', ...params }),
  });
  const body = await res.json();
  if (body.stat !== 'ok') throw new Error(`${path}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

const existing = await call('getMonitors', {}).then((b) => b.monitors ?? []).catch(() => []);
const existingUrls = new Set(existing.map((m) => m.url));

for (const monitor of MONITORS) {
  if (existingUrls.has(monitor.url)) {
    console.log(`= already monitored: ${monitor.name}`);
    continue;
  }
  await call('newMonitor', {
    type: '1', // HTTP(S) - alerts on non-2xx, which /api/health uses to signal a degraded stack
    friendly_name: monitor.name,
    url: monitor.url,
    interval: '300',
  });
  console.log(`+ created: ${monitor.name} → ${monitor.url}`);
}

console.log('\nDone. Add alert contacts (email/Slack) at dashboard.uptimerobot.com → My Settings.');
console.log('Optional public status page: dashboard.uptimerobot.com → Status Pages → Add.');
