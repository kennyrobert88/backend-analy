import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getCalendarEvents, getCalendarEmailCorrelation } from './calendar.service.js';

const eventsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const calendarRoutes: FastifyPluginAsync = async (app) => {

  // GET /calendar/events?from=&to=
  app.get('/events', async (request) => {
    const { from, to } = eventsQuerySchema.parse(request.query);
    const data = await getCalendarEvents(request.accountId, {
      ...(from !== undefined ? { from: new Date(from) } : {}),
      ...(to !== undefined ? { to: new Date(to) } : {}),
    });
    return { data };
  });

  // GET /calendar/correlation
  app.get('/correlation', async (request) => {
    const data = await getCalendarEmailCorrelation(request.accountId);
    return { data };
  });
};
