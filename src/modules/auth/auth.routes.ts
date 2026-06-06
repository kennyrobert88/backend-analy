import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthService } from './auth.service.js';

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional()
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.config);

  // Tighter rate limit for auth endpoints: 10 req/min per IP.
  const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/google/start', { ...authRateLimit }, async (_request, reply) => {
    if (!service.isConfigured()) {
      return reply.status(503).send({
        error: 'GoogleOAuthNotConfigured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured before starting OAuth.'
      });
    }

    return service.buildGoogleConsentUrl();
  });

  app.get('/google/callback', { ...authRateLimit }, async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);

    if (query.error) {
      return reply.status(400).send({ error: 'GoogleOAuthError', message: query.error });
    }

    if (!query.code) {
      return reply.status(400).send({ error: 'MissingOAuthCode', message: 'OAuth callback requires a code.' });
    }

    if (!query.state || !service.consumeState(query.state)) {
      return reply.status(400).send({ error: 'InvalidOAuthState', message: 'OAuth state is missing, invalid, or expired.' });
    }

    return reply.status(501).send({
      error: 'NotImplemented',
      message: 'OAuth token exchange and session creation will be implemented with persistent token storage.'
    });
  });

  app.get('/status', async () => ({
    connected: false,
    account: null
  }));

  app.post('/logout', async () => ({
    loggedOut: true
  }));
};
