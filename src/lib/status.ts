/**
 * FR-021 — outreach status model, transitions and presentation metadata.
 * Pure module (no database access) so transitions are unit-testable.
 */

export const OUTREACH_STATUSES = [
  "NOT_CONTACTED",
  "READY",
  "SENT",
  "FOLLOW_UP_DUE",
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
  "DECLINED",
  "NO_RESPONSE",
  "INVALID",
  "DUPLICATE",
  "DO_NOT_CONTACT",
] as const;

export type OutreachStatusKey = (typeof OUTREACH_STATUSES)[number];

export type StatusTone = "neutral" | "info" | "progress" | "positive" | "warning" | "danger";

export const STATUS_META: Record<
  OutreachStatusKey,
  { label: string; description: string; tone: StatusTone }
> = {
  NOT_CONTACTED: {
    label: "Not Contacted",
    description: "Imported but not yet prepared or assigned.",
    tone: "neutral",
  },
  READY: {
    label: "Ready to Send",
    description: "Validated, assigned and available in the operator queue.",
    tone: "info",
  },
  SENT: {
    label: "Sent",
    description: "Operator confirmed that the message was manually sent.",
    tone: "progress",
  },
  FOLLOW_UP_DUE: {
    label: "Follow-up Due",
    description: "A manual follow-up reminder is ready.",
    tone: "warning",
  },
  REPLIED: { label: "Replied", description: "A reply has been received.", tone: "progress" },
  INTERESTED: {
    label: "Interested",
    description: "Influencer expressed interest and needs details or negotiation.",
    tone: "progress",
  },
  NEGOTIATING: {
    label: "Negotiating",
    description: "Fee, deliverables, schedule or conditions are under discussion.",
    tone: "progress",
  },
  CONFIRMED: {
    label: "Confirmed",
    description: "Influencer has been approved and accepted the campaign.",
    tone: "positive",
  },
  DECLINED: {
    label: "Declined",
    description: "Influencer declined the opportunity.",
    tone: "danger",
  },
  NO_RESPONSE: {
    label: "No Response",
    description: "No reply after the configured follow-up sequence.",
    tone: "neutral",
  },
  INVALID: {
    label: "Invalid Account",
    description: "Profile link is unavailable, incorrect or inactive.",
    tone: "danger",
  },
  DUPLICATE: {
    label: "Duplicate",
    description: "Another record already covers this creator in the campaign.",
    tone: "warning",
  },
  DO_NOT_CONTACT: {
    label: "Do Not Contact",
    description: "No future outreach is permitted without an administrator override.",
    tone: "danger",
  },
};

/** Statuses that mean the operator reached a conclusion for this record. */
export const COMPLETED_OUTCOME_STATUSES: OutreachStatusKey[] = [
  "SENT",
  "FOLLOW_UP_DUE",
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
  "DECLINED",
  "NO_RESPONSE",
  "INVALID",
  "DUPLICATE",
  "DO_NOT_CONTACT",
];

/** "Sent or later" — the denominator for reply and confirmation rates (§17). */
export const SENT_OR_LATER_STATUSES: OutreachStatusKey[] = [
  "SENT",
  "FOLLOW_UP_DUE",
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
  "DECLINED",
  "NO_RESPONSE",
];

/** A decline is still a reply, so it counts toward "replied or later" (§17). */
export const REPLIED_OR_LATER_STATUSES: OutreachStatusKey[] = [
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
  "DECLINED",
];

export const INTERESTED_OR_LATER_STATUSES: OutreachStatusKey[] = [
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
];

export const PIPELINE_LANES = [
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "CONFIRMED",
  "DECLINED",
  "NO_RESPONSE",
] as const;

export type PipelineLane = (typeof PIPELINE_LANES)[number];

/**
 * Allowed status transitions. Anything not listed is rejected server-side so
 * the pipeline cannot be driven into an inconsistent state (FR-002, AC-012).
 */
const TRANSITIONS: Record<OutreachStatusKey, OutreachStatusKey[]> = {
  NOT_CONTACTED: ["READY", "INVALID", "DUPLICATE", "DO_NOT_CONTACT"],
  READY: ["NOT_CONTACTED", "SENT", "INVALID", "DUPLICATE", "DO_NOT_CONTACT"],
  SENT: ["FOLLOW_UP_DUE", "REPLIED", "NO_RESPONSE", "INVALID", "DO_NOT_CONTACT"],
  FOLLOW_UP_DUE: ["SENT", "REPLIED", "NO_RESPONSE", "INVALID", "DO_NOT_CONTACT"],
  REPLIED: ["INTERESTED", "NEGOTIATING", "CONFIRMED", "DECLINED", "DO_NOT_CONTACT"],
  INTERESTED: ["NEGOTIATING", "CONFIRMED", "DECLINED", "REPLIED", "DO_NOT_CONTACT"],
  NEGOTIATING: ["CONFIRMED", "DECLINED", "INTERESTED", "DO_NOT_CONTACT"],
  CONFIRMED: ["NEGOTIATING", "DECLINED", "DO_NOT_CONTACT"],
  DECLINED: ["DO_NOT_CONTACT", "NEGOTIATING"],
  NO_RESPONSE: ["REPLIED", "DO_NOT_CONTACT"],
  INVALID: ["NOT_CONTACTED", "READY", "DO_NOT_CONTACT"],
  DUPLICATE: ["NOT_CONTACTED", "READY", "DO_NOT_CONTACT"],
  // Leaving Do Not Contact always requires an authorized override (FR-027).
  DO_NOT_CONTACT: ["NOT_CONTACTED", "READY"],
};

export function allowedTransitions(from: OutreachStatusKey): OutreachStatusKey[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: OutreachStatusKey, to: OutreachStatusKey): boolean {
  if (from === to) return true;
  return allowedTransitions(from).includes(to);
}

/** Leaving DO_NOT_CONTACT is only ever possible with an audited override. */
export function requiresDncOverride(
  from: OutreachStatusKey,
  to: OutreachStatusKey,
): boolean {
  return from === "DO_NOT_CONTACT" && to !== "DO_NOT_CONTACT";
}

/** Pipeline lane implied by an outreach status, used to keep the board in sync. */
export function pipelineLaneFor(status: OutreachStatusKey): PipelineLane | "NONE" {
  return (PIPELINE_LANES as readonly string[]).includes(status)
    ? (status as PipelineLane)
    : "NONE";
}

/** §10 — statuses that make a record eligible for the operator queue. */
export const QUEUE_ELIGIBLE_STATUSES: OutreachStatusKey[] = ["READY", "FOLLOW_UP_DUE"];

export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const CAMPAIGN_STATUS_META: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "positive" },
  PAUSED: { label: "Paused", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};
