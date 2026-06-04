import type { FastifyPluginAsync } from 'fastify';
import { AuthService } from './auth.service.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.config);

  app.get('/google/start', async (_request, reply) => {
    if (!service.isConfigured()) {
      return reply.status(503).send({
        error: 'GoogleOAuthNotConfigured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured before starting OAuth.'
      });
    }

    return service.buildGoogleConsentUrl();
  });

  app.get('/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; error?: string };

    if (query.error) {
      return reply.status(400).send({ error: 'GoogleOAuthError', message: query.error });
    }

    if (!query.code) {
      return reply.status(400).send({ error: 'MissingOAuthCode', message: 'OAuth callback requires a code.' });
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
