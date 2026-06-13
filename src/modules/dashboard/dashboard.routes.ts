import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/client.js';

const widgetSchema = z.object({
  widgetKey: z.string().min(1).max(100),
  enabled: z.boolean(),
  position: z.number().int().min(0),
  settings: z.record(z.unknown()).optional(),
});

const updateWidgetsSchema = z.array(widgetSchema).min(1).max(50);

export const dashboardRoutes: FastifyPluginAsync = async (app) => {

  // GET /dashboard/widgets
  app.get('/widgets', async (request) => {
    const data = await prisma.dashboardWidget.findMany({
      where: { userId: request.userId },
      orderBy: { position: 'asc' },
    });
    return { data };
  });

  // PUT /dashboard/widgets — replace the full widget list for this user
  app.put('/widgets', async (request) => {
    const widgets = updateWidgetsSchema.parse(request.body);

    // Replace all widgets in a single transaction.
    await prisma.$transaction([
      prisma.dashboardWidget.deleteMany({ where: { userId: request.userId } }),
      prisma.dashboardWidget.createMany({
        data: widgets.map(w => ({
          userId: request.userId,
          widgetKey: w.widgetKey,
          enabled: w.enabled,
          position: w.position,
          settings: (w.settings ?? {}) as Prisma.InputJsonObject,
        })),
      }),
    ]);

    const data = await prisma.dashboardWidget.findMany({
      where: { userId: request.userId },
      orderBy: { position: 'asc' },
    });

    return { data };
  });
};
