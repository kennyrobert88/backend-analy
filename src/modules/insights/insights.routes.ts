import type { FastifyPluginAsync } from 'fastify';

export const insightRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({
    data: []
  }));

  app.post('/', async (request, reply) =>
    reply.status(201).send({
      data: request.body ?? {},
      status: 'created'
    })
  );
};
