import { prisma } from '../../db/client.js';
import { encryptSecret, decryptSecret } from '../../config/secrets.js';
import type { GoogleTokens } from './google-oauth.client.js';

export type StoredTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

/** Encrypt and persist (or replace) OAuth tokens for an account. */
export async function saveTokens(accountId: string, tokens: GoogleTokens): Promise<void> {
  await prisma.oAuthToken.upsert({
    where: { accountId },
    create: {
      accountId,
      accessTokenCiphertext: encryptSecret(tokens.accessToken),
      refreshTokenCiphertext: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
    update: {
      accessTokenCiphertext: encryptSecret(tokens.accessToken),
      refreshTokenCiphertext: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
  });
}

/** Load and decrypt tokens for an account. Returns null if none exist. */
export async function loadTokens(accountId: string): Promise<StoredTokens | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { accountId },
    select: {
      accessTokenCiphertext: true,
      refreshTokenCiphertext: true,
      expiresAt: true,
      scope: true,
    },
  });

  if (!row?.accessTokenCiphertext) return null;

  return {
    accessToken: decryptSecret(row.accessTokenCiphertext),
    refreshToken: row.refreshTokenCiphertext ? decryptSecret(row.refreshTokenCiphertext) : null,
    expiresAt: row.expiresAt,
    scope: row.scope,
  };
}

/** Remove stored tokens — called on logout or account disconnection. */
export async function deleteTokens(accountId: string): Promise<void> {
  await prisma.oAuthToken.deleteMany({ where: { accountId } });
}

/** True if the stored access token has not expired yet (60 s safety buffer). */
export function isTokenFresh(tokens: StoredTokens): boolean {
  if (!tokens.expiresAt) return true;
  return tokens.expiresAt.getTime() > Date.now() + 60_000;
}
