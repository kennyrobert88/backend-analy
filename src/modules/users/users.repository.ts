import { prisma } from '../../db/client.js';
import type { GoogleUserInfo } from '../auth/google-oauth.client.js';

export type UpsertAccountResult = {
  userId: string;
  accountId: string;
};

/**
 * Upsert a User + Account for a Google sign-in.
 * Returns stable IDs that are stored in the session cookie.
 */
export async function upsertGoogleAccount(
  userInfo: GoogleUserInfo
): Promise<UpsertAccountResult> {
  // Upsert the user by email (unique constraint on users.email).
  const user = await prisma.user.upsert({
    where: { email: userInfo.email },
    create: { email: userInfo.email, name: userInfo.name },
    update: { name: userInfo.name },
    select: { id: true },
  });

  // Upsert the Account record keyed by (provider, providerEmail).
  const account = await prisma.account.upsert({
    where: {
      provider_providerEmail: {
        provider: 'google',
        providerEmail: userInfo.email,
      },
    },
    create: {
      userId: user.id,
      provider: 'google',
      providerEmail: userInfo.email,
    },
    update: {},
    select: { id: true },
  });

  return { userId: user.id, accountId: account.id };
}

export async function findUserById(
  userId: string
): Promise<{ id: string; email: string | null } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
}

export async function findAccountByUserId(
  userId: string
): Promise<{ id: string; providerEmail: string | null; lastHistoryId: string | null } | null> {
  return prisma.account.findFirst({
    where: { userId },
    select: { id: true, providerEmail: true, lastHistoryId: true },
  });
}
