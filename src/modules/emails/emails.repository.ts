import { prisma } from '../../db/client.js';
import type { GmailMessageMeta } from '../google/gmail.client.js';

// ── Upsert ────────────────────────────────────────────────────────────────────

export async function upsertEmails(
  accountId: string,
  messages: GmailMessageMeta[]
): Promise<number> {
  if (messages.length === 0) return 0;

  // Batch upsert in a single transaction for performance.
  const ops = messages.map(m =>
    prisma.email.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        accountId,
        threadId: m.threadId || null,
        subject: m.subject,
        fromAddress: m.fromAddress,
        toAddresses: m.toAddresses,
        receivedAt: m.receivedAt,
        snippet: m.snippet,
        labels: m.labels,
        hasAttachments: m.hasAttachments,
        sizeBytes: m.sizeBytes,
      },
      update: {
        labels: m.labels,
        snippet: m.snippet,
        hasAttachments: m.hasAttachments,
      },
    })
  );

  await prisma.$transaction(ops);
  return messages.length;
}

export async function deleteEmailsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.email.deleteMany({ where: { id: { in: ids } } });
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function findEmails(
  accountId: string,
  options: { page?: number; pageSize?: number }
) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, options.pageSize ?? 25);
  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.email.findMany({
      where: { accountId },
      orderBy: { receivedAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true, threadId: true, subject: true, fromAddress: true,
        receivedAt: true, snippet: true, labels: true, hasAttachments: true,
      },
    }),
    prisma.email.count({ where: { accountId } }),
  ]);

  return { data, page, pageSize, total };
}

export async function findEmailById(accountId: string, id: string) {
  return prisma.email.findFirst({
    where: { id, accountId },
    include: { body: true, attachments: true },
  });
}

export async function findEmailsByThreadId(accountId: string, threadId: string) {
  return prisma.email.findMany({
    where: { accountId, threadId },
    orderBy: { receivedAt: 'asc' },
  });
}

export async function searchEmails(
  accountId: string,
  query: string,
  options: { limit?: number; offset?: number } = {}
) {
  const q = query.trim();
  const where = {
    accountId,
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' as const } },
            { fromAddress: { contains: q, mode: 'insensitive' as const } },
            { snippet: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: Math.min(options.limit ?? 50, 200),
      skip: options.offset ?? 0,
      select: {
        id: true, threadId: true, subject: true, fromAddress: true,
        receivedAt: true, snippet: true, labels: true, hasAttachments: true,
        category: true,
      },
    }),
    prisma.email.count({ where }),
  ]);

  return { data, total, query: q };
}

export async function getEmailStats(accountId: string) {
  const [total, uniqueSenders, withAttachments] = await Promise.all([
    prisma.email.count({ where: { accountId } }),
    prisma.email.groupBy({ by: ['fromAddress'], where: { accountId } }).then((r: unknown[]) => r.length),
    prisma.email.count({ where: { accountId, hasAttachments: true } }),
  ]);

  return { totalEmails: total, uniqueSenders, emailsWithAttachments: withAttachments };
}

export async function getDailyVolume(accountId: string, days: number) {
  // Use raw query for date-grouping — Prisma doesn't support DATE() aggregation natively.
  const since = new Date(Date.now() - days * 86_400_000);
  type DailyRow = { date: Date; count: bigint };
  const rows = await prisma.$queryRaw<DailyRow[]>`
    SELECT DATE("received_at") AS date, COUNT(*) AS count
    FROM emails
    WHERE account_id = ${accountId}
      AND received_at >= ${since}
    GROUP BY DATE("received_at")
    ORDER BY date DESC
    LIMIT ${days}
  `;

  return rows.map((r: DailyRow) => ({ date: r.date.toISOString().split('T')[0], count: Number(r.count) }));
}

export async function getTopSenders(accountId: string, limit = 10) {
  type SenderRow = { from_address: string; count: bigint };
  const rows = await prisma.$queryRaw<SenderRow[]>`
    SELECT from_address, COUNT(*) AS count
    FROM emails
    WHERE account_id = ${accountId}
      AND from_address IS NOT NULL
    GROUP BY from_address
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return rows.map((r: SenderRow) => ({ sender: r.from_address, count: Number(r.count) }));
}

export async function getHourlyDistribution(accountId: string) {
  type HourRow = { hour: number; count: bigint };
  const rows = await prisma.$queryRaw<HourRow[]>`
    SELECT EXTRACT(HOUR FROM "received_at") AS hour, COUNT(*) AS count
    FROM emails
    WHERE account_id = ${accountId}
      AND received_at IS NOT NULL
    GROUP BY hour
    ORDER BY hour
  `;

  // Fill gaps so all 24 hours are present.
  const map = new Map(rows.map((r: HourRow) => [r.hour, Number(r.count)]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) ?? 0 }));
}
