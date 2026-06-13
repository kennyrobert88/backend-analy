import { google } from 'googleapis';
import type { OAuth2Client } from '../auth/google-oauth.client.js';

export type GmailMessageMeta = {
  id: string;
  threadId: string;
  subject: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  receivedAt: Date | null;
  snippet: string | null;
  labels: string[];
  hasAttachments: boolean;
  sizeBytes: number | null;
};

export type GmailHistoryResult = {
  addedMessageIds: string[];
  deletedMessageIds: string[];
  nextHistoryId: string | null;
};

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string
): string | null {
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    null
  );
}

/** List message IDs matching a Gmail query — one page at a time. */
export async function listMessageIds(
  auth: OAuth2Client,
  options: { query?: string; maxResults?: number; pageToken?: string } = {}
): Promise<{ ids: string[]; nextPageToken: string | undefined }> {
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: options.query ?? 'in:inbox',
    maxResults: options.maxResults ?? 500,
    // Only pass pageToken when defined — required by exactOptionalPropertyTypes
    ...(options.pageToken !== undefined ? { pageToken: options.pageToken } : {}),
  });

  const ids = (res.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  return {
    ids,
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
}

/** Fetch metadata for a single message. Returns null on 404. */
export async function fetchMessageMeta(
  auth: OAuth2Client,
  id: string
): Promise<GmailMessageMeta | null> {
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });

    const d = res.data;
    const headers = d.payload?.headers ?? [];
    const to = getHeader(headers, 'To');
    const hasAttachments = (d.payload?.parts ?? []).some(
      (p) => p.filename && p.filename.length > 0
    );

    return {
      id: d.id ?? id,
      threadId: d.threadId ?? '',
      subject: getHeader(headers, 'Subject'),
      fromAddress: getHeader(headers, 'From'),
      toAddresses: to ? [to] : [],
      receivedAt: d.internalDate ? new Date(parseInt(d.internalDate, 10)) : null,
      snippet: d.snippet ?? null,
      labels: d.labelIds ?? [],
      hasAttachments,
      sizeBytes: d.sizeEstimate ?? null,
    };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 404) return null;
    throw err;
  }
}

/**
 * Fetch metadata for many messages in parallel batches of `concurrency`.
 * Uses Promise.allSettled so individual 404s don't abort the batch.
 */
export async function fetchMessagesBatch(
  auth: OAuth2Client,
  ids: string[],
  concurrency = 10
): Promise<GmailMessageMeta[]> {
  const results: GmailMessageMeta[] = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchMessageMeta(auth, id))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
  }
  return results;
}

/**
 * Incremental sync via Gmail History API.
 * Returns null nextHistoryId when the provided historyId has expired
 * (caller should fall back to a full sync).
 */
export async function fetchHistory(
  auth: OAuth2Client,
  startHistoryId: string
): Promise<GmailHistoryResult> {
  const gmail = google.gmail({ version: 'v1', auth });
  const addedIds: string[] = [];
  const deletedIds: string[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'messageDeleted'],
        ...(pageToken !== undefined ? { pageToken } : {}),
      });

      for (const record of res.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) addedIds.push(added.message.id);
        }
        for (const deleted of record.messagesDeleted ?? []) {
          if (deleted.message?.id) deletedIds.push(deleted.message.id);
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    const profile = await gmail.users.getProfile({ userId: 'me' });
    return {
      addedMessageIds: [...new Set(addedIds)],
      deletedMessageIds: [...new Set(deletedIds)],
      nextHistoryId: profile.data.historyId ?? null,
    };
  } catch (err: unknown) {
    // 404 = historyId too old → signal to caller to do a full sync
    if ((err as { code?: number }).code === 404) {
      return { addedMessageIds: [], deletedMessageIds: [], nextHistoryId: null };
    }
    throw err;
  }
}

/** Grab the current historyId to seed the first incremental sync. */
export async function getCurrentHistoryId(auth: OAuth2Client): Promise<string | null> {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.historyId ?? null;
}
