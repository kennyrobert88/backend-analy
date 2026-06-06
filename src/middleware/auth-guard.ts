import type { FastifyInstance } from 'fastify';

export async function registerAuthGuard(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const sessionUserId = request.cookies?.['session_user_id'];
    if (!sessionUserId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
    }
  });
}
