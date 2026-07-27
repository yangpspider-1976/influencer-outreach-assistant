import { describe, expect, it } from "vitest";
import {
  escapeSpreadsheetValue,
  exportFileName,
  toCsv,
  type ExportColumn,
} from "@/lib/spreadsheet";

/** SEC-005 / AC-011 — exports must be safe to open in a spreadsheet. */
describe("escapeSpreadsheetValue", () => {
  it("neutralizes every formula trigger character", () => {
    for (const payload of [
      "=1+1",
      "+1+1",
      "-1+1",
      "@SUM(A1)",
      '=HYPERLINK("http://evil.test","click")',
      "=cmd|'/c calc'!A1",
    ]) {
      const escaped = escapeSpreadsheetValue(payload);
      expect(escaped.startsWith("'")).toBe(true);
      // The original content is preserved, only prefixed.
      expect(escaped.slice(1)).toBe(payload);
    }
  });

  it("leaves ordinary values untouched", () => {
    expect(escapeSpreadsheetValue("Maria Santos")).toBe("Maria Santos");
    expect(escapeSpreadsheetValue("PHP 5,000")).toBe("PHP 5,000");
    expect(escapeSpreadsheetValue(85000)).toBe("85000");
  });

  it("renders empty for null and undefined", () => {
    expect(escapeSpreadsheetValue(null)).toBe("");
    expect(escapeSpreadsheetValue(undefined)).toBe("");
  });

  it("serializes dates as ISO strings", () => {
    expect(escapeSpreadsheetValue(new Date("2026-08-01T00:00:00.000Z"))).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("removes control characters that could hide a payload", () => {
    expect(escapeSpreadsheetValue("Mariacreator")).toBe("Mariacreator");
  });
});

type Row = { name: string; note: string };

const COLUMNS: ExportColumn<Row>[] = [
  { key: "name", header: "Name", value: (row) => row.name },
  { key: "note", header: "Note", value: (row) => row.note },
];

describe("toCsv", () => {
  it("writes a header row and one line per record", () => {
    const csv = toCsv([{ name: "Maria", note: "ok" }], COLUMNS);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Name,Note");
    expect(lines[1]).toBe("Maria,ok");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    const csv = toCsv(
      [{ name: 'Maria "MJ" Santos', note: "line one\nline two, with comma" }],
      COLUMNS,
    );
    expect(csv).toContain('"Maria ""MJ"" Santos"');
    expect(csv).toContain('"line one\nline two, with comma"');
  });

  it("escapes a formula payload inside a quoted cell", () => {
    const csv = toCsv([{ name: "=1+1,evil", note: "" }], COLUMNS);
    expect(csv).toContain(`"'=1+1,evil"`);
  });

  it("starts with a UTF-8 BOM so Excel reads it correctly", () => {
    expect(toCsv([], COLUMNS).startsWith("﻿")).toBe(true);
  });

  it("produces a header-only file for an empty result set", () => {
    const csv = toCsv([], COLUMNS).replace(/^﻿/, "");
    expect(csv.trim()).toBe("Name,Note");
  });
});

describe("exportFileName", () => {
  it("builds a safe, timestamped file name", () => {
    const name = exportFileName("campaign records / 2026", "XLSX");
    expect(name).toMatch(/^campaign_records_2026_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.xlsx$/);
  });

  it("strips path separators from the prefix", () => {
    expect(exportFileName("../../etc/passwd", "CSV")).not.toContain("/");
  });
});
