import { google } from 'googleapis';
import type { OAuth2Client } from '../auth/google-oauth.client.js';

export type CalendarEventData = {
  id: string;
  summary: string | null;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  attendees: string[];
};

export async function fetchCalendarEvents(
  auth: OAuth2Client,
  options: { daysBack?: number; daysAhead?: number; maxResults?: number } = {}
): Promise<CalendarEventData[]> {
  const calendar = google.calendar({ version: 'v3', auth });
  const now = Date.now();
  const timeMin = new Date(now - (options.daysBack ?? 30) * 86_400_000).toISOString();
  const timeMax = new Date(now + (options.daysAhead ?? 30) * 86_400_000).toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults: options.maxResults ?? 250,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items ?? [])
    .filter(e => e.id)
    .map(e => ({
      id: e.id!,
      summary: e.summary ?? null,
      description: e.description ?? null,
      startAt: e.start?.dateTime
        ? new Date(e.start.dateTime)
        : e.start?.date
        ? new Date(e.start.date)
        : null,
      endAt: e.end?.dateTime
        ? new Date(e.end.dateTime)
        : e.end?.date
        ? new Date(e.end.date)
        : null,
      attendees: (e.attendees ?? [])
        .map(a => a.email)
        .filter((email): email is string => Boolean(email)),
    }));
}
