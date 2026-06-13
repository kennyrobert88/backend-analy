import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';

const VALID_STATUSES = ['applied', 'screening', 'interview', 'offer', 'rejected', 'accepted', 'withdrawn'] as const;

const createSchema = z.object({
  company: z.string().min(1).max(255),
  role: z.string().max(255).optional(),
  status: z.enum(VALID_STATUSES).default('applied'),
  appliedAt: z.string().datetime().optional(),
  sourceEmailId: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

const updateSchema = createSchema.partial();
const idSchema = z.object({ id: z.string().min(1).max(255) });

export const jobApplicationRoutes: FastifyPluginAsync = async (app) => {

  // GET /job-applications
  app.get('/', async (request) => {
    const data = await prisma.jobApplication.findMany({
      where: { userId: request.userId },
      orderBy: { appliedAt: 'desc' },
    });
    return { data };
  });

  // POST /job-applications
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const data = await prisma.jobApplication.create({
      data: {
        userId: request.userId,
        company: body.company,
        role: body.role ?? null,
        status: body.status,
        appliedAt: body.appliedAt ? new Date(body.appliedAt) : new Date(),
        sourceEmailId: body.sourceEmailId ?? null,
        notes: body.notes ?? null,
      },
    });
    return reply.status(201).send({ data });
  });

  // PATCH /job-applications/:id
  app.patch('/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const body = updateSchema.parse(request.body);

    const existing = await prisma.jobApplication.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'NotFound', message: `Job application ${id} not found.` });
    }

    const data = await prisma.jobApplication.update({
      where: { id },
      data: {
        ...(body.company !== undefined && { company: body.company }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.appliedAt !== undefined && { appliedAt: new Date(body.appliedAt) }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    return { data };
  });

  // DELETE /job-applications/:id
  app.delete('/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);

    const existing = await prisma.jobApplication.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'NotFound', message: `Job application ${id} not found.` });
    }

    await prisma.jobApplication.delete({ where: { id } });
    return { deleted: true, id };
  });

  // GET /job-applications/stats
  app.get('/stats', async (request) => {
    const rows = await prisma.jobApplication.groupBy({
      by: ['status'],
      where: { userId: request.userId },
      _count: { _all: true },
    });

    type StatusRow = { status: string; _count: { _all: number } };
    const totals = Object.fromEntries(rows.map((r: StatusRow) => [r.status, r._count._all]));
    const total = rows.reduce((s: number, r: StatusRow) => s + r._count._all, 0);

    return { total, byStatus: totals };
  });
};
