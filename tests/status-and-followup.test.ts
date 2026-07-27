import { describe, expect, it } from "vitest";
import {
  OUTREACH_STATUSES,
  QUEUE_ELIGIBLE_STATUSES,
  STATUS_META,
  allowedTransitions,
  canTransition,
  pipelineLaneFor,
  requiresDncOverride,
} from "@/lib/status";
import {
  MAX_FOLLOW_UPS,
  addDays,
  noResponseClosureAt,
  normalizeFollowUpOffsets,
  planFollowUps,
  shouldCancelFollowUps,
} from "@/lib/follow-up";

/** FR-021 — the full status model must exist and be self-consistent. */
describe("status model", () => {
  it("covers every status named in the work order", () => {
    expect([...OUTREACH_STATUSES].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("has presentation metadata for every status", () => {
    for (const status of OUTREACH_STATUSES) {
      expect(STATUS_META[status]?.label).toBeTruthy();
    }
  });

  it("only lets Ready and Follow-up Due enter the operator queue", () => {
    expect(QUEUE_ELIGIBLE_STATUSES).toEqual(["READY", "FOLLOW_UP_DUE"]);
  });
});

describe("status transitions", () => {
  it("allows the normal outreach path", () => {
    expect(canTransition("NOT_CONTACTED", "READY")).toBe(true);
    expect(canTransition("READY", "SENT")).toBe(true);
    expect(canTransition("SENT", "FOLLOW_UP_DUE")).toBe(true);
    expect(canTransition("SENT", "REPLIED")).toBe(true);
    expect(canTransition("REPLIED", "INTERESTED")).toBe(true);
    expect(canTransition("INTERESTED", "NEGOTIATING")).toBe(true);
    expect(canTransition("NEGOTIATING", "CONFIRMED")).toBe(true);
  });

  it("rejects skipping straight from Not Contacted to Sent", () => {
    expect(canTransition("NOT_CONTACTED", "SENT")).toBe(false);
  });

  it("rejects moving a confirmed record back to Ready", () => {
    expect(canTransition("CONFIRMED", "READY")).toBe(false);
  });

  it("treats a same-status write as a no-op, not an error", () => {
    expect(canTransition("SENT", "SENT")).toBe(true);
  });

  it("lets any status reach Do Not Contact", () => {
    for (const status of OUTREACH_STATUSES) {
      if (status === "DO_NOT_CONTACT") continue;
      expect(allowedTransitions(status)).toContain("DO_NOT_CONTACT");
    }
  });

  /** FR-027 / AC-004 */
  it("requires an override to leave Do Not Contact", () => {
    expect(requiresDncOverride("DO_NOT_CONTACT", "READY")).toBe(true);
    expect(requiresDncOverride("DO_NOT_CONTACT", "DO_NOT_CONTACT")).toBe(false);
    expect(requiresDncOverride("READY", "SENT")).toBe(false);
  });

  it("keeps the pipeline lane in sync with the outreach status", () => {
    expect(pipelineLaneFor("CONFIRMED")).toBe("CONFIRMED");
    expect(pipelineLaneFor("SENT")).toBe("NONE");
    expect(pipelineLaneFor("READY")).toBe("NONE");
  });
});

/** §13 / FR-022 / AC-009 */
describe("follow-up scheduling", () => {
  const sentAt = new Date("2026-08-01T09:00:00.000Z");

  it("schedules the default day 3 and day 7 reminders", () => {
    const plan = planFollowUps(sentAt, [3, 7]);
    expect(plan).toHaveLength(2);
    expect(plan[0].dueAt.toISOString().slice(0, 10)).toBe("2026-08-04");
    expect(plan[1].dueAt.toISOString().slice(0, 10)).toBe("2026-08-08");
    expect(plan.map((entry) => entry.sequence)).toEqual([1, 2]);
  });

  it("caps the schedule at two reminders", () => {
    expect(planFollowUps(sentAt, [1, 2, 3, 4])).toHaveLength(MAX_FOLLOW_UPS);
  });

  it("supports a campaign with no reminders", () => {
    expect(planFollowUps(sentAt, [])).toEqual([]);
    expect(planFollowUps(sentAt, null)).toEqual([]);
  });

  it("sorts, de-duplicates and drops invalid offsets", () => {
    expect(normalizeFollowUpOffsets([7, 3, 3, -1, 0, 999999])).toEqual([3, 7]);
  });

  it("cancels pending reminders on reply, decline and do-not-contact", () => {
    for (const status of ["REPLIED", "INTERESTED", "NEGOTIATING", "CONFIRMED", "DECLINED", "DO_NOT_CONTACT"]) {
      expect(shouldCancelFollowUps(status)).toBe(true);
    }
  });

  it("keeps reminders alive while a record is merely Sent", () => {
    expect(shouldCancelFollowUps("SENT")).toBe(false);
    expect(shouldCancelFollowUps("FOLLOW_UP_DUE")).toBe(false);
  });

  it("closes as No Response after the final window plus grace", () => {
    const closure = noResponseClosureAt(sentAt, [3, 7], 3);
    expect(closure.toISOString().slice(0, 10)).toBe("2026-08-11");
  });

  it("adds calendar days without mutating the source date", () => {
    const original = new Date("2026-08-01T09:00:00.000Z");
    const shifted = addDays(original, 5);
    expect(original.toISOString()).toBe("2026-08-01T09:00:00.000Z");
    expect(shifted.toISOString().slice(0, 10)).toBe("2026-08-06");
  });
});
