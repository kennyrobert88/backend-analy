import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: '.env.local' });
loadEnv();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,app://analy'),
  DATABASE_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:4000/auth/google/callback'),
  SESSION_COOKIE_SECRET: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional()
});

export type AppConfig = z.infer<typeof configSchema> & {
  allowedOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);

  return {
    ...parsed,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
}

export const appConfig = loadConfig();

export function hasGoogleCredentials(config: AppConfig): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}

export function hasProductionSecrets(config: AppConfig): boolean {
  return Boolean(
    config.DATABASE_URL &&
      config.GOOGLE_CLIENT_ID &&
      config.GOOGLE_CLIENT_SECRET &&
      config.SESSION_COOKIE_SECRET &&
      config.TOKEN_ENCRYPTION_KEY
  );
}
