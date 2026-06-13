import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/client.js';

const createSchema = z.object({
  kind: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(10_000),
  metadata: z.record(z.unknown()).optional(),
});

const idSchema = z.object({ id: z.string().min(1).max(255) });

const listQuerySchema = z.object({
  kind: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const insightRoutes: FastifyPluginAsync = async (app) => {

  // GET /insights?kind=&limit=
  app.get('/', async (request) => {
    const { kind, limit } = listQuerySchema.parse(request.query);
    const data = await prisma.aiInsight.findMany({
      where: { userId: request.userId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { data };
  });

  // POST /insights
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const data = await prisma.aiInsight.create({
      data: {
        userId: request.userId,
        kind: body.kind,
        title: body.title,
        body: body.body,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonObject,
      },
    });
    return reply.status(201).send({ data });
  });

  // DELETE /insights/:id
  app.delete('/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const existing = await prisma.aiInsight.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'NotFound', message: `Insight ${id} not found.` });
    }
    await prisma.aiInsight.delete({ where: { id } });
    return { deleted: true, id };
  });
};
