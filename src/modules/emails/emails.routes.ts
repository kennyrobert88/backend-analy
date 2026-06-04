import type { FastifyPluginAsync } from 'fastify';

export const emailRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({
    data: [],
    page: 1,
    pageSize: 25,
    total: 0
  }));

  app.get('/search', async (request) => {
    const query = request.query as { q?: string };

    return {
      query: query.q ?? '',
      data: [],
      total: 0
    };
  });

  app.get('/stats', async () => ({
    totalEmails: 0,
    unreadEmails: 0,
    uniqueSenders: 0
  }));

  app.get('/daily-volume', async (request) => {
    const query = request.query as { days?: string };
    const days = query.days ? Number(query.days) : 30;

    return {
      days,
      data: []
    };
  });

  app.get('/senders', async () => ({
    data: []
  }));

  app.get('/hourly-distribution', async () => ({
    data: []
  }));

  app.get('/:id/thread', async (request) => {
    const params = request.params as { id: string };

    return {
      emailId: params.id,
      thread: []
    };
  });

  app.get('/:id', async (request, reply) => {
    const params = request.params as { id: string };

    return reply.status(404).send({
      error: 'EmailNotFound',
      message: `Email ${params.id} was not found.`
    });
  });
};
