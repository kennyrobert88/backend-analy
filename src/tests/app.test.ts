import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config/index.js';

const testConfig = loadConfig({
  NODE_ENV: 'test',
  PORT: '4000',
  HOST: '127.0.0.1',
  API_BASE_URL: 'http://localhost:4000',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:4000/auth/google/callback',
  SESSION_COOKIE_SECRET: 'test-secret-long-enough-for-cookie-signing'
});

describe('backend-analy app', () => {
  it('serves health checks', async () => {
    const app = await createApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'backend-analy'
    });
  });

  it('reports readiness in test mode without leaking config details', async () => {
    const app = await createApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
    // Must not expose which secrets are configured.
    expect(response.json()).not.toHaveProperty('checks');
  });

  it('blocks OAuth start until Google credentials are configured', async () => {
    const app = await createApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/auth/google/start' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: 'GoogleOAuthNotConfigured'
    });
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    const app = await createApp({ config: testConfig });

    const [emails, sync, events] = await Promise.all([
      app.inject({ method: 'GET', url: '/emails' }),
      app.inject({ method: 'GET', url: '/sync/status' }),
      app.inject({ method: 'GET', url: '/calendar/events' })
    ]);

    expect(emails.statusCode).toBe(401);
    expect(sync.statusCode).toBe(401);
    expect(events.statusCode).toBe(401);
  });

  it('allows authenticated requests to protected routes', async () => {
    const app = await createApp({ config: testConfig });

    const [emails, sync, events] = await Promise.all([
      app.inject({ method: 'GET', url: '/emails', cookies: { session_user_id: 'user-123' } }),
      app.inject({ method: 'GET', url: '/sync/status', cookies: { session_user_id: 'user-123' } }),
      app.inject({ method: 'GET', url: '/calendar/events', cookies: { session_user_id: 'user-123' } })
    ]);

    expect(emails.statusCode).toBe(200);
    expect(sync.statusCode).toBe(200);
    expect(events.statusCode).toBe(200);
  });
});
