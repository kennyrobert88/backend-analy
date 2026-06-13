import { prisma } from '../../db/client.js';
import { loadTokens, saveTokens, isTokenFresh } from '../auth/token.repository.js';
import { createOAuth2Client, refreshAccessToken } from '../auth/google-oauth.client.js';
import { fetchCalendarEvents } from '../google/calendar.client.js';
import type { AppConfig } from '../../config/index.js';

export type CalendarSyncResult = { synced: number };

export async function syncCalendar(
  accountId: string,
  config: AppConfig
): Promise<CalendarSyncResult> {
  const tokens = await loadTokens(accountId);
  if (!tokens) throw new Error(`No stored tokens for account ${accountId}`);

  const client = createOAuth2Client(config);

  if (!isTokenFresh(tokens)) {
    if (!tokens.refreshToken) throw new Error('Access token expired with no refresh token');
    const refreshed = await refreshAccessToken(client, tokens.refreshToken);
    await saveTokens(accountId, { ...tokens, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt });
    client.setCredentials({ access_token: refreshed.accessToken, refresh_token: tokens.refreshToken });
  } else {
    client.setCredentials({ access_token: tokens.accessToken, ...(tokens.refreshToken != null ? { refresh_token: tokens.refreshToken } : {}) });
  }

  const events = await fetchCalendarEvents(client, { daysBack: 30, daysAhead: 30 });

  const ops = events.map(e =>
    prisma.calendarEvent.upsert({
      where: { id: e.id },
      create: { id: e.id, accountId, summary: e.summary, description: e.description, startAt: e.startAt, endAt: e.endAt, attendees: e.attendees },
      update: { summary: e.summary, description: e.description, startAt: e.startAt, endAt: e.endAt, attendees: e.attendees },
    })
  );
  await prisma.$transaction(ops);

  return { synced: events.length };
}

export async function getCalendarEvents(
  accountId: string,
  options: { from?: Date; to?: Date } = {}
) {
  const startAt = {
    ...(options.from !== undefined ? { gte: options.from } : {}),
    ...(options.to !== undefined ? { lte: options.to } : {}),
  };

  return prisma.calendarEvent.findMany({
    where: {
      accountId,
      ...(options.from !== undefined || options.to !== undefined ? { startAt } : {}),
    },
    orderBy: { startAt: 'asc' },
  });
}

export async function getCalendarEmailCorrelation(accountId: string) {
  type CorrelationRow = { date: Date; event_count: bigint; email_count: bigint };
  const rows = await prisma.$queryRaw<CorrelationRow[]>`
    SELECT
      DATE(ce."start_at") AS date,
      COUNT(DISTINCT ce.id)  AS event_count,
      COUNT(DISTINCT e.id)   AS email_count
    FROM calendar_events ce
    LEFT JOIN emails e
      ON e.account_id = ce.account_id
     AND DATE(e."received_at") = DATE(ce."start_at")
    WHERE ce.account_id = ${accountId}
    GROUP BY DATE(ce."start_at")
    ORDER BY date DESC
    LIMIT 30
  `;

  return rows.map((r: CorrelationRow) => ({
    date: r.date.toISOString().split('T')[0],
    eventCount: Number(r.event_count),
    emailCount: Number(r.email_count),
  }));
}
