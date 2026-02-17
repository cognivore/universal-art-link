import { config } from './config.js';
import { createPool } from '@ual/storage';
import { createApp } from './app.js';

const main = async () => {
  const pool = createPool(config.databaseUrl);

  const { app, boss } = await createApp({
    pool,
    databaseUrl: config.databaseUrl,
    storagePath: config.storagePath,
    logger: {
      level: 'info',
    },
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Platform API listening on ${config.host}:${config.port}`);

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await boss.stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
