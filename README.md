# backend-analy

Deployable service layer for Analy. This backend owns Google OAuth, Gmail and Calendar API access, sync orchestration, analytics APIs, token storage, health checks, and deployment configuration.

## Stack

- Node.js 20+ with TypeScript
- Fastify HTTP server
- Prisma/Postgres schema foundation
- Vitest route tests
- Docker production image

## Getting Started

```sh
npm install
cp .env.example .env.local
npm run dev
```

The local server defaults to `http://localhost:4000`.

## Scripts

- `npm run dev` starts the TypeScript server in watch mode.
- `npm run build` compiles to `dist/`.
- `npm start` runs the compiled server.
- `npm test` runs route tests.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run migrate:deploy` applies Prisma migrations in deployed environments.

## Current API Surface

Health:

- `GET /healthz`
- `GET /readyz`

Auth:

- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/status`
- `POST /auth/logout`

Sync:

- `POST /sync/emails`
- `POST /sync/calendar`
- `GET /sync/status`

Emails:

- `GET /emails`
- `GET /emails/:id`
- `GET /emails/:id/thread`
- `GET /emails/search?q=...`
- `GET /emails/stats`
- `GET /emails/daily-volume?days=30`
- `GET /emails/senders`
- `GET /emails/hourly-distribution`

Calendar:

- `GET /calendar/events`
- `GET /calendar/correlation`

App data:

- `GET /dashboard/widgets`
- `PUT /dashboard/widgets`
- `GET/POST/PATCH/DELETE /job-applications`
- `GET/POST /insights`

Several endpoints intentionally return empty data or `501 NotImplemented` while OAuth token exchange, persistence, and Google API sync are wired in.

## Configuration

Production Google access must use web OAuth credentials. Do not package Google client secrets into the Electron app.

Set these values through the deployment platform secret store:

- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `SESSION_COOKIE_SECRET`
- `TOKEN_ENCRYPTION_KEY`

Local development can use `.env.local`; committed `.env` files are ignored.

## Deployment

Build and run with Docker:

```sh
docker build -t backend-analy .
docker run --env-file .env.local -p 4000:4000 backend-analy
```

`/readyz` is strict in production and requires database, Google OAuth, session, and token encryption secrets to be configured.
