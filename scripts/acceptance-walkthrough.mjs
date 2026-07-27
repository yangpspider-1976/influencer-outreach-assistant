/**
 * End-to-end acceptance walkthrough (§20 AC-001 … AC-014).
 *
 * Drives the public HTTP API only — no database access, no internal imports —
 * as all four roles, and asserts both the happy paths and every negative
 * authorization case.
 *
 * Usage:
 *   docker compose up -d db
 *   npm run db:migrate && npm run db:seed
 *   npm run build && npm run start
 *   node scripts/acceptance-walkthrough.mjs
 *
 * Override the target with BASE=http://host:port.
 * Requires the demo seed data (prisma/seed.ts).
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = "QroadDemo!2026";

const results = [];
function check(id, label, condition, detail = "") {
  results.push({ id, label, pass: Boolean(condition), detail });
  const mark = condition ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}  ${label}${detail ? ` — ${detail}` : ""}`);
}

class Session {
  constructor() {
    this.cookie = "";
  }
  async request(path, init = {}) {
    const headers = { ...(init.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (init.body && !(init.body instanceof FormData)) {
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookie) {
      const [pair] = entry.split(";");
      if (pair.startsWith("qroad_session=")) this.cookie = pair;
    }
    const type = response.headers.get("content-type") ?? "";
    const body = type.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text();
    return { status: response.status, body, headers: response.headers };
  }
  get = (p) => this.request(p);
  post = (p, body) => this.request(p, { method: "POST", body: JSON.stringify(body ?? {}) });
  patch = (p, body) => this.request(p, { method: "PATCH", body: JSON.stringify(body ?? {}) });
  async login(email) {
    const result = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (result.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(result.body)}`);
    return result;
  }
}

const admin = new Session();
const manager = new Session();
const operator = new Session();
const viewer = new Session();

// ---------------------------------------------------------------------------

async function main() {
  // --- FR-001: unauthenticated access is refused --------------------------
  const anon = new Session();
  const anonCampaigns = await anon.get("/api/campaigns");
  check("FR-001", "Unauthenticated API access is refused", anonCampaigns.status === 401,
    `status ${anonCampaigns.status}`);

  const anonPage = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
  check("FR-001", "Unauthenticated page redirects to sign-in",
    anonPage.status === 307 && (anonPage.headers.get("location") ?? "").includes("/login"),
    `status ${anonPage.status}`);

  // --- Bad credentials -----------------------------------------------------
  const badLogin = await anon.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@qroad.test", password: "wrong-password" }),
  });
  check("SEC", "Wrong password is rejected", badLogin.status === 401, `status ${badLogin.status}`);

  await admin.login("admin@qroad.test");
  await manager.login("manager@qroad.test");
  await operator.login("operator1@qroad.test");
  await viewer.login("viewer@qroad.test");
  check("FR-001", "All four demo roles can sign in", true);

  // --- AC-001: create and activate a campaign ------------------------------
  const templates = await manager.get("/api/templates");
  const approvedTemplate = templates.body.templates.find(
    (t) => t.currentVersion?.status === "APPROVED",
  );

  const stamp = Date.now();
  const created = await manager.post("/api/campaigns", {
    name: `UAT Campaign ${stamp}`,
    clientName: `UAT Client ${stamp}`,
    location: "BGC, Taguig",
    visitStart: "2026-09-10",
    visitEnd: "2026-09-20",
    deliverables: "1 Reel + 3 Stories + location tag",
    deliverablesShort: "1 Reel + 3 Stories",
    compensation: "PHP 5,000 + complimentary meal for two",
    applicationDeadline: "2026-09-05",
    ownerId: null,
    templateId: approvedTemplate?.id ?? null,
    notes: "Created by the acceptance walkthrough.",
    followUpOffsetDays: [3, 7],
    briefLinkEnabled: false,
    targetCategory: "Food",
    targetLocation: "Metro Manila",
  });
  // ownerId must be a real user; fetch and retry properly.
  const users = await manager.get("/api/users");
  const managerUser = users.body.users.find((u) => u.email === "manager@qroad.test");
  const operatorUser = users.body.users.find((u) => u.email === "operator1@qroad.test");

  const campaignResult = created.status === 201 ? created : await manager.post("/api/campaigns", {
    name: `UAT Campaign ${stamp}`,
    clientName: `UAT Client ${stamp}`,
    location: "BGC, Taguig",
    visitStart: "2026-09-10",
    visitEnd: "2026-09-20",
    deliverables: "1 Reel + 3 Stories + location tag",
    deliverablesShort: "1 Reel + 3 Stories",
    compensation: "PHP 5,000 + complimentary meal for two",
    applicationDeadline: "2026-09-05",
    ownerId: managerUser.id,
    templateId: approvedTemplate?.id ?? null,
    notes: "Created by the acceptance walkthrough.",
    followUpOffsetDays: [3, 7],
    briefLinkEnabled: false,
    targetCategory: "Food",
    targetLocation: "Metro Manila",
  });

  check("AC-001", "Manager can create a campaign", campaignResult.status === 201,
    `status ${campaignResult.status}`);
  const campaignId = campaignResult.body.campaign.id;

  // end date before start date must be rejected
  const badDates = await manager.post("/api/campaigns", {
    name: `UAT Bad Dates ${stamp}`,
    clientName: `UAT Client ${stamp}`,
    location: "Makati",
    visitStart: "2026-09-20",
    visitEnd: "2026-09-10",
    deliverables: "1 Reel",
    compensation: "PHP 1,000",
    ownerId: managerUser.id,
  });
  check("FR-003", "Visit end before start is rejected", badDates.status === 422,
    `status ${badDates.status}`);

  const activated = await manager.post(`/api/campaigns/${campaignId}/activate`, { status: "ACTIVE" });
  check("AC-001", "Manager can activate a valid campaign", activated.status === 200,
    `status ${activated.status}`);

  // A campaign without a template must not activate.
  const noTemplate = await manager.post("/api/campaigns", {
    name: `UAT No Template ${stamp}`,
    clientName: `UAT Client ${stamp}`,
    location: "Makati",
    visitStart: "2026-09-10",
    visitEnd: "2026-09-20",
    deliverables: "1 Reel",
    compensation: "PHP 1,000",
    ownerId: managerUser.id,
    templateId: null,
  });
  const blockedActivate = await manager.post(
    `/api/campaigns/${noTemplate.body.campaign.id}/activate`,
    { status: "ACTIVE" },
  );
  check("AC-001", "Campaign without an approved template cannot activate",
    blockedActivate.status === 422 && blockedActivate.body.code === "NOT_READY",
    blockedActivate.body?.details?.blockers?.[0] ?? "");

  // --- AC-002: import with row-level validation ----------------------------
  const csv = [
    "influencer_name,first_name,instagram_url,facebook_url,preferred_channel,category,location,followers,email,expected_rate,notes,tags",
    `UAT Creator One,UAT,https://www.instagram.com/uatcreator${stamp}/,,Instagram,Food,Metro Manila,85000,one${stamp}@creators.test,PHP 5000,Great reels,food;bgc`,
    `UAT Creator Two,UAT,https://www.instagram.com/uatcreator2${stamp}/,https://facebook.com/uatcreator2${stamp},Instagram,Lifestyle,Makati,"1.2M",two${stamp}@creators.test,,,lifestyle`,
    `UAT Duplicate,UAT,https://www.instagram.com/uatcreator${stamp}/,,Instagram,Food,Metro Manila,85000,,,duplicate row,`,
    `UAT Bad Domain,UAT,https://tiktok.com/@nope,,Instagram,Food,Cebu,1000,,,unsupported,`,
    `,,,,,,,,,,,`,
    `UAT Email Only,UAT,,,,Food,Manila,5000,emailonly${stamp}@creators.test,,no socials,`,
    `UAT Range Followers,UAT,https://www.instagram.com/uatrange${stamp}/,,Instagram,Travel,Cebu,50k-80k,,,ambiguous followers,`,
  ].join("\n");

  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "uat-influencers.csv");
  form.append("campaignId", campaignId);
  const upload = await manager.request("/api/imports", { method: "POST", body: form });
  check("FR-007", "CSV upload is accepted", upload.status === 201, `status ${upload.status}`);
  const importId = upload.body.import.id;
  check("FR-008", "Column mapping is auto-suggested from headers",
    upload.body.import.mapping.instagram_url === "instagram_url");

  const validated = await manager.post(`/api/imports/${importId}/mapping`, {
    mapping: upload.body.import.mapping,
    sheetName: null,
  });
  const rows = validated.body.rows;
  const byName = (name) => rows.find((r) => r.normalizedData.displayName === name);

  check("AC-002", "Validation returns a classification for every row",
    validated.status === 200 && rows.length === 6, `${rows.length} rows`);
  check("FR-009", "Empty row is rejected",
    !rows.some((r) => r.normalizedData.displayName === "" && r.status !== "REJECTED"));
  check("FR-009", "Unsupported domain row is rejected",
    byName("UAT Bad Domain")?.status === "REJECTED");
  check("FR-011", "In-file duplicate is a warning and pre-deselected",
    byName("UAT Duplicate")?.status === "WARNING" && byName("UAT Duplicate")?.selected === false);
  check("FR-010", "Follower suffix normalized when unambiguous",
    byName("UAT Creator Two")?.normalizedData.followerCountNumeric === 1_200_000);
  check("FR-010", "Ambiguous follower value kept raw only",
    byName("UAT Range Followers")?.normalizedData.followerCountNumeric === null &&
      byName("UAT Range Followers")?.normalizedData.followerCountRaw === "50k-80k");
  check("§8", "Email-only row warns and carries no social profile",
    byName("UAT Email Only")?.status === "WARNING" &&
      byName("UAT Email Only")?.normalizedData.profiles.length === 0);

  const errorFile = await manager.get(`/api/imports/${importId}/errors`);
  check("§8", "Validation error file can be downloaded before commit",
    errorFile.status === 200 && String(errorFile.body).includes("Message"));

  const selectable = rows.filter((r) => r.status !== "REJECTED").map((r) => r.id);
  const committed = await manager.post(`/api/imports/${importId}/commit`, { rowIds: selectable });
  check("AC-002", "Selected rows commit transactionally",
    committed.status === 200 && committed.body.imported === selectable.length,
    `imported ${committed.body?.imported}`);

  // --- AC-003: existing influencer is reused --------------------------------
  const form2 = new FormData();
  const csv2 = [
    "influencer_name,instagram_url,category",
    `UAT Creator One Renamed,https://instagram.com/UATCREATOR${stamp}?igshid=xyz,Food`,
  ].join("\n");
  form2.append("file", new Blob([csv2], { type: "text/csv" }), "uat-reimport.csv");
  form2.append("campaignId", campaignId);
  const upload2 = await manager.request("/api/imports", { method: "POST", body: form2 });
  const validated2 = await manager.post(`/api/imports/${upload2.body.import.id}/mapping`, {
    mapping: upload2.body.import.mapping,
    sheetName: null,
  });
  const reimportRow = validated2.body.rows[0];
  check("AC-003", "A differently-formatted URL matches the existing influencer",
    reimportRow.issues.some((i) => i.code === "LINKED_EXISTING"),
    reimportRow.issues.map((i) => i.code).join(","));
  check("AC-003", "Creator already in the campaign is flagged, not re-added",
    reimportRow.issues.some((i) => i.code === "ALREADY_IN_CAMPAIGN"));

  // --- AC-004: DNC cannot enter the queue -----------------------------------
  const records = await manager.get(`/api/campaigns/${campaignId}/records?limit=200`);
  const audience = records.body.records;
  check("FR-013", "Creators with a profile joined the campaign audience", audience.length === 3,
    `${audience.length} records`);
  check("§8", "Email-only creator was stored but kept out of the campaign audience",
    !audience.some((r) => r.influencer.displayName === "UAT Email Only"));

  const dncTarget = audience[0];
  const setDnc = await manager.post(`/api/influencers/${dncTarget.influencer.id}/dnc`, {
    dnc: true,
    reason: "Creator asked not to be contacted during the acceptance run.",
  });
  check("FR-027", "Manager can set do-not-contact", setDnc.status === 200);

  const assignAll = await manager.post(`/api/campaigns/${campaignId}/assign`, {
    recordIds: audience.map((r) => r.id),
    assigneeId: operatorUser.id,
    markReady: true,
  });
  check("AC-004", "Bulk assignment refuses to queue the DNC record",
    assignAll.body.blockedByDnc?.length === 1,
    `blocked: ${JSON.stringify(assignAll.body.blockedByDnc)}`);

  const queue = await operator.get(`/api/outreach/queue?campaignId=${campaignId}`);
  check("AC-004", "DNC record is absent from the operator queue",
    !queue.body.records.some((r) => r.influencer.id === dncTarget.influencer.id),
    `${queue.body.total} queued`);

  const managerOverride = await manager.post(`/api/outreach/${dncTarget.id}/dnc-override`, {
    reason: "Attempting an override without administrator rights.",
  });
  check("AC-004", "Campaign manager cannot override do-not-contact",
    managerOverride.status === 403, `status ${managerOverride.status}`);

  const adminOverride = await admin.post(`/api/outreach/${dncTarget.id}/dnc-override`, {
    reason: "Creator confirmed by phone that they want this specific campaign.",
  });
  check("AC-004", "Administrator override is accepted and logged",
    adminOverride.status === 200, `status ${adminOverride.status}`);

  const shortReason = await admin.post(`/api/outreach/${audience[1].id}/dnc-override`, { reason: "no" });
  check("AC-004", "Override without a proper reason is rejected", shortReason.status === 422);

  // --- AC-005 / AC-006: workspace, copy and profile open --------------------
  const queue2 = await operator.get(`/api/outreach/queue?campaignId=${campaignId}`);
  const workRecordId = queue2.body.records.find((r) => r.influencer.id !== dncTarget.influencer.id).id;
  const workspace = await operator.get(`/api/outreach/${workRecordId}?lock=1`);
  check("AC-005", "Operator loads a full workspace payload",
    workspace.status === 200 &&
      workspace.body.campaign &&
      workspace.body.influencer.profiles.length > 0 &&
      typeof workspace.body.message.text === "string");
  check("FR-015", "Message renders with campaign values substituted",
    workspace.body.message.text.includes("UAT Client") &&
      workspace.body.message.text.includes("PHP 5,000 + complimentary meal for two"),
    workspace.body.message.text.split("\n")[0]);
  check("FR-015", "No unresolved required variables remain",
    workspace.body.message.unresolvedRequired.length === 0,
    JSON.stringify(workspace.body.message.unresolvedRequired));
  check("§16", "Workspace shows the operator responsibility disclaimer",
    typeof workspace.body.disclaimer === "string" && workspace.body.disclaimer.length > 10);

  const statusBefore = workspace.body.record.outreachStatus;
  await operator.post(`/api/outreach/${workRecordId}/copy-event`, { kind: "copy" });
  await operator.post(`/api/outreach/${workRecordId}/copy-event`, { kind: "profile_open" });
  const afterEvents = await operator.get(`/api/outreach/${workRecordId}`);
  check("AC-006", "Copying and opening a profile do not change the status",
    afterEvents.body.record.outreachStatus === statusBefore,
    `${statusBefore} -> ${afterEvents.body.record.outreachStatus}`);
  check("AC-006", "Copy and profile-open timestamps are recorded for analytics",
    afterEvents.body.record.lastCopiedAt && afterEvents.body.record.lastProfileOpenAt);

  // Mark Sent guards
  const noAffirm = await operator.post(`/api/outreach/${workRecordId}/outcome`, {
    outcome: "SENT",
    version: afterEvents.body.record.version,
    channel: "INSTAGRAM",
    confirmedText: afterEvents.body.message.text,
    preparedText: afterEvents.body.message.renderedText,
    manualSendAffirmed: false,
  });
  check("FR-019", "Mark Sent requires the manual-send confirmation",
    noAffirm.status === 422 && noAffirm.body.code === "MANUAL_SEND_NOT_AFFIRMED");

  const unresolved = await operator.post(`/api/outreach/${workRecordId}/outcome`, {
    outcome: "SENT",
    version: afterEvents.body.record.version,
    channel: "INSTAGRAM",
    confirmedText: `${afterEvents.body.message.text}\n\nPS {{unfilled_token}}`,
    preparedText: afterEvents.body.message.renderedText,
    manualSendAffirmed: true,
    unresolvedAcknowledged: false,
  });
  check("AC / §9", "Unresolved variables block Mark Sent without explicit confirmation",
    unresolved.status === 422 && unresolved.body.code === "UNRESOLVED_VARIABLES",
    JSON.stringify(unresolved.body.details ?? {}));

  // --- AC-007 / AC-008: Sent stores the exact text, next record loads -------
  const sentText = `${afterEvents.body.message.text}\n\nAdded a personal line for the acceptance run.`;
  const sent = await operator.post(`/api/outreach/${workRecordId}/outcome`, {
    outcome: "SENT",
    version: afterEvents.body.record.version,
    channel: "INSTAGRAM",
    confirmedText: sentText,
    preparedText: afterEvents.body.message.renderedText,
    manualSendAffirmed: true,
    note: "Sent manually during acceptance testing.",
  });
  check("AC-007", "Mark Sent succeeds with channel, text and confirmation",
    sent.status === 200 && sent.body.newStatus === "SENT", `status ${sent.status}`);
  check("AC-009", "Follow-up reminders are created on Sent",
    sent.body.followUpsCreated === 2, `${sent.body.followUpsCreated} created`);
  check("AC-008", "The next eligible record is returned after a saved outcome",
    typeof sent.body.nextRecordId === "string", sent.body.nextRecordId ?? "none");

  const sentRecord = await operator.get(`/api/outreach/${workRecordId}`);
  const sentAttempt = sentRecord.body.attempts.find((a) => a.outcome === "SENT");
  check("AC-007", "The exact confirmed text is stored",
    sentAttempt?.confirmedSentText === sentText);
  check("AC-007", "Channel, user and timestamp are stored",
    sentAttempt?.channel === "INSTAGRAM" &&
      sentAttempt?.createdBy === "Carlo Mendoza" &&
      Boolean(sentAttempt?.sentConfirmedAt));

  // --- Optimistic concurrency ----------------------------------------------
  const stale = await operator.post(`/api/outreach/${workRecordId}/outcome`, {
    outcome: "SKIPPED",
    version: afterEvents.body.record.version, // deliberately stale
    preparedText: "x",
    skipReasonId: sentRecord.body.skipReasons[0].id,
  });
  check("§10 / §18", "A stale optimistic-lock save is rejected",
    stale.status === 409 && stale.body.code === "STALE_RECORD", `status ${stale.status}`);

  // --- AC-009: follow-up lifecycle ------------------------------------------
  const followUps = await operator.get("/api/follow-ups?scope=all");
  const task = followUps.body.tasks.find((t) => t.record.id === workRecordId);
  check("AC-009", "Follow-up task is visible to the assigned operator", Boolean(task));
  const completed = await operator.patch(`/api/follow-ups/${task.id}`, { status: "COMPLETED" });
  check("AC-009", "Follow-up can be completed", completed.status === 200);

  const afterReply = await manager.patch(`/api/outreach/${workRecordId}/status`, {
    status: "REPLIED",
    note: "Creator replied asking for the brief.",
  });
  check("FR-021", "Manager can advance the pipeline to Replied", afterReply.status === 200);
  const followUpsAfterReply = await operator.get("/api/follow-ups?scope=all");
  check("AC-009", "A reply cancels the remaining follow-up reminders",
    !followUpsAfterReply.body.tasks.some((t) => t.record.id === workRecordId));

  const badTransition = await manager.patch(`/api/outreach/${workRecordId}/status`, {
    status: "READY",
  });
  check("FR-021", "An invalid status transition is rejected",
    badTransition.status === 409 && badTransition.body.code === "INVALID_TRANSITION");

  // --- AC-010: dashboard numbers ---------------------------------------------
  const report = await manager.get(`/api/reports/campaign/${campaignId}`);
  const m = report.body.metrics;
  const counts = report.body.statusCounts;
  const sentOrLater =
    (counts.SENT ?? 0) + (counts.FOLLOW_UP_DUE ?? 0) + (counts.REPLIED ?? 0) +
    (counts.INTERESTED ?? 0) + (counts.NEGOTIATING ?? 0) + (counts.CONFIRMED ?? 0) +
    (counts.DECLINED ?? 0) + (counts.NO_RESPONSE ?? 0);
  check("AC-010", "Report sent-or-later matches an independent count of the status groups",
    m.sentOrLater === sentOrLater, `${m.sentOrLater} vs ${sentOrLater}`);
  const expectedReplyRate = sentOrLater
    ? Math.round(((counts.REPLIED ?? 0) + (counts.INTERESTED ?? 0) + (counts.NEGOTIATING ?? 0) +
        (counts.CONFIRMED ?? 0) + (counts.DECLINED ?? 0)) / sentOrLater * 1000) / 10
    : 0;
  check("AC-010", "Reply rate matches the §17 formula",
    m.replyRate === expectedReplyRate, `${m.replyRate} vs ${expectedReplyRate}`);

  // --- AC-011: export with formula-injection protection ----------------------
  await manager.patch(`/api/influencers/${audience[1].influencer.id}`, {
    notes: "=HYPERLINK(\"http://evil.test\",\"click\")",
  });
  const exported = await manager.post("/api/exports", {
    entity: "campaign_records",
    format: "CSV",
    filters: { campaignId },
  });
  check("AC-011", "Export job completes", exported.status === 201 &&
    exported.body.job.status === "COMPLETED", `status ${exported.body?.job?.status}`);
  const download = await manager.get(`/api/exports/${exported.body.job.id}/download`);
  const csvOut = String(download.body);
  check("AC-011", "Export contains the filtered campaign records",
    csvOut.includes("UAT Creator One") && csvOut.includes("UAT Campaign"));
  const cells = csvOut.split(String.fromCharCode(10)).flatMap((line) => line.split(","));
  check("AC-011", "Formula payload is neutralized in the export",
    csvOut.includes("HYPERLINK") && !cells.some((cell) => /^"?=/.test(cell)),
    csvOut.includes("HYPERLINK") ? "payload present and prefixed" : "payload missing from export");

  // --- AC-012: negative authorization ---------------------------------------
  const opCreate = await operator.post("/api/campaigns", {
    name: "Operator should not create this",
    clientName: "Nope",
    location: "X",
    visitStart: "2026-09-10",
    visitEnd: "2026-09-20",
    deliverables: "x",
    compensation: "x",
    ownerId: operatorUser.id,
  });
  check("AC-012", "Operator cannot create a campaign", opCreate.status === 403,
    `status ${opCreate.status}`);

  const opAssign = await operator.post(`/api/campaigns/${campaignId}/assign`, {
    recordIds: [audience[2].id],
    assigneeId: operatorUser.id,
  });
  check("AC-012", "Operator cannot assign queue records", opAssign.status === 403);

  const opUsers = await operator.get("/api/users");
  check("AC-012", "Operator cannot list users", opUsers.status === 403);

  const opExport = await operator.post("/api/exports", {
    entity: "campaign_records", format: "CSV", filters: { campaignId },
  });
  check("AC-012", "Operator cannot export data", opExport.status === 403);

  const viewerCreate = await viewer.post("/api/campaigns", {
    name: "Viewer should not create this",
    clientName: "Nope",
    location: "X",
    visitStart: "2026-09-10",
    visitEnd: "2026-09-20",
    deliverables: "x",
    compensation: "x",
    ownerId: managerUser.id,
  });
  check("AC-012", "Viewer cannot create a campaign", viewerCreate.status === 403);

  const viewerOutreach = await viewer.get(`/api/outreach/${workRecordId}`);
  check("AC-012", "Viewer cannot open the outreach workspace", viewerOutreach.status === 403);

  const viewerAudit = await viewer.get("/api/audit-logs");
  check("AC-012", "Viewer cannot read the audit log", viewerAudit.status === 403);

  const managerUserAdmin = await manager.patch(`/api/users/${operatorUser.id}`, { roleKey: "ADMIN" });
  check("AC-012", "Campaign manager cannot escalate a user's role",
    managerUserAdmin.status === 403, `status ${managerUserAdmin.status}`);

  // Operator may not process a record assigned to someone else.
  const otherCampaignRecords = await manager.get("/api/campaigns");
  const seededCampaign = otherCampaignRecords.body.campaigns.find((c) => c.id === "seed-campaign-abc");
  if (seededCampaign) {
    const seededRecords = await manager.get(`/api/campaigns/${seededCampaign.id}/records?limit=200`);
    const foreign = seededRecords.body.records.find(
      (r) => r.assignee && r.assignee.id !== operatorUser.id,
    );
    if (foreign) {
      const foreignAccess = await operator.get(`/api/outreach/${foreign.id}`);
      check("AC-012", "Operator cannot open a record assigned to another operator",
        foreignAccess.status === 403, `status ${foreignAccess.status}`);
    }
  }

  // --- AC-013: audit trail ---------------------------------------------------
  const audit = await admin.get("/api/audit-logs?limit=500");
  const actions = new Set(audit.body.logs.map((l) => l.action));
  const required = [
    "auth.login.success",
    "auth.login.failure",
    "campaign.create",
    "campaign.activate",
    "import.upload",
    "import.commit",
    "campaign_influencer.assign",
    "campaign_influencer.status.change",
    "campaign_influencer.dnc.override",
    "influencer.dnc.set",
    "outreach.outcome",
    "follow_up.complete",
    "export.create",
    "export.download",
  ];
  const missing = required.filter((action) => !actions.has(action));
  check("AC-013", "Audit log records every material action", missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : `${actions.size} distinct actions`);

  const statusChange = audit.body.logs.find((l) => l.action === "campaign_influencer.status.change");
  check("AC-013", "Status change records the previous and new value",
    statusChange?.oldValues?.outreachStatus && statusChange?.newValues?.outreachStatus,
    `${statusChange?.oldValues?.outreachStatus} -> ${statusChange?.newValues?.outreachStatus}`);
  check("AC-013", "Audit entries carry the actor and session identifier",
    Boolean(statusChange?.actorEmail) && Boolean(statusChange?.sessionId));

  const opAudit = await operator.get("/api/audit-logs?limit=200");
  check("AC-013", "Operator's audit view is limited to their own actions",
    opAudit.status === 200 &&
      opAudit.body.logs.every((l) => l.actorEmail === "operator1@qroad.test"),
    `${opAudit.body?.logs?.length} entries`);

  // --- SEC-011: disabling a user invalidates the live session ---------------
  const throwaway = await admin.post("/api/users", {
    name: "UAT Temp Operator",
    email: `uat.temp.${stamp}@qroad.test`,
    roleKey: "OPERATOR",
    password: "TemporaryPassword123",
  });
  const temp = new Session();
  await temp.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: `uat.temp.${stamp}@qroad.test`, password: "TemporaryPassword123" }),
  });
  const beforeDisable = await temp.get("/api/outreach/queue");
  await admin.patch(`/api/users/${throwaway.body.user.id}`, { status: "DISABLED" });
  const afterDisable = await temp.get("/api/outreach/queue");
  check("SEC-011", "Disabling an account invalidates its live session immediately",
    beforeDisable.status === 200 && afterDisable.status === 401,
    `${beforeDisable.status} -> ${afterDisable.status}`);

  // --- SEC-005: upload guards ------------------------------------------------
  const badForm = new FormData();
  badForm.append("file", new Blob(["<?php echo 1; ?>"], { type: "text/plain" }), "payload.php");
  const badUpload = await manager.request("/api/imports", { method: "POST", body: badForm });
  check("SEC-005", "Unsupported upload type is rejected",
    badUpload.status === 415, `status ${badUpload.status}`);

  // --- Logout ----------------------------------------------------------------
  await operator.post("/api/auth/logout");
  const afterLogout = await operator.get("/api/outreach/queue");
  check("FR-001", "Session ends on sign-out", afterLogout.status === 401);

  // --- Summary ---------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  ${f.id}  ${f.label} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
