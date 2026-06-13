# backend-analy

The backend service layer for [Analy](https://github.com/kennyrobert88/analy). Owns Google OAuth, Gmail and Calendar sync, analytics APIs, encrypted token storage, background sync worker, and Docker deployment.

---

## Table of Contents

- [Architecture](#architecture)
- [Stack](#stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Auth](#auth)
  - [Sync](#sync)
  - [Emails](#emails)
  - [Calendar](#calendar)
  - [Dashboard](#dashboard)
  - [Job Applications](#job-applications)
  - [Insights](#insights)
- [Database Schema](#database-schema)
- [Background Sync Worker](#background-sync-worker)
- [Security Model](#security-model)
- [Deployment](#deployment)
- [Key Rotation](#key-rotation)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Analy)                      │
└────────────────────────────┬────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────┐
│              Fastify API Server (:4000)                  │
│                                                         │
│  /auth    /emails    /calendar    /sync    /dashboard   │
│  /job-applications   /insights   /healthz  /readyz      │
│                                                         │
│  Auth Guard (cookie session → DB user lookup)           │
└──────┬──────────────┬──────────────────────┬────────────┘
       │              │                      │
┌──────▼──────┐ ┌─────▼──────┐  ┌───────────▼───────────┐
│  PostgreSQL  │ │ Google API │  │   Background Worker   │
│  (Prisma)   │ │ Gmail +    │  │   (sync-worker.ts)    │
│             │ │ Calendar   │  │   5-min poll, all     │
│  Encrypted  │ └────────────┘  │   accounts            │
│  OAuth      │                 └───────────────────────┘
│  tokens     │
└─────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 5 (`strict`, `exactOptionalPropertyTypes`) |
| HTTP | Fastify 4 |
| ORM | Prisma 5 + PostgreSQL |
| Google APIs | `googleapis` v144 |
| Auth | Signed `httpOnly` session cookies (`@fastify/cookie`) |
| Encryption | AES-256-GCM (tokens at rest) |
| Testing | Vitest |
| Container | Docker (multi-stage) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- A Google Cloud project with OAuth 2.0 Web credentials and the Gmail + Calendar APIs enabled

### 1. Install dependencies

```sh
npm install
```

### 2. Configure environment

```sh
cp .env.example .env.local
```

Fill in all required values (see [Environment Variables](#environment-variables)).

### 3. Generate secrets

```sh
# AES-256 token encryption key (32 random bytes, base64)
npm run gen-encryption-key

# Fastify cookie signing secret (32 random bytes, hex)
npm run gen-cookie-secret
```

Paste the output into `.env.local`.

### 4. Run database migrations

```sh
npm run migrate:dev
```

### 5. Start the server

```sh
npm run dev       # TypeScript watch mode
```

The API is available at `http://localhost:4000`.

### 6. (Optional) Start the background worker

```sh
npm run dev:worker
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/analy` |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | ✅ | Must match a URI registered in Google Cloud Console, e.g. `http://localhost:4000/auth/google/callback` |
| `SESSION_COOKIE_SECRET` | ✅ | 32+ byte hex string used to sign session cookies. Generate: `npm run gen-cookie-secret` |
| `TOKEN_ENCRYPTION_KEY` | ✅ | Base64-encoded 32-byte AES-256 key for encrypting OAuth tokens at rest. Generate: `npm run gen-encryption-key` |
| `TOKEN_ENCRYPTION_KEY_PREV` | ❌ | Previous encryption key — used during key rotation to decrypt old tokens without forcing re-auth |
| `PORT` | ❌ | HTTP port (default: `4000`) |
| `NODE_ENV` | ❌ | `development` or `production` |

Local development: put values in `.env.local` (gitignored). Production: inject via your platform's secret store.

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start API server in TypeScript watch mode |
| `npm run dev:worker` | Start background sync worker in watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled API server |
| `npm run start:worker` | Run compiled sync worker |
| `npm test` | Run Vitest test suite |
| `npm run typecheck` | Type-check without emitting files |
| `npm run migrate:dev` | Create and apply a new Prisma migration (dev) |
| `npm run migrate:deploy` | Apply pending migrations (production) |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run gen-encryption-key` | Print a new base64 AES-256 key to stdout |
| `npm run gen-cookie-secret` | Print a new hex cookie secret to stdout |

---

## API Reference

All endpoints except `/healthz`, `/readyz`, and `/auth/google/*` require a valid session cookie set by the auth flow.

Errors follow this shape:

```json
{
  "error": "ErrorCode",
  "message": "Human-readable description"
}
```

---

### Health

#### `GET /healthz`

Liveness check. Always returns 200 if the process is running.

**Response**
```json
{ "ok": true }
```

---

#### `GET /readyz`

Readiness check. Verifies database connectivity and required env vars.

**Response (200)**
```json
{ "ok": true }
```

**Response (503)**
```json
{ "ok": false, "reason": "database_unreachable" }
```

---

### Auth

#### `GET /auth/google/start`

Redirects the browser to Google's OAuth consent screen. Generates a single-use CSRF state token (10-minute expiry).

**Query Parameters**

| Param | Required | Description |
|---|---|---|
| `redirect` | ❌ | URL to redirect to after successful auth (defaults to `/`) |

**Response:** `302 Redirect → accounts.google.com`

---

#### `GET /auth/google/callback`

OAuth callback. Exchanges the authorization code for tokens, creates or updates the user and account records, stores encrypted tokens, and sets session cookies.

**Query Parameters (set by Google)**

| Param | Description |
|---|---|
| `code` | Authorization code |
| `state` | CSRF state token |

**Response (302):** Redirects to the original `redirect` URL (or `/`)

**Cookies set:**

| Cookie | Description |
|---|---|
| `session_user_id` | Signed, httpOnly, sameSite=lax — identifies the user |
| `session_account_id` | Signed, httpOnly, sameSite=lax — identifies the Google account |

---

#### `GET /auth/status`

Returns the currently authenticated user. Requires a valid session cookie.

**Response (200)**
```json
{
  "authenticated": true,
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "displayName": "Jane Smith",
    "avatarUrl": "https://..."
  }
}
```

**Response (401)**
```json
{ "authenticated": false }
```

---

#### `POST /auth/logout`

Clears session cookies and deletes stored OAuth tokens from the database.

**Response (200)**
```json
{ "ok": true }
```

---

### Sync

All sync endpoints trigger asynchronous operations. They return immediately; use `GET /sync/status` to poll progress.

#### `POST /sync/emails`

Triggers a Gmail sync for the current account. If a sync is already in progress, returns `409`.

Automatically selects full or incremental sync:
- **Full sync** — fetches up to 1,000 inbox messages from the last 90 days (used on first sync)
- **Incremental sync** — fetches only changes since the last `historyId` (Gmail History API)

If the stored `historyId` has expired (Gmail returns 404), falls back to a full sync automatically.

**Response (202)**
```json
{ "ok": true, "message": "Email sync started" }
```

**Response (409)**
```json
{ "error": "Conflict", "message": "A sync is already in progress" }
```

---

#### `POST /sync/calendar`

Triggers a Google Calendar sync for the current account (fetches events ±30 days from today).

**Response (202)**
```json
{ "ok": true, "message": "Calendar sync started" }
```

---

#### `GET /sync/status`

Returns the last sync result for the current account.

**Response (200)**
```json
{
  "emails": {
    "lastSyncAt": "2026-06-13T10:00:00.000Z",
    "type": "incremental",
    "added": 12,
    "deleted": 0
  },
  "calendar": {
    "lastSyncAt": "2026-06-13T10:00:00.000Z",
    "synced": 8
  }
}
```

---

### Emails

#### `GET /emails`

Paginated list of emails for the current account, sorted newest first.

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number (1-based) |
| `pageSize` | number | `25` | Results per page (max 100) |

**Response (200)**
```json
{
  "data": [
    {
      "id": "18a...",
      "threadId": "18a...",
      "subject": "Your invoice is ready",
      "fromAddress": "billing@example.com",
      "receivedAt": "2026-06-12T14:30:00.000Z",
      "snippet": "Please find attached your invoice for...",
      "labels": ["INBOX", "UNREAD"],
      "hasAttachments": true
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 342
}
```

---

#### `GET /emails/:id`

Fetch a single email including its full body and attachments.

**Response (200)**
```json
{
  "data": {
    "id": "18a...",
    "subject": "Your invoice is ready",
    "fromAddress": "billing@example.com",
    "toAddresses": "you@example.com",
    "receivedAt": "2026-06-12T14:30:00.000Z",
    "labels": ["INBOX"],
    "hasAttachments": true,
    "body": {
      "html": "<p>Please find...</p>",
      "plain": "Please find..."
    },
    "attachments": [
      { "filename": "invoice.pdf", "mimeType": "application/pdf", "sizeBytes": 84231 }
    ]
  }
}
```

**Response (404)**
```json
{ "error": "NotFound", "message": "Email 18a... not found." }
```

---

#### `GET /emails/:id/thread`

Fetch all emails in the same thread, sorted oldest first.

**Response (200)**
```json
{
  "data": [ /* array of email objects */ ]
}
```

---

#### `GET /emails/search`

Full-text search across subject, sender, and snippet.

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | ✅ | Search query |
| `limit` | number | ❌ | Max results (default 50, max 200) |
| `offset` | number | ❌ | Offset for pagination |

**Response (200)**
```json
{
  "data": [ /* matching email objects */ ],
  "total": 7,
  "query": "invoice"
}
```

---

#### `GET /emails/stats`

Aggregate statistics for the current account.

**Response (200)**
```json
{
  "totalEmails": 1247,
  "uniqueSenders": 89,
  "emailsWithAttachments": 143
}
```

---

#### `GET /emails/daily-volume`

Email count grouped by day.

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `days` | number | `30` | Number of days to look back |

**Response (200)**
```json
{
  "data": [
    { "date": "2026-06-13", "count": 14 },
    { "date": "2026-06-12", "count": 22 }
  ]
}
```

---

#### `GET /emails/senders`

Top senders by email volume.

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | number | `10` | Number of senders to return |

**Response (200)**
```json
{
  "data": [
    { "sender": "newsletter@example.com", "count": 47 },
    { "sender": "boss@company.com", "count": 31 }
  ]
}
```

---

#### `GET /emails/hourly-distribution`

Email count grouped by hour of day (0–23). All 24 hours are always present.

**Response (200)**
```json
{
  "data": [
    { "hour": 0, "count": 3 },
    { "hour": 1, "count": 1 },
    ...
    { "hour": 23, "count": 8 }
  ]
}
```

---

### Calendar

#### `GET /calendar/events`

List synced calendar events, sorted by start time ascending.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `from` | ISO 8601 datetime | Filter events starting on or after this time |
| `to` | ISO 8601 datetime | Filter events starting on or before this time |

**Response (200)**
```json
{
  "data": [
    {
      "id": "abc123",
      "summary": "Team standup",
      "description": null,
      "startAt": "2026-06-14T09:00:00.000Z",
      "endAt": "2026-06-14T09:30:00.000Z",
      "attendees": "you@example.com,teammate@example.com"
    }
  ]
}
```

---

#### `GET /calendar/correlation`

Daily correlation between calendar event count and email count — useful for visualising how meeting-heavy days affect email volume. Returns the last 30 days.

**Response (200)**
```json
{
  "data": [
    { "date": "2026-06-13", "eventCount": 4, "emailCount": 18 },
    { "date": "2026-06-12", "eventCount": 1, "emailCount": 7 }
  ]
}
```

---

### Dashboard

#### `GET /dashboard/widgets`

Fetch the current user's saved dashboard widget layout.

**Response (200)**
```json
{
  "data": [
    { "id": "clx...", "type": "email-volume", "position": 0, "config": {} }
  ]
}
```

---

#### `PUT /dashboard/widgets`

Replace the entire widget layout. Deletes existing widgets and inserts the new set in a single transaction.

**Request Body**
```json
{
  "widgets": [
    { "type": "email-volume", "position": 0, "config": { "days": 14 } },
    { "type": "top-senders", "position": 1, "config": { "limit": 5 } }
  ]
}
```

**Response (200)**
```json
{ "ok": true }
```

---

### Job Applications

#### `GET /job-applications`

List all job applications for the current user, sorted by application date descending.

**Response (200)**
```json
{
  "data": [
    {
      "id": "clx...",
      "company": "Acme Corp",
      "role": "Senior Engineer",
      "status": "interview",
      "appliedAt": "2026-06-01T00:00:00.000Z",
      "notes": "Referred by Jane",
      "sourceEmailId": null
    }
  ]
}
```

---

#### `POST /job-applications`

Create a new job application.

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `company` | string | ✅ | Company name (max 255 chars) |
| `role` | string | ❌ | Job title (max 255 chars) |
| `status` | string | ❌ | One of: `applied`, `screening`, `interview`, `offer`, `rejected`, `accepted`, `withdrawn` (default: `applied`) |
| `appliedAt` | ISO 8601 | ❌ | Application date (defaults to now) |
| `sourceEmailId` | string | ❌ | ID of a related email |
| `notes` | string | ❌ | Free-form notes (max 5,000 chars) |

**Response (201)**
```json
{ "data": { /* job application object */ } }
```

---

#### `PATCH /job-applications/:id`

Update a job application. All fields are optional.

**Response (200)**
```json
{ "data": { /* updated job application object */ } }
```

**Response (404)** — if the application doesn't exist or belongs to another user.

---

#### `DELETE /job-applications/:id`

Delete a job application.

**Response (200)**
```json
{ "deleted": true, "id": "clx..." }
```

---

#### `GET /job-applications/stats`

Breakdown of applications by status.

**Response (200)**
```json
{
  "total": 24,
  "byStatus": {
    "applied": 10,
    "interview": 7,
    "offer": 2,
    "rejected": 5
  }
}
```

---

### Insights

#### `GET /insights`

List all saved insights for the current user.

**Response (200)**
```json
{
  "data": [
    {
      "id": "clx...",
      "type": "pattern",
      "content": "You receive 40% more emails on Mondays.",
      "createdAt": "2026-06-10T12:00:00.000Z"
    }
  ]
}
```

---

#### `POST /insights`

Save a new insight.

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | ✅ | Insight type (e.g. `pattern`, `tip`, `summary`) |
| `content` | string | ✅ | Insight text |

**Response (201)**
```json
{ "data": { /* insight object */ } }
```

---

#### `DELETE /insights/:id`

Delete an insight.

**Response (200)**
```json
{ "deleted": true, "id": "clx..." }
```

---

## Database Schema

```
User
  id            String  @id
  googleId      String  @unique
  email         String  @unique
  displayName   String?
  avatarUrl     String?
  accounts      Account[]
  jobApps       JobApplication[]
  insights      Insight[]
  widgets       DashboardWidget[]

Account
  id              String  @id
  userId          String
  provider        String          -- "google"
  providerEmail   String?
  lastHistoryId   String?         -- Gmail incremental sync cursor
  oauthTokens     OAuthToken[]
  emails          Email[]
  calendarEvents  CalendarEvent[]

OAuthToken
  id            String  @id
  accountId     String  @unique    -- one token set per account
  accessToken   String              -- AES-256-GCM encrypted
  refreshToken  String?             -- AES-256-GCM encrypted
  expiresAt     DateTime
  scope         String?

Email
  id              String    @id    -- Gmail message ID
  accountId       String
  threadId        String?
  subject         String?
  fromAddress     String?
  toAddresses     String?
  receivedAt      DateTime?
  snippet         String?
  labels          String?
  category        String?
  hasAttachments  Boolean   @default(false)
  sizeBytes       Int?
  body            EmailBody?
  attachments     EmailAttachment[]

CalendarEvent
  id          String    @id
  accountId   String
  summary     String?
  description String?
  startAt     DateTime?
  endAt       DateTime?
  attendees   String?

JobApplication
  id            String    @id
  userId        String
  company       String
  role          String?
  status        String    @default("applied")
  appliedAt     DateTime  @default(now())
  sourceEmailId String?
  notes         String?

Insight
  id        String    @id
  userId    String
  type      String
  content   String
  createdAt DateTime  @default(now())

DashboardWidget
  id       String  @id
  userId   String
  type     String
  position Int
  config   Json    @default("{}")
```

---

## Background Sync Worker

The sync worker runs independently from the API server as a separate process (or container). It polls all accounts with valid OAuth tokens every 5 minutes and runs incremental email + calendar syncs concurrently.

### Start in development

```sh
npm run dev:worker
```

### Start in production

```sh
npm run start:worker
```

### Behaviour

- Fetches all accounts that have stored OAuth tokens
- Processes up to **3 accounts in parallel** using `Promise.allSettled` (failures are isolated — one bad account doesn't stop others)
- Automatically refreshes expired access tokens before syncing
- Uses **incremental sync** (Gmail History API) when a `lastHistoryId` is available; falls back to full sync if the historyId has expired
- Handles `SIGTERM` and `SIGINT` for graceful shutdown (waits for the in-progress batch to finish)

### Running as a separate container

```yaml
# docker-compose.yml (excerpt)
worker:
  build: .
  command: node dist/workers/sync-worker.js
  env_file: .env.production
  depends_on:
    - db
```

---

## Security Model

### Session cookies

- Signed with `SESSION_COOKIE_SECRET` using `@fastify/cookie`
- `httpOnly`, `secure` (production), `sameSite: lax`
- Two cookies: `session_user_id` and `session_account_id`
- Auth guard verifies cookie signature and performs a live DB user lookup on every request

### OAuth token encryption

- All OAuth tokens are encrypted at rest with **AES-256-GCM** before being stored in the database
- Wire format: `base64(iv):base64(authTag):base64(ciphertext)`
- Key material never leaves the server process
- Old tokens can be decrypted during key rotation using `TOKEN_ENCRYPTION_KEY_PREV`

### CSRF protection

- OAuth `state` parameter is a single-use token with a 10-minute expiry
- Stored in an in-process `Map`; consumed on first use

---

## Deployment

### Docker

```sh
docker build -t backend-analy .
docker run \
  -e DATABASE_URL="postgresql://..." \
  -e GOOGLE_CLIENT_ID="..." \
  -e GOOGLE_CLIENT_SECRET="..." \
  -e GOOGLE_OAUTH_REDIRECT_URI="https://yourdomain.com/auth/google/callback" \
  -e SESSION_COOKIE_SECRET="..." \
  -e TOKEN_ENCRYPTION_KEY="..." \
  -p 4000:4000 \
  backend-analy
```

### Production checklist

- [ ] `DATABASE_URL` points to a managed Postgres instance (not `localhost`)
- [ ] `GOOGLE_OAUTH_REDIRECT_URI` matches the URI registered in Google Cloud Console exactly
- [ ] `SESSION_COOKIE_SECRET` is at least 32 bytes (`npm run gen-cookie-secret`)
- [ ] `TOKEN_ENCRYPTION_KEY` is a freshly generated AES-256 key (`npm run gen-encryption-key`)
- [ ] `NODE_ENV=production` is set
- [ ] TLS is terminated upstream (nginx, load balancer, or Fly.io proxy)
- [ ] `/readyz` returns 200 before routing traffic to the instance
- [ ] Sync worker is deployed as a separate process/container

---

## Key Rotation

To rotate the token encryption key without forcing all users to re-authenticate:

1. Generate a new key:
   ```sh
   npm run gen-encryption-key
   ```

2. Set the **current** key as `TOKEN_ENCRYPTION_KEY_PREV` and the **new** key as `TOKEN_ENCRYPTION_KEY`:
   ```
   TOKEN_ENCRYPTION_KEY=<new key>
   TOKEN_ENCRYPTION_KEY_PREV=<old key>
   ```

3. Deploy. New tokens will be encrypted with the new key. Old tokens are decrypted with the previous key on first use and re-encrypted with the new key automatically.

4. Once all users have re-authenticated at least once (or after a reasonable window), remove `TOKEN_ENCRYPTION_KEY_PREV`.
