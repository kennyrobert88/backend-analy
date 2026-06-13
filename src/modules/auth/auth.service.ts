import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../../config/index.js';
import { hasGoogleCredentials } from '../../config/index.js';
import {
  createOAuth2Client,
  exchangeCodeForTokens,
  getUserInfo,
} from './google-oauth.client.js';
import { saveTokens, loadTokens, deleteTokens } from './token.repository.js';
import { upsertGoogleAccount, findUserById, findAccountByUserId } from '../users/users.repository.js';

// ── OAuth state ───────────────────────────────────────────────────────────────
// Single-use CSRF tokens that expire after 10 minutes.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates(): void {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) {
    if (now > expiresAt) pendingStates.delete(state);
  }
}

// ── AuthService ───────────────────────────────────────────────────────────────

export type ExchangeResult = {
  userId: string;
  accountId: string;
  email: string;
};

export type AuthStatusResult = {
  connected: boolean;
  account: { id: string; email: string | null } | null;
};

export class AuthService {
  constructor(private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return hasGoogleCredentials(this.config);
  }

  /** Generate Google consent URL and register a single-use CSRF state token. */
  buildGoogleConsentUrl(): { consentUrl: string; state: string } {
    if (!this.config.GOOGLE_CLIENT_ID) {
      throw new Error('Google OAuth client ID is not configured');
    }

    pruneExpiredStates();
    const state = randomBytes(24).toString('base64url');
    pendingStates.set(state, Date.now() + STATE_TTL_MS);

    const params = new URLSearchParams({
      client_id: this.config.GOOGLE_CLIENT_ID,
      redirect_uri: this.config.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return {
      consentUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  /** Validate and consume a state token (single-use). */
  consumeState(state: string): boolean {
    pruneExpiredStates();
    if (!pendingStates.has(state)) return false;
    pendingStates.delete(state);
    return true;
  }

  /**
   * Exchange the authorization code for tokens, persist them encrypted,
   * and upsert the User + Account records.
   */
  async exchangeCode(code: string): Promise<ExchangeResult> {
    const client = createOAuth2Client(this.config);
    const tokens = await exchangeCodeForTokens(client, code);
    const userInfo = await getUserInfo(client, tokens.accessToken);
    const { userId, accountId } = await upsertGoogleAccount(userInfo);
    await saveTokens(accountId, tokens);

    return { userId, accountId, email: userInfo.email };
  }

  /** Return the current connection status for a user. */
  async getStatus(userId: string): Promise<AuthStatusResult> {
    const user = await findUserById(userId);
    if (!user) return { connected: false, account: null };

    const account = await findAccountByUserId(userId);
    if (!account) return { connected: false, account: null };

    const tokens = await loadTokens(account.id);
    if (!tokens) return { connected: false, account: { id: account.id, email: user.email } };

    return {
      connected: true,
      account: { id: account.id, email: account.providerEmail },
    };
  }

  /** Clear stored tokens for the user's account (revoke local session). */
  async logout(userId: string): Promise<void> {
    const account = await findAccountByUserId(userId);
    if (account) await deleteTokens(account.id);
  }
}
