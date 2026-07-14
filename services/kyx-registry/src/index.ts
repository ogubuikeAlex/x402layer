import { backfillOnChainRegistrations } from './chain/casper-sync.js';
import { loadConfig } from './config.js';
import { createMailer } from './mailer.js';
import { MongoKyxStore } from './mongo-store.js';
import { buildServer } from './server.js';
import { FileKyxStore, type KyxStore } from './store.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store: KyxStore = config.mongodbUri
    ? new MongoKyxStore(config.mongodbUri, config.mongodbDb)
    : new FileKyxStore(config.dataFile);
  await store.init();
  const mailer = createMailer(config);
  const app = buildServer(config, store, mailer);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void app.close().then(() => store.close()).finally(() => process.exit(0));
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      {
        storage: config.mongodbUri ? `mongodb (db: ${config.mongodbDb})` : config.dataFile,
        mail: mailer ? `smtp (${config.mail.host})` : 'disabled (dev_token flow)',
      },
      'layer402 KYX registry listening',
    );
    void backfillOnChainRegistrations(store, config, {
      info: (msg) => app.log.info(msg),
      warn: (msg) => app.log.warn(msg),
    }).catch((err) => app.log.warn({ err }, 'on-chain backfill aborted'));
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
