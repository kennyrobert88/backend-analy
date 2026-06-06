import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createJobApplicationSchema = z.object({
  company: z.string().min(1).max(255),
  role: z.string().max(255).optional(),
  status: z.string().min(1).max(100),
  appliedAt: z.string().datetime().optional(),
  notes: z.string().max(5000).optional()
});

const updateJobApplicationSchema = createJobApplicationSchema.partial();

const idParamSchema = z.object({ id: z.string().min(1).max(255) });

export const jobApplicationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ data: [] }));

  app.post('/', async (request, reply) => {
    const data = createJobApplicationSchema.parse(request.body);
    return reply.status(201).send({ data, status: 'created' });
  });

  app.patch('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const data = updateJobApplicationSchema.parse(request.body);
    return { id, data, status: 'updated' };
  });

  app.delete('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { id, status: 'deleted' };
  });
};
