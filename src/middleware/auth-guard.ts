import type { FastifyInstance } from 'fastify';
import { findUserById, findAccountByUserId } from '../modules/users/users.repository.js';

export async function registerAuthGuard(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const rawUserId = request.cookies?.['session_user_id'];
    const rawAccountId = request.cookies?.['session_account_id'];

    if (!rawUserId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    // Verify the cookie signature (@fastify/cookie signs with SESSION_COOKIE_SECRET).
    const { valid: userIdValid, value: userId } = request.unsignCookie(rawUserId);
    const { valid: accountIdValid, value: accountId } = rawAccountId
      ? request.unsignCookie(rawAccountId)
      : { valid: false, value: undefined };

    if (!userIdValid || !userId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or tampered session cookie.' });
    }

    // Confirm the user still exists in the database.
    const user = await findUserById(userId);
    if (!user) {
      reply.clearCookie('session_user_id', { path: '/' }).clearCookie('session_account_id', { path: '/' });
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session user not found.' });
    }

    // Resolve accountId — prefer the cookie value, fall back to a DB lookup.
    let resolvedAccountId: string | null = accountIdValid && accountId ? accountId : null;
    if (!resolvedAccountId) {
      const account = await findAccountByUserId(userId);
      resolvedAccountId = account?.id ?? null;
    }

    if (!resolvedAccountId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'No connected account found for this session.' });
    }

    request.userId = userId;
    request.accountId = resolvedAccountId;
  });
}
