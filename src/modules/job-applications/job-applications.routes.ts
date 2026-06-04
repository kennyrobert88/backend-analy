import type { FastifyPluginAsync } from 'fastify';

export const jobApplicationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({
    data: []
  }));

  app.post('/', async (request, reply) =>
    reply.status(201).send({
      data: request.body ?? {},
      status: 'created'
    })
  );

  app.patch('/:id', async (request) => {
    const params = request.params as { id: string };

    return {
      id: params.id,
      data: request.body ?? {},
      status: 'updated'
    };
  });

  app.delete('/:id', async (request) => {
    const params = request.params as { id: string };

    return {
      id: params.id,
      status: 'deleted'
    };
  });
};
