/**
 * Export generation with spreadsheet formula-injection protection
 * (SEC-005 / AC-011). Pure module — unit tested directly.
 */

/** Characters that make Excel / Sheets / LibreOffice treat a cell as a formula. */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r", "\n"];

/**
 * Neutralizes a value so no spreadsheet application will evaluate it.
 * A leading apostrophe forces text interpretation without losing the content.
 */
export function escapeSpreadsheetValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);

  // Strip control characters that can break parsers or hide payloads.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  const first = text.charAt(0);
  if (first && FORMULA_TRIGGERS.includes(first)) {
    return `'${text}`;
  }
  return text;
}

function csvCell(value: unknown): string {
  const safe = escapeSpreadsheetValue(value);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export type ExportColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => unknown;
  width?: number;
};

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  }
  // BOM so Excel opens UTF-8 exports correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  sheetName = "Export",
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QROAD Influencer Outreach Assistant";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Export");

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.min(Math.max(column.header.length + 4, 14), 60),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const record: Record<string, string> = {};
    for (const column of columns) {
      record[column.key] = escapeSpreadsheetValue(column.value(row));
    }
    sheet.addRow(record);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function exportFileName(prefix: string, format: "CSV" | "XLSX"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
  return `${safePrefix}_${stamp}.${format.toLowerCase()}`;
}
