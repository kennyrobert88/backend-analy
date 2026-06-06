import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { appConfig, hasProductionSecrets, type AppConfig } from './config/index.js';
import { registerAuthGuard } from './middleware/auth-guard.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerRequestLogger } from './middleware/request-logger.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { calendarRoutes } from './modules/calendar/calendar.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { emailRoutes } from './modules/emails/emails.routes.js';
import { insightRoutes } from './modules/insights/insights.routes.js';
import { jobApplicationRoutes } from './modules/job-applications/job-applications.routes.js';
import { syncRoutes } from './modules/sync/sync.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

type CreateAppOptions = {
  config?: AppConfig;
};

// Only allow alphanumeric, hyphens, and underscores in client-supplied request IDs.
const REQUEST_ID_SAFE = /^[a-zA-Z0-9_-]{1,128}$/;

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? appConfig;
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    genReqId: (request) => {
      const clientId = request.headers['x-request-id']?.toString();
      return clientId && REQUEST_ID_SAFE.test(clientId) ? clientId : randomUUID();
    }
  });

  app.decorate('config', config);

  await registerErrorHandler(app);
  await registerRequestLogger(app);

  await app.register(helmet);

  await app.register(cookie, {
    secret: config.SESSION_COOKIE_SECRET ?? randomUUID()
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    }
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'backend-analy'
  }));

  app.get('/readyz', async (_request, reply) => {
    const ready = config.NODE_ENV === 'production' ? hasProductionSecrets(config) : true;
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready' });
  });

  // Auth routes are public (no auth guard).
  await app.register(authRoutes, { prefix: '/auth' });

  // All remaining routes require authentication.
  await app.register(async (protectedApp) => {
    await registerAuthGuard(protectedApp);

    await protectedApp.register(syncRoutes, { prefix: '/sync' });
    await protectedApp.register(emailRoutes, { prefix: '/emails' });
    await protectedApp.register(calendarRoutes, { prefix: '/calendar' });
    await protectedApp.register(dashboardRoutes, { prefix: '/dashboard' });
    await protectedApp.register(jobApplicationRoutes, { prefix: '/job-applications' });
    await protectedApp.register(insightRoutes, { prefix: '/insights' });
  });

  return app;
}
