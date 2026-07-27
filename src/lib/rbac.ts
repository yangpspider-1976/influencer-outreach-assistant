/**
 * §5 Permission Matrix / FR-002.
 *
 * Permission sets live in the `roles` table so an administrator can adjust the
 * entries the work order marks "Optional" without a code change. This module
 * holds the seed defaults plus the pure evaluation helpers used by every
 * server-side authorization check — UI hiding is never the control.
 */

export const ROLE_KEYS = ["ADMIN", "CAMPAIGN_MANAGER", "OPERATOR", "VIEWER"] as const;
export type RoleKeyName = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = [
  "manage_users",
  "manage_settings",
  "campaigns_view",
  "campaigns_write",
  "templates_write",
  "templates_approve",
  "influencers_view",
  "influencers_write",
  "influencers_import",
  "influencers_dnc",
  "dnc_override",
  "queue_assign",
  "outreach_process",
  "outreach_edit_sent",
  "pipeline_update",
  "reports_view",
  "export_data",
  "audit_view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Scope ladder. `all` > `campaign` > `assigned` > `own` > `none`.
 * - `campaign`  — limited to campaigns the user owns or is assigned within.
 * - `assigned`  — limited to individual records assigned to the user.
 * - `own`       — limited to rows the user personally created.
 */
export const SCOPES = ["none", "own", "assigned", "campaign", "all"] as const;
export type Scope = (typeof SCOPES)[number];

export type PermissionSet = Record<Permission, Scope>;

function build(entries: Partial<Record<Permission, Scope>>): PermissionSet {
  const base = Object.fromEntries(PERMISSIONS.map((p) => [p, "none"])) as PermissionSet;
  return { ...base, ...entries };
}

export const DEFAULT_PERMISSION_SETS: Record<RoleKeyName, PermissionSet> = {
  ADMIN: build(Object.fromEntries(PERMISSIONS.map((p) => [p, "all"]))),

  CAMPAIGN_MANAGER: build({
    campaigns_view: "all",
    campaigns_write: "all",
    templates_write: "all",
    templates_approve: "all",
    influencers_view: "all",
    influencers_write: "all",
    influencers_import: "all",
    influencers_dnc: "all",
    queue_assign: "all",
    outreach_process: "all",
    // "Controlled": a manager may correct a sent record inside their campaigns.
    outreach_edit_sent: "campaign",
    pipeline_update: "all",
    reports_view: "all",
    export_data: "all",
    // "Campaign only" per §5.
    audit_view: "campaign",
  }),

  OPERATOR: build({
    campaigns_view: "assigned",
    influencers_view: "assigned",
    // §5 marks operator import as Optional; disabled by default.
    influencers_import: "none",
    influencers_dnc: "assigned",
    outreach_process: "assigned",
    pipeline_update: "assigned",
    reports_view: "own",
    audit_view: "own",
  }),

  VIEWER: build({
    campaigns_view: "all",
    influencers_view: "all",
    reports_view: "all",
    // §5 marks viewer export as Optional; disabled by default.
    export_data: "none",
  }),
};

export const ROLE_LABELS: Record<RoleKeyName, string> = {
  ADMIN: "Administrator",
  CAMPAIGN_MANAGER: "Campaign Manager",
  OPERATOR: "Outreach Operator",
  VIEWER: "Viewer / Client Service",
};

export const ROLE_DESCRIPTIONS: Record<RoleKeyName, string> = {
  ADMIN: "Manage organization settings, users, roles, templates and data retention.",
  CAMPAIGN_MANAGER:
    "Create campaigns, approve messaging, assign operators, monitor results and manage negotiations.",
  OPERATOR: "Review each profile and message, send manually and record the outcome.",
  VIEWER: "Review progress and campaign results without changing records.",
};

export function parsePermissionSet(value: unknown): PermissionSet {
  const source = (value ?? {}) as Record<string, unknown>;
  const entries: Partial<Record<Permission, Scope>> = {};
  for (const permission of PERMISSIONS) {
    const raw = source[permission];
    if (typeof raw === "string" && (SCOPES as readonly string[]).includes(raw)) {
      entries[permission] = raw as Scope;
    } else if (raw === true) {
      entries[permission] = "all";
    }
  }
  return build(entries);
}

export function scopeOf(permissions: PermissionSet, permission: Permission): Scope {
  return permissions[permission] ?? "none";
}

export function canUseCreatorDiscovery(permissions: PermissionSet): boolean {
  return has(permissions, "influencers_view") && has(permissions, "influencers_import");
}

export function has(permissions: PermissionSet, permission: Permission): boolean {
  return scopeOf(permissions, permission) !== "none";
}

const SCOPE_RANK: Record<Scope, number> = {
  none: 0,
  own: 1,
  assigned: 2,
  campaign: 3,
  all: 4,
};

/** True when the granted scope is at least as broad as the one required. */
export function hasScope(
  permissions: PermissionSet,
  permission: Permission,
  minimum: Scope,
): boolean {
  return SCOPE_RANK[scopeOf(permissions, permission)] >= SCOPE_RANK[minimum];
}

export type AccessSubject = {
  userId: string;
  permissions: PermissionSet;
};

export type RecordContext = {
  campaignOwnerId?: string | null;
  assigneeId?: string | null;
  createdById?: string | null;
};

/**
 * Evaluates a permission against a specific record. Used by every route
 * handler that touches campaign-scoped data (SEC-004, AC-012).
 */
export function canAccessRecord(
  subject: AccessSubject,
  permission: Permission,
  context: RecordContext,
): boolean {
  const scope = scopeOf(subject.permissions, permission);
  switch (scope) {
    case "all":
      return true;
    case "campaign":
      return (
        context.campaignOwnerId === subject.userId ||
        context.assigneeId === subject.userId ||
        context.createdById === subject.userId
      );
    case "assigned":
      return context.assigneeId === subject.userId;
    case "own":
      return context.createdById === subject.userId;
    case "none":
    default:
      return false;
  }
}
