import type { FastifyPluginAsync } from 'fastify';

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/events', async () => ({
    data: []
  }));

  app.get('/correlation', async () => ({
    emailToMeetingCorrelation: [],
    meetingLoadBySender: []
  }));
};
