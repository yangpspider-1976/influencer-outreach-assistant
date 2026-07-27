import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyChart } from "@/components/daily-chart";

describe("DailyChart", () => {
  it("gives chart columns a height context for percentage-sized bars", () => {
    const html = renderToStaticMarkup(
      createElement(DailyChart, {
        data: [
          { date: "2026-07-22", sent: 0, completed: 0 },
          { date: "2026-07-23", sent: 3, completed: 5 },
        ],
      }),
    );

    expect(html).toContain("group relative flex h-full flex-1 flex-col justify-end");
    expect(html).toContain("height:100%");
    expect(html).toContain("2026-07-23: 3 sent, 5 outcomes");
  });
});
