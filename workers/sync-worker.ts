import { createApp } from '../src/app.js';

const app = await createApp();

app.log.info('sync worker placeholder started');

process.on('SIGTERM', async () => {
  await app.close();
  process.exit(0);
});
