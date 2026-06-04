import type { FastifyPluginAsync } from 'fastify';

const defaultWidgets = [
  { id: 'email-volume', enabled: true, order: 1 },
  { id: 'top-senders', enabled: true, order: 2 },
  { id: 'calendar-correlation', enabled: true, order: 3 }
];

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/widgets', async () => ({
    data: defaultWidgets
  }));

  app.put('/widgets', async (request) => ({
    data: (request.body as unknown) ?? defaultWidgets
  }));
};
