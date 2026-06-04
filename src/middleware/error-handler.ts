import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ error }, 'request failed');

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Request validation failed',
        issues: error.issues
      });
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'InternalServerError' : 'RequestError',
      message: statusCode >= 500 ? 'Unexpected server error' : error.message
    });
  });
}
