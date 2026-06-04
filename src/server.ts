import { appConfig } from './config/index.js';
import { createApp } from './app.js';

const app = await createApp();

try {
  await app.listen({ host: appConfig.HOST, port: appConfig.PORT });
} catch (error) {
  app.log.error({ error }, 'failed to start server');
  process.exit(1);
}
