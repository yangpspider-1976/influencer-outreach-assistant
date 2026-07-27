/**
 * §17 Reporting Formulas. Pure functions so AC-010 ("dashboard matches
 * independently verified test data") can be asserted directly in unit tests.
 */

import {
  COMPLETED_OUTCOME_STATUSES,
  INTERESTED_OR_LATER_STATUSES,
  REPLIED_OR_LATER_STATUSES,
  SENT_OR_LATER_STATUSES,
  type OutreachStatusKey,
} from "./status";

export type StatusCounts = Partial<Record<OutreachStatusKey, number>>;

export type FunnelInput = {
  /** Records in the campaign audience. */
  total: number;
  /** Records with an assignee. */
  assigned: number;
  statusCounts: StatusCounts;
  followUpsDue: number;
  followUpsCompleted: number;
  /** Milliseconds between queue open and outcome save, abandoned runs excluded. */
  processingDurationsMs: number[];
};

export type CampaignMetrics = {
  total: number;
  assigned: number;
  completed: number;
  sentOrLater: number;
  repliedOrLater: number;
  interestedOrLater: number;
  confirmed: number;
  invalid: number;
  processed: number;
  noResponse: number;
  outreachCompletionRate: number;
  replyRate: number;
  interestRate: number;
  confirmationRate: number;
  invalidRate: number;
  followUpCompletionRate: number;
  averageProcessingMs: number | null;
};

/** Sessions longer than this are treated as abandoned and excluded (§17). */
export const ABANDONED_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function sumOf(counts: StatusCounts, keys: readonly OutreachStatusKey[]): number {
  return keys.reduce((total, key) => total + (counts[key] ?? 0), 0);
}

export function computeCampaignMetrics(input: FunnelInput): CampaignMetrics {
  const counts = input.statusCounts;

  const completed = sumOf(counts, COMPLETED_OUTCOME_STATUSES);
  const sentOrLater = sumOf(counts, SENT_OR_LATER_STATUSES);
  const repliedOrLater = sumOf(counts, REPLIED_OR_LATER_STATUSES);
  const interestedOrLater = sumOf(counts, INTERESTED_OR_LATER_STATUSES);
  const confirmed = counts.CONFIRMED ?? 0;
  const invalid = counts.INVALID ?? 0;
  const noResponse = counts.NO_RESPONSE ?? 0;
  // "Processed" = the operator reached any conclusion on the record.
  const processed = completed;

  const durations = input.processingDurationsMs.filter(
    (ms) => ms >= 0 && ms <= ABANDONED_SESSION_TIMEOUT_MS,
  );

  return {
    total: input.total,
    assigned: input.assigned,
    completed,
    sentOrLater,
    repliedOrLater,
    interestedOrLater,
    confirmed,
    invalid,
    processed,
    noResponse,
    outreachCompletionRate: rate(completed, input.assigned),
    replyRate: rate(repliedOrLater, sentOrLater),
    interestRate: rate(interestedOrLater, repliedOrLater),
    confirmationRate: rate(confirmed, sentOrLater),
    invalidRate: rate(invalid, processed),
    followUpCompletionRate: rate(input.followUpsCompleted, input.followUpsDue),
    averageProcessingMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
  };
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
