import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  findEmails,
  findEmailById,
  findEmailsByThreadId,
  searchEmails,
  getEmailStats,
  getDailyVolume,
  getTopSenders,
  getHourlyDistribution,
} from './emails.repository.js';

const searchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const dailyVolumeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const emailIdSchema = z.object({ id: z.string().min(1).max(255) });

export const emailRoutes: FastifyPluginAsync = async (app) => {

  // GET /emails — paginated inbox list
  app.get('/', async (request) => {
    const { page, pageSize } = paginationSchema.parse(request.query);
    return findEmails(request.accountId, { page, pageSize });
  });

  // GET /emails/search?q=&limit=&offset=
  app.get('/search', async (request) => {
    const { q, limit, offset } = searchQuerySchema.parse(request.query);
    return searchEmails(request.accountId, q ?? '', { limit, offset });
  });

  // GET /emails/stats
  app.get('/stats', async (request) => {
    return getEmailStats(request.accountId);
  });

  // GET /emails/daily-volume?days=30
  app.get('/daily-volume', async (request) => {
    const { days } = dailyVolumeSchema.parse(request.query);
    const data = await getDailyVolume(request.accountId, days);
    return { days, data };
  });

  // GET /emails/senders
  app.get('/senders', async (request) => {
    const data = await getTopSenders(request.accountId);
    return { data };
  });

  // GET /emails/hourly-distribution
  app.get('/hourly-distribution', async (request) => {
    const data = await getHourlyDistribution(request.accountId);
    return { data };
  });

  // GET /emails/:id/thread  — must be registered before /:id
  app.get('/:id/thread', async (request, reply) => {
    const { id } = emailIdSchema.parse(request.params);
    const email = await findEmailById(request.accountId, id);
    if (!email) {
      return reply.status(404).send({ error: 'EmailNotFound', message: `Email ${id} not found.` });
    }
    const thread = await findEmailsByThreadId(request.accountId, email.threadId ?? id);
    return { emailId: id, thread };
  });

  // GET /emails/:id
  app.get('/:id', async (request, reply) => {
    const { id } = emailIdSchema.parse(request.params);
    const email = await findEmailById(request.accountId, id);
    if (!email) {
      return reply.status(404).send({ error: 'EmailNotFound', message: `Email ${id} not found.` });
    }
    return email;
  });
};
