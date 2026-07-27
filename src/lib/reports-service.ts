import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import {
  ABANDONED_SESSION_TIMEOUT_MS,
  computeCampaignMetrics,
  type CampaignMetrics,
  type StatusCounts,
} from "./metrics";
import { buildDailySeries, type DailyOutreachPoint } from "./daily-series";
import type { OutreachStatusKey } from "./status";

export type ReportFilters = {
  campaignId?: string | null;
  operatorId?: string | null;
  from?: Date | null;
  to?: Date | null;
};

export type OperatorRow = {
  operatorId: string;
  operatorName: string;
  assigned: number;
  completed: number;
  sent: number;
  confirmed: number;
  completionRate: number;
  averageProcessingMs: number | null;
};

export type CampaignReport = {
  metrics: CampaignMetrics;
  statusCounts: StatusCounts;
  operators: OperatorRow[];
  daily: DailyOutreachPoint[];
};

function recordWhere(filters: ReportFilters): Prisma.CampaignInfluencerWhereInput {
  return {
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.operatorId ? { assigneeId: filters.operatorId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

/** §17 — all reporting numbers derive from these aggregates (AC-010). */
export async function buildCampaignReport(filters: ReportFilters): Promise<CampaignReport> {
  const where = recordWhere(filters);

  const [grouped, total, assigned, followUps, attempts] = await Promise.all([
    prisma.campaignInfluencer.groupBy({
      by: ["outreachStatus"],
      where,
      _count: { _all: true },
    }),
    prisma.campaignInfluencer.count({ where }),
    prisma.campaignInfluencer.count({ where: { ...where, assigneeId: { not: null } } }),
    prisma.followUpTask.findMany({
      where: {
        campaignInfluencer: where,
        // "Due" means the reminder date has arrived (§17).
        dueAt: { lte: new Date() },
        status: { in: ["PENDING", "COMPLETED"] },
      },
      select: { status: true },
    }),
    prisma.outreachAttempt.findMany({
      where: {
        campaignInfluencer: where,
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      select: {
        createdAt: true,
        outcome: true,
        createdById: true,
        campaignInfluencer: { select: { queueOpenedAt: true } },
      },
    }),
  ]);

  const statusCounts: StatusCounts = {};
  for (const row of grouped) {
    statusCounts[row.outreachStatus as OutreachStatusKey] = row._count._all;
  }

  const processingDurationsMs = attempts
    .map((attempt) => {
      const opened = attempt.campaignInfluencer.queueOpenedAt;
      if (!opened) return null;
      return attempt.createdAt.getTime() - opened.getTime();
    })
    .filter((ms): ms is number => ms !== null && ms >= 0 && ms <= ABANDONED_SESSION_TIMEOUT_MS);

  const metrics = computeCampaignMetrics({
    total,
    assigned,
    statusCounts,
    followUpsDue: followUps.length,
    followUpsCompleted: followUps.filter((task) => task.status === "COMPLETED").length,
    processingDurationsMs,
  });

  const daily = buildDailySeries(attempts);
  const operators = await buildOperatorRows(where);

  return { metrics, statusCounts, operators, daily };
}

async function buildOperatorRows(
  where: Prisma.CampaignInfluencerWhereInput,
): Promise<OperatorRow[]> {
  const records = await prisma.campaignInfluencer.findMany({
    where: { ...where, assigneeId: { not: null } },
    select: {
      assigneeId: true,
      outreachStatus: true,
      queueOpenedAt: true,
      assignee: { select: { id: true, name: true } },
      attempts: { select: { createdAt: true, outcome: true } },
    },
  });

  const byOperator = new Map<string, OperatorRow & { durations: number[] }>();

  for (const record of records) {
    if (!record.assignee) continue;
    const key = record.assignee.id;
    if (!byOperator.has(key)) {
      byOperator.set(key, {
        operatorId: key,
        operatorName: record.assignee.name,
        assigned: 0,
        completed: 0,
        sent: 0,
        confirmed: 0,
        completionRate: 0,
        averageProcessingMs: null,
        durations: [],
      });
    }
    const row = byOperator.get(key)!;
    row.assigned += 1;
    if (record.attempts.length > 0) row.completed += 1;
    if (record.attempts.some((attempt) => attempt.outcome === "SENT")) row.sent += 1;
    if (record.outreachStatus === "CONFIRMED") row.confirmed += 1;

    if (record.queueOpenedAt && record.attempts.length > 0) {
      const latest = record.attempts.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
      const duration = latest.createdAt.getTime() - record.queueOpenedAt.getTime();
      if (duration >= 0 && duration <= ABANDONED_SESSION_TIMEOUT_MS) row.durations.push(duration);
    }
  }

  return [...byOperator.values()]
    .map(({ durations, ...row }) => ({
      ...row,
      completionRate: row.assigned ? Math.round((row.completed / row.assigned) * 1000) / 10 : 0,
      averageProcessingMs: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    }))
    .sort((a, b) => b.completed - a.completed);
}
