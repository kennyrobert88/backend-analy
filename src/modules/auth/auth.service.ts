import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../../config/index.js';
import { hasGoogleCredentials } from '../../config/index.js';

const googleOAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

export class AuthService {
  constructor(private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return hasGoogleCredentials(this.config);
  }

  buildGoogleConsentUrl(): { consentUrl: string; state: string } {
    if (!this.config.GOOGLE_CLIENT_ID) {
      throw new Error('Google OAuth client ID is not configured');
    }

    const state = randomBytes(24).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.config.GOOGLE_CLIENT_ID,
      redirect_uri: this.config.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly'
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return {
      consentUrl: `${googleOAuthEndpoint}?${params.toString()}`,
      state
    };
  }
}
