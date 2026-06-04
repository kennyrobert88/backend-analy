import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config/index.js';

const testConfig = loadConfig({
  NODE_ENV: 'test',
  PORT: '4000',
  HOST: '127.0.0.1',
  API_BASE_URL: 'http://localhost:4000',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:4000/auth/google/callback'
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

  it('reports readiness checks in test mode', async () => {
    const app = await createApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ready',
      checks: {
        databaseConfigured: false,
        googleOAuthConfigured: false
      }
    });
  });

  it('blocks OAuth start until Google credentials are configured', async () => {
    const app = await createApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/auth/google/start' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: 'GoogleOAuthNotConfigured'
    });
  });

  it('exposes planned API route stubs', async () => {
    const app = await createApp({ config: testConfig });

    const [emails, sync, events] = await Promise.all([
      app.inject({ method: 'GET', url: '/emails' }),
      app.inject({ method: 'GET', url: '/sync/status' }),
      app.inject({ method: 'GET', url: '/calendar/events' })
    ]);

    expect(emails.statusCode).toBe(200);
    expect(sync.statusCode).toBe(200);
    expect(events.statusCode).toBe(200);
  });
});
