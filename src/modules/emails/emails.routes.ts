import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const searchQuerySchema = z.object({ q: z.string().max(500).optional() });
const dailyVolumeQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
});
const emailIdSchema = z.object({ id: z.string().min(1).max(255) });

export const emailRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({
    data: [],
    page: 1,
    pageSize: 25,
    total: 0
  }));

  app.get('/search', async (request) => {
    const { q } = searchQuerySchema.parse(request.query);
    return { query: q ?? '', data: [], total: 0 };
  });

  app.get('/stats', async () => ({
    totalEmails: 0,
    unreadEmails: 0,
    uniqueSenders: 0
  }));

  app.get('/daily-volume', async (request) => {
    const { days } = dailyVolumeQuerySchema.parse(request.query);
    return { days, data: [] };
  });

  app.get('/senders', async () => ({ data: [] }));

  app.get('/hourly-distribution', async () => ({ data: [] }));

  app.get('/:id/thread', async (request) => {
    const { id } = emailIdSchema.parse(request.params);
    return { emailId: id, thread: [] };
  });

  app.get('/:id', async (request, reply) => {
    const { id } = emailIdSchema.parse(request.params);
    return reply.status(404).send({ error: 'EmailNotFound', message: `Email ${id} was not found.` });
  });
};
