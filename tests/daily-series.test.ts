import { describe, expect, it } from "vitest";
import { buildDailySeries } from "@/lib/daily-series";

describe("buildDailySeries", () => {
  const today = new Date("2026-07-23T12:00:00.000Z");

  it("returns 14 UTC calendar-day buckets ending today", () => {
    const series = buildDailySeries([], today);

    expect(series).toHaveLength(14);
    expect(series[0]).toEqual({ date: "2026-07-10", sent: 0, completed: 0 });
    expect(series.at(-1)).toEqual({ date: "2026-07-23", sent: 0, completed: 0 });
  });

  it("counts sent attempts separately from all recorded outcomes", () => {
    const series = buildDailySeries(
      [
        { createdAt: new Date("2026-07-22T01:00:00.000Z"), outcome: "SENT" },
        { createdAt: new Date("2026-07-22T23:59:59.000Z"), outcome: "INVALID" },
        { createdAt: new Date("2026-07-23T08:00:00.000Z"), outcome: "SENT" },
      ],
      today,
    );

    expect(series.find((point) => point.date === "2026-07-22")).toEqual({
      date: "2026-07-22",
      sent: 1,
      completed: 2,
    });
    expect(series.find((point) => point.date === "2026-07-23")).toEqual({
      date: "2026-07-23",
      sent: 1,
      completed: 1,
    });
  });

  it("ignores attempts outside the trailing window", () => {
    const series = buildDailySeries(
      [
        { createdAt: new Date("2026-07-09T23:59:59.000Z"), outcome: "SENT" },
        { createdAt: new Date("2026-07-24T00:00:00.000Z"), outcome: "SENT" },
      ],
      today,
    );

    expect(series.every((point) => point.sent === 0 && point.completed === 0)).toBe(true);
  });
});
