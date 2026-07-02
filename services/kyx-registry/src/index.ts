import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { KyxStore } from './store.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new KyxStore(config.dataFile);
  await store.load();
  const app = buildServer(config, store);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info({ dataFile: config.dataFile }, 'fourotwo KYX registry listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
