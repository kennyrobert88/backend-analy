# backend-analy Modularization And Deployment Plan

## Goal

Turn `backend-analy` into the deployable service layer for Analy. The backend should own Google OAuth, Gmail and Calendar API access, token storage, synchronization jobs, analytics APIs, and deployment configuration. The desktop app should call this backend instead of connecting to Google directly with `.env` credentials.

## Current Starting Point

- `backend-analy` currently only has a `README.md`.
- `analy` currently owns Google OAuth in `src/auth/index.js`.
- `analy` currently reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env`.
- `analy` currently stores OAuth tokens and email data in local SQLite through `src/db/index.js`.
- `analy` currently exposes most app behavior through Electron IPC handlers in `src/main/ipc.js`.

## Target Architecture

```text
analy Electron app
  -> preload API
  -> local API client
  -> backend-analy HTTPS API
  -> Google OAuth / Gmail / Calendar
  -> backend database
  -> background sync worker
```

Backend responsibilities:

- Google OAuth web flow, callback handling, token refresh, and logout.
- Secure storage of OAuth refresh tokens.
- Gmail and Calendar sync.
- Email, attachment metadata, calendar event, job application, dashboard widget, and AI insight APIs.
- Background refresh jobs.
- Deployment health checks, logging, migrations, and runtime configuration.

Desktop app responsibilities:

- Windowing, local UI, preload bridge, and desktop-only actions like file export dialogs.
- Calling backend APIs through a small client module.
- Keeping optional local cache only if offline mode becomes a product requirement.

## Recommended Backend Stack

- Runtime: Node.js with TypeScript.
- HTTP framework: Fastify or Express. Prefer Fastify if starting fresh because schemas, validation, and plugins stay tidy as the API grows.
- Database: Postgres for deployed environments.
- ORM/migrations: Prisma or Drizzle. Prefer Prisma for quick migration visibility and generated types.
- Jobs: a simple queue first, then BullMQ/Redis if sync volume grows.
- Tests: Vitest or Jest for unit tests, Supertest or Fastify inject for route tests.
- Deployment: Cloud Run, Render, Fly.io, Railway, or another container host. Cloud Run pairs well with Google Secret Manager and Workload Identity.

## Secret And Google Credential Strategy

Do not package Google client secrets in `analy` and do not rely on a local `.env` file for production Google access.

Use this model instead:

- Create Google OAuth credentials as a Web application, not a Desktop app.
- Register deployed callback URLs, for example:
  - `https://api.analy.app/auth/google/callback`
  - `http://localhost:4000/auth/google/callback` for local development
- Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the deployment platform secret store.
- On Google Cloud, prefer Secret Manager plus Workload Identity/IAM access.
- On Render/Fly/Railway, use their encrypted environment/secret settings.
- For local development, allow `.env.local` or platform-specific local secrets, but document that `.env` is development-only and never used by the packaged desktop app.
- Store user refresh tokens encrypted at rest in the backend database.
- Rotate Google client secrets without requiring an Electron app rebuild.

## Module Layout

```text
backend-analy/
  src/
    app.ts
    server.ts
    config/
      index.ts
      secrets.ts
    modules/
      auth/
        auth.routes.ts
        auth.service.ts
        google-oauth.client.ts
        token.repository.ts
      google/
        gmail.client.ts
        calendar.client.ts
        google.types.ts
      emails/
        emails.routes.ts
        emails.service.ts
        emails.repository.ts
        sync.service.ts
      calendar/
        calendar.routes.ts
        calendar.service.ts
      analytics/
        analytics.routes.ts
        analytics.service.ts
      jobs/
        jobs.routes.ts
        jobs.service.ts
      insights/
        insights.routes.ts
        insights.service.ts
      users/
        users.repository.ts
    db/
      schema.prisma
      migrations/
    workers/
      sync-worker.ts
    middleware/
      auth-session.ts
      error-handler.ts
      request-logger.ts
    tests/
  Dockerfile
  package.json
  README.md
```

## API Surface To Build First

Auth:

- `GET /auth/google/start` returns or redirects to the Google consent URL.
- `GET /auth/google/callback` exchanges the OAuth code and creates an app session.
- `GET /auth/status` returns whether the current user is connected.
- `POST /auth/logout` revokes/clears backend tokens and ends the app session.

Sync:

- `POST /sync/emails` starts an email sync.
- `POST /sync/calendar` starts a calendar sync.
- `GET /sync/status` returns last sync time and current job state.

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

- `GET/PUT /dashboard/widgets`
- `GET/POST/PATCH/DELETE /job-applications`
- `GET/POST /insights`

## Data Migration Plan

1. Convert the SQLite schema in `analy/src/db/index.js` into backend database migrations.
2. Keep table names familiar at first: `emails`, `email_bodies`, `attachments`, `oauth_tokens`, `accounts`, `dashboard_widgets`, `job_applications`, `ai_insights`, `calendar_events`.
3. Add deployment-ready fields:
   - `users.id`
   - `accounts.user_id`
   - `oauth_tokens.account_id`
   - `created_at` and `updated_at`
   - sync cursor fields such as `last_history_id` when Gmail incremental sync is added.
4. Write a one-time import script for existing local SQLite data if preserving desktop data matters.
5. Keep backend IDs stable so the Electron UI does not need a large rewrite.

## Deployment Readiness Checklist

- `Dockerfile` builds the backend from a clean checkout.
- `npm run build` produces a production artifact.
- `npm test` runs unit and route tests.
- `npm run migrate:deploy` applies database migrations.
- `GET /healthz` verifies the service is alive.
- `GET /readyz` verifies database and required secret access.
- Structured logs include request ID, route, status, duration, and sync job IDs.
- CORS only allows approved Analy app origins.
- Rate limits exist for auth and sync endpoints.
- OAuth callback URL is HTTPS in production.
- Secrets live in the host secret manager, not in repo files or packaged desktop files.
- Refresh tokens are encrypted at rest.
- CI runs lint, typecheck, tests, and build.

## Implementation Phases

### Phase 1: Backend skeleton

- Initialize TypeScript project.
- Add HTTP server, config loader, health routes, error handler, and tests.
- Add Dockerfile and production start script.

### Phase 2: Google OAuth backend

- Move OAuth client creation from `analy/src/auth/index.js` into `backend-analy`.
- Implement Google start/callback/logout/status endpoints.
- Store OAuth tokens in the backend database.
- Use deployment secrets for Google credentials.

### Phase 3: Data and sync services

- Port SQLite schema to Postgres migrations.
- Move Gmail and Calendar fetch logic into backend services.
- Add manual sync endpoints.
- Add scheduled sync worker.

### Phase 4: API compatibility layer

- Mirror the existing Electron IPC capabilities as backend REST endpoints.
- Keep response shapes close to current IPC return values to reduce frontend churn.
- Add route tests for the most important dashboard queries.

### Phase 5: Electron client migration

- Coordinate with `analy/plan.md`.
- Replace direct imports of `src/auth`, `src/db`, and most `src/ai` calls with backend API calls.
- Leave desktop-only features in Electron.

### Phase 6: Production hardening

- Add CI.
- Add deployment environment docs.
- Add database backup/restore notes.
- Add observability and alerting for failed syncs, OAuth failures, and API errors.

## Open Decisions

- Whether Analy should support offline mode with a local cache after the backend migration.
- Whether users authenticate to Analy with app sessions only or with full user accounts.
- Whether AI insights stay local, move backend-side, or become hybrid.
- Which deployment host and database provider to standardize on first.
