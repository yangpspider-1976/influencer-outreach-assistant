import { describe, expect, it } from "vitest";
import { computeCampaignMetrics, formatDuration, rate } from "@/lib/metrics";

/**
 * §17 / AC-010 — the dashboard must match independently verified test data.
 * Every expectation below is calculated by hand from the fixture.
 */
const FIXTURE = {
  total: 60,
  assigned: 50,
  statusCounts: {
    NOT_CONTACTED: 10,
    READY: 8,
    SENT: 6,
    FOLLOW_UP_DUE: 5,
    REPLIED: 4,
    INTERESTED: 5,
    NEGOTIATING: 4,
    CONFIRMED: 6,
    DECLINED: 3,
    NO_RESPONSE: 4,
    INVALID: 2,
    DUPLICATE: 1,
    DO_NOT_CONTACT: 2,
  },
  followUpsDue: 20,
  followUpsCompleted: 15,
  processingDurationsMs: [60_000, 120_000, 180_000],
};

describe("computeCampaignMetrics", () => {
  const metrics = computeCampaignMetrics(FIXTURE);

  it("counts completed outcomes as every conclusive status", () => {
    // 6+5+4+5+4+6+3+4+2+1+2 = 42
    expect(metrics.completed).toBe(42);
  });

  it("counts sent-or-later correctly", () => {
    // 6+5+4+5+4+6+3+4 = 37
    expect(metrics.sentOrLater).toBe(37);
  });

  it("treats a decline as a reply", () => {
    // 4+5+4+6+3 = 22
    expect(metrics.repliedOrLater).toBe(22);
  });

  it("computes outreach completion rate over assigned records", () => {
    // 42 / 50 = 84%
    expect(metrics.outreachCompletionRate).toBe(84);
  });

  it("computes reply rate over sent records", () => {
    // 22 / 37 = 59.459…% -> 59.5
    expect(metrics.replyRate).toBe(59.5);
  });

  it("computes interest rate over replies", () => {
    // (5+4+6) / 22 = 68.18…% -> 68.2
    expect(metrics.interestRate).toBe(68.2);
  });

  it("computes confirmation rate over sent records", () => {
    // 6 / 37 = 16.216…% -> 16.2
    expect(metrics.confirmationRate).toBe(16.2);
  });

  it("computes invalid rate over processed records", () => {
    // 2 / 42 = 4.76…% -> 4.8
    expect(metrics.invalidRate).toBe(4.8);
  });

  it("computes follow-up completion rate", () => {
    // 15 / 20 = 75%
    expect(metrics.followUpCompletionRate).toBe(75);
  });

  it("averages processing time", () => {
    expect(metrics.averageProcessingMs).toBe(120_000);
  });

  it("excludes abandoned sessions from the average", () => {
    const withAbandoned = computeCampaignMetrics({
      ...FIXTURE,
      processingDurationsMs: [60_000, 120_000, 180_000, 5 * 60 * 60 * 1000],
    });
    expect(withAbandoned.averageProcessingMs).toBe(120_000);
  });

  it("returns null when there is nothing to average", () => {
    const empty = computeCampaignMetrics({ ...FIXTURE, processingDurationsMs: [] });
    expect(empty.averageProcessingMs).toBeNull();
  });
});

describe("rate", () => {
  it("never divides by zero", () => {
    expect(rate(5, 0)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(2, 3)).toBe(66.7);
  });
});

describe("formatDuration", () => {
  it("renders seconds, minutes and hours", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(150_000)).toBe("2m 30s");
    expect(formatDuration(3_900_000)).toBe("1h 5m");
    expect(formatDuration(null)).toBe("—");
  });
});
