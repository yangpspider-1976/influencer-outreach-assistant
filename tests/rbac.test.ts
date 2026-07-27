import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSION_SETS,
  PERMISSIONS,
  canAccessRecord,
  canUseCreatorDiscovery,
  has,
  hasScope,
  parsePermissionSet,
} from "@/lib/rbac";

/** §5 Permission Matrix / FR-002 / AC-012 — negative authorization tests. */
describe("default permission matrix", () => {
  it("gives the administrator everything", () => {
    for (const permission of PERMISSIONS) {
      expect(DEFAULT_PERMISSION_SETS.ADMIN[permission]).toBe("all");
    }
  });

  it("stops a campaign manager managing users", () => {
    expect(has(DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER, "manage_users")).toBe(false);
    expect(has(DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER, "manage_settings")).toBe(false);
    expect(has(DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER, "dnc_override")).toBe(false);
  });

  it("limits a campaign manager's audit view to their campaigns", () => {
    expect(DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER.audit_view).toBe("campaign");
    expect(hasScope(DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER, "audit_view", "all")).toBe(false);
  });

  it("stops an operator creating or assigning campaigns", () => {
    const operator = DEFAULT_PERMISSION_SETS.OPERATOR;
    expect(has(operator, "campaigns_write")).toBe(false);
    expect(has(operator, "queue_assign")).toBe(false);
    expect(has(operator, "templates_approve")).toBe(false);
    expect(has(operator, "export_data")).toBe(false);
    expect(has(operator, "outreach_edit_sent")).toBe(false);
  });

  it("keeps the optional operator import off by default", () => {
    expect(DEFAULT_PERMISSION_SETS.OPERATOR.influencers_import).toBe("none");
  });

  it("limits creator discovery to roles that can import influencers", () => {
    expect(canUseCreatorDiscovery(DEFAULT_PERMISSION_SETS.OPERATOR)).toBe(false);
    expect(canUseCreatorDiscovery(DEFAULT_PERMISSION_SETS.ADMIN)).toBe(true);
    expect(canUseCreatorDiscovery(DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER)).toBe(true);
    expect(canUseCreatorDiscovery(DEFAULT_PERMISSION_SETS.VIEWER)).toBe(false);
    expect(DEFAULT_PERMISSION_SETS.OPERATOR.influencers_import).toBe("none");
  });

  it("keeps the viewer strictly read-only", () => {
    const viewer = DEFAULT_PERMISSION_SETS.VIEWER;
    expect(has(viewer, "campaigns_view")).toBe(true);
    expect(has(viewer, "reports_view")).toBe(true);
    expect(has(viewer, "campaigns_write")).toBe(false);
    expect(has(viewer, "outreach_process")).toBe(false);
    expect(has(viewer, "pipeline_update")).toBe(false);
    expect(has(viewer, "influencers_dnc")).toBe(false);
    // "Optional" per §5; disabled until an administrator grants it.
    expect(has(viewer, "export_data")).toBe(false);
  });
});

describe("scope ladder", () => {
  it("orders none < own < assigned < campaign < all", () => {
    const operator = DEFAULT_PERMISSION_SETS.OPERATOR;
    expect(hasScope(operator, "outreach_process", "assigned")).toBe(true);
    expect(hasScope(operator, "outreach_process", "campaign")).toBe(false);
    expect(hasScope(operator, "outreach_process", "all")).toBe(false);
  });
});

describe("canAccessRecord", () => {
  const operator = { userId: "user-op", permissions: DEFAULT_PERMISSION_SETS.OPERATOR };
  const manager = { userId: "user-mgr", permissions: DEFAULT_PERMISSION_SETS.CAMPAIGN_MANAGER };

  it("lets an operator work only their assigned records", () => {
    expect(canAccessRecord(operator, "outreach_process", { assigneeId: "user-op" })).toBe(true);
    expect(canAccessRecord(operator, "outreach_process", { assigneeId: "user-other" })).toBe(false);
    expect(canAccessRecord(operator, "outreach_process", { assigneeId: null })).toBe(false);
  });

  it("lets a manager work any record in scope", () => {
    expect(canAccessRecord(manager, "outreach_process", { assigneeId: "user-other" })).toBe(true);
  });

  it("limits a manager's sent-record edits to their own campaigns", () => {
    expect(
      canAccessRecord(manager, "outreach_edit_sent", { campaignOwnerId: "user-mgr" }),
    ).toBe(true);
    expect(
      canAccessRecord(manager, "outreach_edit_sent", { campaignOwnerId: "someone-else" }),
    ).toBe(false);
  });

  it("denies an operator any sent-record edit", () => {
    expect(canAccessRecord(operator, "outreach_edit_sent", { assigneeId: "user-op" })).toBe(false);
  });
});

describe("parsePermissionSet", () => {
  it("defaults unknown or missing entries to none", () => {
    const parsed = parsePermissionSet({ campaigns_view: "all", bogus: "all" });
    expect(parsed.campaigns_view).toBe("all");
    expect(parsed.manage_users).toBe("none");
    expect("bogus" in parsed).toBe(false);
  });

  it("rejects an invalid scope value rather than trusting it", () => {
    expect(parsePermissionSet({ manage_users: "superuser" }).manage_users).toBe("none");
  });

  it("accepts a legacy boolean grant as full scope", () => {
    expect(parsePermissionSet({ manage_users: true }).manage_users).toBe("all");
  });

  it("treats a null permission set as no access at all", () => {
    const parsed = parsePermissionSet(null);
    for (const permission of PERMISSIONS) expect(parsed[permission]).toBe("none");
  });
});
