import "server-only";
import Papa from "papaparse";
import { ApiError } from "./api";
import { env } from "./env";
import { sanitizeCell } from "./import-fields";

/**
 * §8 steps 1–3 — read the uploaded workbook, expose worksheet names and return
 * header + data rows for the selected sheet.
 *
 * SEC-005 — file type, size and row count are validated before parsing.
 */

export type ParsedSheet = {
  sheetName: string | null;
  availableSheets: string[];
  headers: string[];
  rows: Record<string, string>[];
};

const XLSX_EXTENSIONS = [".xlsx"];
const CSV_EXTENSIONS = [".csv", ".txt"];

export function assertAcceptableUpload(fileName: string, sizeBytes: number): void {
  const lower = fileName.toLowerCase();
  const isXlsx = XLSX_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const isCsv = CSV_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!isXlsx && !isCsv) {
    throw new ApiError(
      415,
      "Only .xlsx and .csv influencer lists are accepted.",
      "UNSUPPORTED_FILE_TYPE",
    );
  }
  if (sizeBytes <= 0) {
    throw new ApiError(400, "The uploaded file is empty.", "EMPTY_FILE");
  }
  if (sizeBytes > env.maxUploadBytes) {
    throw new ApiError(
      413,
      `The file exceeds the ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB upload limit.`,
      "FILE_TOO_LARGE",
    );
  }
}

export function isXlsx(fileName: string): boolean {
  return XLSX_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));
}

export async function listSheets(fileName: string, data: Buffer): Promise<string[]> {
  if (!isXlsx(fileName)) return [];
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toArrayBuffer(data));
  return workbook.worksheets.map((sheet) => sheet.name);
}

export async function parseUpload(
  fileName: string,
  data: Buffer,
  sheetName?: string | null,
): Promise<ParsedSheet> {
  return isXlsx(fileName) ? parseXlsx(data, sheetName) : parseCsv(data);
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = sanitizeCell(header) || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

async function parseXlsx(data: Buffer, sheetName?: string | null): Promise<ParsedSheet> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toArrayBuffer(data));
  } catch {
    throw new ApiError(400, "The workbook could not be read.", "UNREADABLE_FILE");
  }

  const availableSheets = workbook.worksheets.map((sheet) => sheet.name);
  if (availableSheets.length === 0) {
    throw new ApiError(400, "The workbook contains no worksheets.", "NO_WORKSHEET");
  }

  // §8 — read only the selected worksheet.
  const target = sheetName
    ? workbook.worksheets.find((sheet) => sheet.name === sheetName)
    : workbook.worksheets[0];
  if (!target) {
    throw new ApiError(400, `Worksheet "${sheetName}" was not found.`, "SHEET_NOT_FOUND");
  }

  const matrix: string[][] = [];
  target.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellToString(cell.value);
    });
    matrix.push(values);
  });

  if (matrix.length === 0) {
    throw new ApiError(400, "The selected worksheet is empty.", "EMPTY_SHEET");
  }

  const headers = dedupeHeaders(matrix[0].map((value) => value ?? ""));
  const rows = matrix.slice(1).map((values) => rowFrom(headers, values));

  assertRowLimit(rows.length);
  return { sheetName: target.name, availableSheets, headers, rows: dropEmpty(rows) };
}

function parseCsv(data: Buffer): ParsedSheet {
  const text = data.toString("utf8").replace(/^﻿/, "");
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (result.data.length === 0) {
    throw new ApiError(400, "The CSV file contains no rows.", "EMPTY_FILE");
  }
  const headers = dedupeHeaders(result.data[0].map((value) => String(value ?? "")));
  const rows = result.data.slice(1).map((values) => rowFrom(headers, values));
  assertRowLimit(rows.length);
  return { sheetName: null, availableSheets: [], headers, rows: dropEmpty(rows) };
}

function assertRowLimit(count: number): void {
  if (count > env.maxImportRows) {
    throw new ApiError(
      413,
      `The file contains ${count} rows, above the ${env.maxImportRows} row import limit.`,
      "TOO_MANY_ROWS",
    );
  }
}

function rowFrom(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = sanitizeCell(values[index] ?? "");
  });
  return row;
}

function dropEmpty(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.filter((row) => Object.values(row).some((value) => value !== ""));
}

type ExcelCellValue = unknown;

function cellToString(value: ExcelCellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Hyperlink cells: prefer the target so profile links survive the import.
    if (typeof record.hyperlink === "string") return record.hyperlink;
    if (typeof record.text === "string") return record.text;
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => String((part as { text: string }).text ?? "")).join("");
    }
    if ("result" in record) return cellToString(record.result);
    if ("error" in record) return "";
  }
  return String(value);
}
