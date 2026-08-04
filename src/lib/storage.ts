import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Private object storage (§4 File storage, SEC-008).
 *
 * Files are only ever streamed back through an authenticated route handler;
 * their storage key/URL is never exposed to the client. Two backends:
 *
 *   - Local filesystem (development / persistent-disk hosts). Keys are
 *     server-generated relative paths; traversal out of the root is refused.
 *   - Vercel Blob (serverless hosts, where the filesystem is read-only) when
 *     BLOB_READ_WRITE_TOKEN is set. The blob path carries a random suffix and
 *     the URL is kept server-side, so files are not discoverable in practice.
 *
 * The stored "key" is a relative path in filesystem mode and a full blob URL in
 * Blob mode; callers treat it as an opaque handle.
 */

const ROOT = path.resolve(process.cwd(), env.storageDir);
const useBlob = Boolean(env.blobReadWriteToken);

function isRemoteKey(key: string): boolean {
  return /^https?:\/\//i.test(key);
}

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

  if (useBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, data, {
      access: "public",
      token: env.blobReadWriteToken!,
      addRandomSuffix: true,
      contentType: contentTypeFor(originalName),
    });
    return blob.url;
  }

  const target = resolveKey(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  if (isRemoteKey(key)) {
    const response = await fetch(key, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Stored file could not be read (${response.status}).`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.readFile(resolveKey(key));
}

export async function deleteFile(key: string): Promise<void> {
  if (isRemoteKey(key)) {
    const { del } = await import("@vercel/blob");
    await del(key, { token: env.blobReadWriteToken! });
    return;
  }
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
