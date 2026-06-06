import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const widgetSchema = z.object({
  id: z.string().min(1).max(100),
  enabled: z.boolean(),
  order: z.number().int().min(0)
});

const updateWidgetsSchema = z.array(widgetSchema).min(1).max(50);

const defaultWidgets = [
  { id: 'email-volume', enabled: true, order: 1 },
  { id: 'top-senders', enabled: true, order: 2 },
  { id: 'calendar-correlation', enabled: true, order: 3 }
];

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/widgets', async () => ({ data: defaultWidgets }));

  app.put('/widgets', async (request) => {
    const data = updateWidgetsSchema.parse(request.body);
    return { data };
  });
};
