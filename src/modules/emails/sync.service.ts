/**
 * Gmail sync service — full and incremental.
 *
 * Full sync:   fetches all inbox messages from the last 90 days.
 * Incremental: uses the Gmail History API from the stored historyId,
 *              falling back to full sync if the historyId has expired.
 */

import { prisma } from '../../db/client.js';
import { loadTokens, saveTokens, isTokenFresh } from '../auth/token.repository.js';
import { createOAuth2Client, refreshAccessToken } from '../auth/google-oauth.client.js';
import {
  listMessageIds,
  fetchMessagesBatch,
  fetchHistory,
  getCurrentHistoryId,
} from '../google/gmail.client.js';
import { upsertEmails, deleteEmailsByIds } from './emails.repository.js';
import type { AppConfig } from '../../config/index.js';

export type SyncResult = {
  type: 'full' | 'incremental';
  added: number;
  deleted: number;
  historyId: string | null;
};

async function getValidClient(accountId: string, config: AppConfig) {
  const tokens = await loadTokens(accountId);
  if (!tokens) throw new Error(`No stored tokens for account ${accountId}`);

  const client = createOAuth2Client(config);

  if (!isTokenFresh(tokens)) {
    if (!tokens.refreshToken) throw new Error('Access token expired and no refresh token available');
    const refreshed = await refreshAccessToken(client, tokens.refreshToken);
    // Persist the new access token.
    await saveTokens(accountId, {
      accessToken: refreshed.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: tokens.scope,
    });
    client.setCredentials({ access_token: refreshed.accessToken, refresh_token: tokens.refreshToken });
  } else {
    client.setCredentials({ access_token: tokens.accessToken, ...(tokens.refreshToken != null ? { refresh_token: tokens.refreshToken } : {}) });
  }

  return client;
}

/** Full sync — fetches up to `maxMessages` recent inbox messages. */
export async function runFullSync(
  accountId: string,
  config: AppConfig,
  maxMessages = 1000
): Promise<SyncResult> {
  const client = await getValidClient(accountId, config);

  // Collect all message IDs (paginated).
  const allIds: string[] = [];
  let pageToken: string | undefined;
  const since = new Date(Date.now() - 90 * 86_400_000);
  const query = `in:inbox after:${Math.floor(since.getTime() / 1000)}`;

  do {
    const page = await listMessageIds(client, {
      query,
      maxResults: 500,
      ...(pageToken !== undefined ? { pageToken } : {}),
    });
    allIds.push(...page.ids);
    pageToken = page.nextPageToken;
  } while (pageToken && allIds.length < maxMessages);

  const ids = allIds.slice(0, maxMessages);

  // Fetch metadata in parallel batches of 10.
  const messages = await fetchMessagesBatch(client, ids, 10);
  const added = await upsertEmails(accountId, messages);

  // Store the current historyId so next sync can be incremental.
  const historyId = await getCurrentHistoryId(client);
  await prisma.account.update({
    where: { id: accountId },
    data: { lastHistoryId: historyId },
  });

  return { type: 'full', added, deleted: 0, historyId };
}

/** Incremental sync — processes only changes since the stored historyId. */
export async function runIncrementalSync(
  accountId: string,
  config: AppConfig,
  lastHistoryId: string
): Promise<SyncResult> {
  const client = await getValidClient(accountId, config);
  const { addedMessageIds, deletedMessageIds, nextHistoryId } = await fetchHistory(client, lastHistoryId);

  // nextHistoryId === null means the historyId was too old → fall back to full sync.
  if (!nextHistoryId) {
    return runFullSync(accountId, config);
  }

  const messages = await fetchMessagesBatch(client, addedMessageIds, 10);
  const added = await upsertEmails(accountId, messages);
  await deleteEmailsByIds(deletedMessageIds);

  await prisma.account.update({
    where: { id: accountId },
    data: { lastHistoryId: nextHistoryId },
  });

  return { type: 'incremental', added, deleted: deletedMessageIds.length, historyId: nextHistoryId };
}

/** Entry point — chooses incremental or full sync automatically. */
export async function syncEmails(accountId: string, config: AppConfig): Promise<SyncResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { lastHistoryId: true },
  });

  if (account?.lastHistoryId) {
    return runIncrementalSync(accountId, config, account.lastHistoryId);
  }
  return runFullSync(accountId, config);
}
