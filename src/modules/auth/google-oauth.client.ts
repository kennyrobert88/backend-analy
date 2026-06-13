import { google } from 'googleapis';
import type { AppConfig } from '../../config/index.js';

// Derive the OAuth2Client type from googleapis so we don't need a separate import path.
export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

export type GoogleUserInfo = {
  providerAccountId: string;
  email: string;
  name: string | null;
};

export function createOAuth2Client(config: AppConfig): OAuth2Client {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export async function exchangeCodeForTokens(
  client: OAuth2Client,
  code: string
): Promise<GoogleTokens> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  if (!tokens.access_token) {
    throw new Error('Google did not return an access token');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? null,
  };
}

export async function getUserInfo(
  client: OAuth2Client,
  accessToken: string
): Promise<GoogleUserInfo> {
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();

  if (!data.email) throw new Error('Google did not return user email');

  return {
    providerAccountId: data.id ?? data.email,
    email: data.email,
    name: data.name ?? null,
  };
}

export async function refreshAccessToken(
  client: OAuth2Client,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Token refresh did not return an access token');
  }

  return {
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
  };
}
