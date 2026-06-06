import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createInsightSchema = z.object({
  kind: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  metadata: z.record(z.unknown()).optional()
});

export const insightRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ data: [] }));

  app.post('/', async (request, reply) => {
    const data = createInsightSchema.parse(request.body);
    return reply.status(201).send({ data, status: 'created' });
  });
};
