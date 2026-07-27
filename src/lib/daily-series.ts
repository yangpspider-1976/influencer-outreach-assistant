export type DailyOutreachPoint = {
  date: string;
  sent: number;
  completed: number;
};

/**
 * Builds UTC date buckets for the trailing 14 calendar days.
 *
 * Outreach attempts are stored and grouped as UTC timestamps, so the bucket
 * boundaries use UTC as well. Accepting `today` keeps the calculation
 * deterministic in tests.
 */
export function buildDailySeries(
  attempts: { createdAt: Date; outcome: string }[],
  today = new Date(),
): DailyOutreachPoint[] {
  const buckets = new Map<string, Omit<DailyOutreachPoint, "date">>();
  const anchor = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() - offset);
    buckets.set(day.toISOString().slice(0, 10), { sent: 0, completed: 0 });
  }

  for (const attempt of attempts) {
    const key = attempt.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.completed += 1;
    if (attempt.outcome === "SENT") bucket.sent += 1;
  }

  return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
}
