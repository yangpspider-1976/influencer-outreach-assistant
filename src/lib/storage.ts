import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Private object storage (§4 File storage, SEC-008).
 *
 * Files are written outside the public web root and are only ever streamed
 * back through an authenticated route handler. Keys are generated server-side,
 * so a caller can never traverse out of the storage root.
 */

const ROOT = path.resolve(process.cwd(), env.storageDir);

function resolveKey(key: string): string {
  const target = path.resolve(ROOT, key);
  const relative = path.relative(ROOT, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to access a path outside the storage root.");
  }
  return target;
}

export async function putFile(
  bucket: "imports" | "exports" | "briefs",
  originalName: string,
  data: Buffer,
): Promise<string> {
  const extension = path.extname(originalName).toLowerCase().slice(0, 10);
  const key = path.posix.join(bucket, `${randomUUID()}${extension}`);
  const target = resolveKey(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

export async function deleteFile(key: string): Promise<void> {
  await fs.rm(resolveKey(key), { force: true });
}

export function contentTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
