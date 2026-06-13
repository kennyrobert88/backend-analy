import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthService } from './auth.service.js';

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.config);

  // Stricter rate limit for auth endpoints: 10 req/min per IP.
  const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  /**
   * GET /auth/google/start
   * Returns the Google consent URL for the client to redirect the user to.
   */
  app.get('/google/start', { ...authRateLimit }, async (_request, reply) => {
    if (!service.isConfigured()) {
      return reply.status(503).send({
        error: 'GoogleOAuthNotConfigured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set before starting OAuth.',
      });
    }
    return service.buildGoogleConsentUrl();
  });

  /**
   * GET /auth/google/callback
   * Google redirects here after the user grants consent.
   * Exchanges the code, persists encrypted tokens, sets session cookies.
   */
  app.get('/google/callback', { ...authRateLimit }, async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);

    if (query.error) {
      return reply.status(400).send({ error: 'GoogleOAuthError', message: query.error });
    }
    if (!query.code) {
      return reply.status(400).send({ error: 'MissingOAuthCode', message: 'Authorization code is required.' });
    }
    if (!query.state || !service.consumeState(query.state)) {
      return reply.status(400).send({
        error: 'InvalidOAuthState',
        message: 'OAuth state is missing, invalid, or has expired. Please restart the sign-in flow.',
      });
    }

    const { userId, accountId, email } = await service.exchangeCode(query.code);

    // Set signed, httpOnly session cookies.
    reply
      .setCookie('session_user_id', userId, COOKIE_OPTS)
      .setCookie('session_account_id', accountId, COOKIE_OPTS);

    return reply.send({ connected: true, userId, accountId, email });
  });

  /**
   * GET /auth/status
   * Public — returns connection status for the current session cookie, if any.
   */
  app.get('/status', async (request) => {
    const rawUserId = request.cookies?.['session_user_id'];
    if (!rawUserId) return { connected: false, account: null };

    const { valid, value: userId } = request.unsignCookie(rawUserId);
    if (!valid || !userId) return { connected: false, account: null };

    return service.getStatus(userId);
  });

  /**
   * POST /auth/logout
   * Clears session cookies and removes stored tokens from the database.
   */
  app.post('/logout', async (request, reply) => {
    const rawUserId = request.cookies?.['session_user_id'];
    if (rawUserId) {
      const { valid, value: userId } = request.unsignCookie(rawUserId);
      if (valid && userId) await service.logout(userId);
    }

    reply
      .clearCookie('session_user_id', { path: '/' })
      .clearCookie('session_account_id', { path: '/' });

    return { loggedOut: true };
  });
};
