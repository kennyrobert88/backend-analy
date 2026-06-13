import type { FastifyPluginAsync } from 'fastify';
import { syncEmails } from '../emails/sync.service.js';
import { syncCalendar } from '../calendar/calendar.service.js';

// In-memory sync state — sufficient for a single-instance deploy.
// Replace with a Redis-backed job queue (e.g. BullMQ) when scaling horizontally.
const syncState = {
  email: {
    running: false,
    lastStartedAt: null as string | null,
    lastFinishedAt: null as string | null,
    lastResult: null as Record<string, unknown> | null,
    lastError: null as string | null,
  },
  calendar: {
    running: false,
    lastStartedAt: null as string | null,
    lastFinishedAt: null as string | null,
    lastResult: null as Record<string, unknown> | null,
    lastError: null as string | null,
  },
};

export const syncRoutes: FastifyPluginAsync = async (app) => {

  // POST /sync/emails — trigger an email sync (background, non-blocking)
  app.post('/emails', async (request, reply) => {
    if (syncState.email.running) {
      return reply.status(409).send({
        error: 'SyncAlreadyRunning',
        message: 'An email sync is already in progress.',
      });
    }

    const jobId = `email-sync-${Date.now()}`;
    syncState.email.running = true;
    syncState.email.lastStartedAt = new Date().toISOString();
    syncState.email.lastError = null;

    // Fire-and-forget — the client polls /sync/status.
    setImmediate(async () => {
      try {
        const result = await syncEmails(request.accountId, app.config);
        syncState.email.lastResult = result as Record<string, unknown>;
      } catch (err: unknown) {
        syncState.email.lastError = (err as Error).message;
        app.log.error({ err }, 'email sync failed');
      } finally {
        syncState.email.running = false;
        syncState.email.lastFinishedAt = new Date().toISOString();
      }
    });

    return reply.status(202).send({ jobId, type: 'email', status: 'running' });
  });

  // POST /sync/calendar — trigger a calendar sync
  app.post('/calendar', async (request, reply) => {
    if (syncState.calendar.running) {
      return reply.status(409).send({
        error: 'SyncAlreadyRunning',
        message: 'A calendar sync is already in progress.',
      });
    }

    const jobId = `calendar-sync-${Date.now()}`;
    syncState.calendar.running = true;
    syncState.calendar.lastStartedAt = new Date().toISOString();
    syncState.calendar.lastError = null;

    setImmediate(async () => {
      try {
        const result = await syncCalendar(request.accountId, app.config);
        syncState.calendar.lastResult = result as Record<string, unknown>;
      } catch (err: unknown) {
        syncState.calendar.lastError = (err as Error).message;
        app.log.error({ err }, 'calendar sync failed');
      } finally {
        syncState.calendar.running = false;
        syncState.calendar.lastFinishedAt = new Date().toISOString();
      }
    });

    return reply.status(202).send({ jobId, type: 'calendar', status: 'running' });
  });

  // GET /sync/status
  app.get('/status', async () => syncState);
};
