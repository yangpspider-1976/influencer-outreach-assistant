import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { requestMetadata, type CurrentUser } from "./auth";

/**
 * FR-024 / AC-013 — audit trail.
 *
 * Every status change, DNC decision, assignment, export and permission change
 * must land here with actor, action, record, previous/new values, session
 * identifier and timestamp.
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILURE: "auth.login.failure",
  LOGOUT: "auth.logout",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DISABLE: "user.disable",
  USER_ENABLE: "user.enable",
  ROLE_UPDATE: "role.permissions.update",
  SETTING_UPDATE: "setting.update",
  CAMPAIGN_CREATE: "campaign.create",
  CAMPAIGN_UPDATE: "campaign.update",
  CAMPAIGN_ACTIVATE: "campaign.activate",
  CAMPAIGN_ARCHIVE: "campaign.archive",
  TEMPLATE_CREATE: "template.create",
  TEMPLATE_UPDATE: "template.update",
  TEMPLATE_VERSION_CREATE: "template.version.create",
  TEMPLATE_APPROVE: "template.approve",
  IMPORT_UPLOAD: "import.upload",
  IMPORT_MAPPING: "import.mapping",
  IMPORT_COMMIT: "import.commit",
  INFLUENCER_CREATE: "influencer.create",
  INFLUENCER_UPDATE: "influencer.update",
  INFLUENCER_MERGE: "influencer.merge",
  DISCOVERY_SEARCH: "influencer.discovery.search",
  DISCOVERY_SAVE: "influencer.discovery.save",
  DNC_SET: "influencer.dnc.set",
  DNC_CLEAR: "influencer.dnc.clear",
  DNC_OVERRIDE: "campaign_influencer.dnc.override",
  RECORD_ADD: "campaign_influencer.add",
  RECORD_ASSIGN: "campaign_influencer.assign",
  RECORD_STATUS_CHANGE: "campaign_influencer.status.change",
  RECORD_OUTCOME: "outreach.outcome",
  RECORD_SENT_EDIT: "outreach.sent_record.edit",
  FOLLOW_UP_CREATE: "follow_up.create",
  FOLLOW_UP_COMPLETE: "follow_up.complete",
  FOLLOW_UP_CANCEL: "follow_up.cancel",
  EXPORT_CREATE: "export.create",
  EXPORT_DOWNLOAD: "export.download",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

type AuditInput = {
  actor: Pick<CurrentUser, "id" | "email" | "sessionId"> | null;
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  campaignId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  /** Supplied when headers() is unavailable (e.g. background jobs). */
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Never persist raw credentials into the audit trail (§4 Observability). */
const REDACTED_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "passwordHash",
  "token",
  "secret",
]);

function scrub(values: Record<string, unknown> | null | undefined) {
  if (!values) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    output[key] = REDACTED_KEYS.has(key) ? "[redacted]" : value;
  }
  return output;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  let ipAddress = input.ipAddress ?? null;
  let userAgent = input.userAgent ?? null;
  if (ipAddress === null && userAgent === null) {
    try {
      const meta = await requestMetadata();
      ipAddress = meta.ipAddress;
      userAgent = meta.userAgent;
    } catch {
      // Outside a request scope — leave the request metadata empty.
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      campaignId: input.campaignId ?? null,
      oldValues: (scrub(input.oldValues) ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (scrub(input.newValues) ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress,
      userAgent: userAgent?.slice(0, 500) ?? null,
      sessionId: input.actor?.sessionId ?? null,
    },
  });
}

/** Produces a compact `{ field: { from, to } }` diff for audit payloads. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { old: Record<string, unknown>; next: Record<string, unknown> } | null {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key as keyof T];
    const normalize = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(normalize(previous)) !== JSON.stringify(normalize(value))) {
      oldValues[key] = normalize(previous) ?? null;
      newValues[key] = normalize(value) ?? null;
    }
  }
  return Object.keys(newValues).length > 0 ? { old: oldValues, next: newValues } : null;
}
