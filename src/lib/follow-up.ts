/**
 * §13 Follow-up Rules / FR-022.
 *
 * Follow-up work stays manual: this module only decides *when* a reminder is
 * due and *whether* pending reminders should be cancelled. Nothing here sends
 * a message (§16).
 */

export const DEFAULT_FOLLOW_UP_OFFSET_DAYS = [3, 7];
export const MAX_FOLLOW_UPS = 2;

export type PlannedFollowUp = {
  sequence: number;
  offsetDays: number;
  dueAt: Date;
};

/** Normalizes a campaign's configured offsets: 0–2 strictly increasing days. */
export function normalizeFollowUpOffsets(offsets: number[] | null | undefined): number[] {
  const cleaned = (offsets ?? [])
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 365);
  const unique = [...new Set(cleaned)].sort((a, b) => a - b);
  return unique.slice(0, MAX_FOLLOW_UPS);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Builds the follow-up schedule for a record whose first message was just
 * confirmed as sent. Offsets are calendar days measured from `sentAt`.
 */
export function planFollowUps(sentAt: Date, offsets: number[] | null | undefined): PlannedFollowUp[] {
  return normalizeFollowUpOffsets(offsets).map((offsetDays, index) => ({
    sequence: index + 1,
    offsetDays,
    dueAt: addDays(sentAt, offsetDays),
  }));
}

/** Statuses that immediately cancel every pending follow-up (§13). */
const CANCELLING_STATUSES = new Set([
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
  "DECLINED",
  "DO_NOT_CONTACT",
  "INVALID",
  "DUPLICATE",
]);

export function shouldCancelFollowUps(newStatus: string): boolean {
  return CANCELLING_STATUSES.has(newStatus);
}

/** A task is actionable once its due date has passed. */
export function isDue(dueAt: Date, now: Date = new Date()): boolean {
  return dueAt.getTime() <= now.getTime();
}

/**
 * §13 "No response closure" — once the final follow-up window has expired with
 * no reply, the record closes as No Response.
 */
export function noResponseClosureAt(
  sentAt: Date,
  offsets: number[] | null | undefined,
  graceDays = 3,
): Date {
  const planned = normalizeFollowUpOffsets(offsets);
  const lastOffset = planned.length > 0 ? planned[planned.length - 1] : 0;
  return addDays(sentAt, lastOffset + graceDays);
}
