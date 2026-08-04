import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  get sessionSecret(): string {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters long.");
    }
    return secret;
  },
  storageDir: process.env.STORAGE_DIR || "./.storage",
  // When set (e.g. on Vercel), uploaded/exported files go to Vercel Blob instead
  // of the local filesystem, which is read-only on serverless hosts.
  blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN?.trim() || null,
  sessionIdleTimeoutMinutes: int("SESSION_IDLE_TIMEOUT_MINUTES", 60),
  maxUploadBytes: int("MAX_UPLOAD_MB", 10) * 1024 * 1024,
  maxImportRows: int("MAX_IMPORT_ROWS", 5000),
  exportSyncRowLimit: int("EXPORT_SYNC_ROW_LIMIT", 5000),
  // Creator discovery web-search providers. Any one enables automatic search;
  // DISCOVERY_PROVIDER ("auto" | "serper" | "google" | "brave" | "off") selects which.
  discoveryProvider: (process.env.DISCOVERY_PROVIDER || "auto").trim().toLowerCase(),
  serperApiKey: process.env.SERPER_API_KEY?.trim() || null,
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY?.trim() || null,
  googleCseApiKey: process.env.GOOGLE_CSE_API_KEY?.trim() || null,
  googleCseId: process.env.GOOGLE_CSE_ID?.trim() || null,
  discoverySearchCountry: (process.env.DISCOVERY_SEARCH_COUNTRY || "ph").trim().toLowerCase(),
  allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
};
