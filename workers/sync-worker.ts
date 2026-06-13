/**
 * Background sync worker — runs independently of the API server.
 *
 * Polls all accounts with stored OAuth tokens every SYNC_INTERVAL_MS
 * and performs incremental email + calendar syncs.
 *
 * Start:  node dist/workers/sync-worker.js
 * Or via: tsx watch workers/sync-worker.ts   (dev)
 *
 * In production, run this as a separate container or process alongside
 * the API server. A single instance is safe because syncEmails() uses
 * the lastHistoryId stored in Postgres as a natural idempotency key.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { prisma } from '../src/db/client.js';
import { loadConfig } from '../src/config/index.js';
import { syncEmails } from '../src/modules/emails/sync.service.js';
import { syncCalendar } from '../src/modules/calendar/calendar.service.js';

const config = loadConfig();
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CONCURRENCY = 3; // max accounts synced in parallel

async function syncAllAccounts(): Promise<void> {
  // Find all accounts that have stored tokens.
  const accounts = await prisma.account.findMany({
    where: { oauthTokens: { some: {} } },
    select: { id: true, providerEmail: true },
  });

  if (accounts.length === 0) {
    console.log('[worker] No accounts to sync');
    return;
  }

  console.log(`[worker] Syncing ${accounts.length} account(s)…`);

  // Process in batches to avoid saturating the API quota.
  for (let i = 0; i < accounts.length; i += CONCURRENCY) {
    const batch = accounts.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (account: { id: string; providerEmail: string | null }) => {
        try {
          const [emailResult, calResult] = await Promise.all([
            syncEmails(account.id, config),
            syncCalendar(account.id, config),
          ]);
          console.log(
            `[worker] ${account.providerEmail} — emails: +${emailResult.added} -${emailResult.deleted} (${emailResult.type}), calendar: ${calResult.synced} events`
          );
        } catch (err: unknown) {
          console.error(`[worker] Failed to sync ${account.providerEmail}:`, (err as Error).message);
        }
      })
    );
  }
}

async function run(): Promise<void> {
  console.log(`[worker] Sync worker started — interval: ${SYNC_INTERVAL_MS / 1000}s`);

  // Run immediately on start, then on the interval.
  await syncAllAccounts();
  const interval = setInterval(syncAllAccounts, SYNC_INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received — shutting down…`);
    clearInterval(interval);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void run();
