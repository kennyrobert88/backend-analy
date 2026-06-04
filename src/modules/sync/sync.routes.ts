import type { FastifyPluginAsync } from 'fastify';

const syncState = {
  email: {
    running: false,
    lastStartedAt: null as string | null,
    lastFinishedAt: null as string | null
  },
  calendar: {
    running: false,
    lastStartedAt: null as string | null,
    lastFinishedAt: null as string | null
  }
};

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post('/emails', async (_request, reply) => {
    syncState.email.lastStartedAt = new Date().toISOString();

    return reply.status(202).send({
      jobId: `email-sync-${Date.now()}`,
      type: 'email',
      status: 'queued'
    });
  });

  app.post('/calendar', async (_request, reply) => {
    syncState.calendar.lastStartedAt = new Date().toISOString();

    return reply.status(202).send({
      jobId: `calendar-sync-${Date.now()}`,
      type: 'calendar',
      status: 'queued'
    });
  });

  app.get('/status', async () => syncState);
};
