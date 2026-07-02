import { loadConfig } from './config.js';
import { buildContext } from './context.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = buildContext(config);
  const app = buildServer(ctx);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      { networks: ctx.adapters.supported(), receiptSigner: ctx.receiptSigner.publicKeyHex },
      'fourotwo facilitator listening',
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
