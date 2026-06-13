import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by auth-guard after verifying the session cookie. */
    userId: string;
    /** The Google Account ID associated with the session. */
    accountId: string;
  }
}
