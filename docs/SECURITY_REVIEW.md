# Security and dependency review

Control-by-control review against §15 (Security and Privacy Requirements) and §16 (Platform Safety
Controls) of the Developer Work Order.

**Review date:** 22 July 2026 · **Scope:** MVP codebase at first delivery

---

## 1. Requirement compliance

### SEC-001 — TLS everywhere except isolated local development
**Implemented (deployment-dependent).** Session cookies are issued with `secure: true` whenever
`NODE_ENV=production`, so they will not transmit over plain HTTP in any deployed environment. TLS
termination itself is an infrastructure responsibility — see the deployment checklist in
`ADMIN_GUIDE.md`. The Clipboard API also requires a secure context, so serving production over HTTP
degrades the operator workflow, giving a second practical enforcement signal.

### SEC-002 — Argon2id password hashing
**Implemented.** `src/lib/auth.ts` uses `@node-rs/argon2` with Argon2id and OWASP-recommended
parameters (19 MiB memory, 2 iterations, parallelism 1). No plaintext or reversible password is ever
stored. Login compares against a dummy hash when the account does not exist, so response timing does
not reveal whether an email is registered.

### SEC-003 — Secure, HTTP-only, SameSite cookies
**Implemented.** The session is a signed JWT (HS256, `jose`) delivered in a cookie with
`httpOnly: true`, `sameSite: "lax"`, `secure` in production, `path: "/"`. The token carries only a
user id, session id and epoch — no roles or permissions, so privileges cannot be forged client-side
and are re-read from the database on every request.

### SEC-004 — Server-side RBAC and campaign authorization on every protected endpoint
**Implemented.** Two layers:

1. `src/proxy.ts` rejects unauthenticated API calls with `401` and redirects unauthenticated
   page requests to `/login`.
2. Every route handler independently calls `requireUser()` and then `requirePermission` /
   `assertCampaignAccess` / `canAccessRecord`. Permissions are re-read from the database per request.

UI hiding is never the control. Verified by negative tests — see §3.

### SEC-005 — Upload validation and export formula-injection protection
**Implemented.** Uploads are checked for extension (`.xlsx`, `.csv` only), size (`MAX_UPLOAD_MB`) and
row count (`MAX_IMPORT_ROWS`) *before* parsing. Only the selected worksheet is read.

Every exported cell passes through `escapeSpreadsheetValue`, which prefixes `=`, `+`, `-`, `@`, tab,
CR and LF with an apostrophe and strips control characters. This applies to CSV, XLSX and the import
validation error file. Covered by unit tests including `=cmd|'/c calc'!A1` and `=HYPERLINK(...)`
payloads, and re-verified end to end against a live export.

### SEC-006 — Sanitize displayed text, prevent stored XSS
**Implemented.** React escapes all interpolated content and the codebase contains no
`dangerouslySetInnerHTML`. Imported values additionally pass through `sanitizeCell`, which strips
control characters and zero-width/non-breaking spaces. A Content-Security-Policy with
`object-src 'none'`, `frame-ancestors 'none'` and `base-uri 'self'` is set in `next.config.ts`.

### SEC-007 — No Meta passwords, cookies, session data or browser profiles
**Implemented by construction.** No schema column, environment variable or code path stores or
requests Meta credentials. The application's only interaction with Meta is rendering a saved profile
URL as a normal link.

### SEC-008 — Private campaign briefs are never exposed unauthenticated
**Implemented.** Uploaded files and generated exports live under `STORAGE_DIR`, outside the web root
and outside `public/`. Storage keys are server-generated UUIDs and every path resolution is checked
against the storage root, so traversal out of it throws. Files are only ever streamed through
authenticated, permission-checked route handlers, and every download is audited.

### SEC-009 — Secrets in environment/secret management, never in source control
**Implemented.** `.env*` is git-ignored while `.env.example` is explicitly committed as a template
containing no real values. `SESSION_SECRET` is validated at startup (≥ 32 characters) and the app
refuses to start without it.

### SEC-010 — Audit administrative exports, DNC overrides, deletions and permission changes
**Implemented.** `src/lib/audit.ts` records actor, action, entity, entity id, campaign id, old/new
values, IP address, user agent and session id. Covered actions include export creation and download,
do-not-contact set/clear/override, permission and role changes, user create/disable/enable, setting
changes, campaign lifecycle, import commit, assignment and every status change. Credential-shaped
keys are redacted before writing.

The administrator-only demo reset (`POST /api/admin/reset-demo-data`) clears `audit_logs` as part of
the wipe, so its own `admin.demo_data.reset` entry is written immediately afterwards and becomes the
first record of the rebuilt history. The endpoint is gated on the Administrator role directly rather
than on a grantable permission, requires a typed confirmation phrase, and refuses to run when
`NODE_ENV=production` unless `ALLOW_DEMO_RESET=true` is set explicitly.

### SEC-011 — Configurable inactivity timeout and immediate invalidation on disable
**Implemented.** Session lifetime is `SESSION_IDLE_TIMEOUT_MINUTES` (default 60) as a rolling window
refreshed by the proxy once two-thirds elapsed. Disabling a user or changing their password
increments `users.sessionEpoch`; any token carrying a stale epoch is rejected on the very next
request. Verified end to end: an authenticated session returned `200`, then `401` immediately after
the account was disabled.

### SEC-012 — Backup, restore and tested migration procedures
**Documented and rehearsable.** See `BACKUP_RESTORE.md` for scripted backups, a full restore
procedure with a post-restore verification checklist, both migration test paths (fresh install and
upgrade from the previous state), failure handling, and RPO/RTO targets.

---

## 2. §16 Platform safety controls

| Blocked capability | Status |
| --- | --- |
| Selenium / Playwright / Puppeteer driving Meta | **Absent.** None are dependencies of the application. |
| Browser-extension DOM automation | **Absent.** No extension is shipped. |
| Clicking Message, typing text, clicking Send | **Absent.** No code touches a Meta DOM. |
| CAPTCHA solving, rate-limit evasion, hidden webviews | **Absent.** |
| Profile scraping / follower collection | **Absent.** Follower counts are imported from QROAD's own files and marked "supplied" throughout the UI. |
| Automatic Meta login or credential storage | **Absent.** |

| Required behaviour | Status |
| --- | --- |
| Normal external link to open a profile | **Implemented.** `window.open(url, "_blank", "noopener,noreferrer")` plus a plain anchor fallback when popups are blocked. |
| Clipboard API used only after a user gesture | **Implemented.** Copy runs from a click handler, with a selectable-text fallback when permission is denied. |
| Operator responsibility disclaimer displayed | **Implemented.** Shown in the workspace, sourced from the configurable `outreach.disclaimer` setting. |
| No fixed "safe daily DM limit" claimed | **Implemented.** No such figure exists in the product, copy or documentation. |

**Delivery is never inferred.** Opening a profile and copying a message record analytics timestamps
only and explicitly do not change status. A record becomes `SENT` solely because an operator
affirmed "I manually sent this message". The schema field is `sentConfirmedAt` — an operator
confirmation, never a platform delivery receipt.

---

## 3. Verification performed

**Unit tests — 112 passing.** Cover URL normalization and dedupe keys, template rendering and
unresolved-variable handling, status transitions, follow-up scheduling and cancellation, permission
matrix and scope evaluation, every §17 reporting formula, and spreadsheet formula-injection escaping.

**End-to-end acceptance walkthrough — 69/69 checks passing** against a running server driving the
HTTP API as all four roles. Security-relevant results:

| Test | Result |
| --- | --- |
| Unauthenticated API access | `401` |
| Unauthenticated page access | Redirect to `/login` |
| Wrong password | `401`, failure audited |
| Operator creating a campaign | `403` |
| Operator assigning queue records | `403` |
| Operator listing users | `403` |
| Operator exporting data | `403` |
| Operator opening another operator's record | `403` |
| Viewer creating a campaign | `403` |
| Viewer opening the outreach workspace | `403` |
| Viewer reading the audit log | `403` |
| Campaign manager escalating a user to admin | `403` |
| Campaign manager overriding do-not-contact | `403` |
| DNC record entering the queue | Blocked; absent from the operator queue |
| DNC override without an adequate reason | `422` |
| Stale optimistic-lock save | `409 STALE_RECORD`, nothing written |
| Disabled account with a live session | `200` → `401` immediately |
| `.php` file upload | `415` |
| Formula payload in an export | Neutralized with a leading apostrophe |
| Operator's audit view | Limited to their own actions only |
| Login while the database is down | Clean `503 DATABASE_UNAVAILABLE`, not a 500 with a stack trace |

---

## 4. Dependency review

`npm audit` — **0 vulnerabilities** (production and development trees).

Three advisories were present in the transitive tree at first assembly and were resolved with pinned
`overrides` in `package.json` rather than being accepted as risk:

| Package | Advisory | Resolution |
| --- | --- | --- |
| `sharp` < 0.35.0 | GHSA-f88m-g3jw-g9cj — inherited libvips CVEs | Pinned `^0.35.3` |
| `uuid` < 11.1.1 (via `exceljs`) | GHSA-w5hq-g745-h8pq — missing buffer bounds check | Pinned `^11.1.1` |
| `postcss` | Transitive advisories | Pinned `^8.5.21` |

The full test suite and production build were re-verified after the overrides were applied.

**Notable dependency choices.** `exceljs` + `papaparse` are used for spreadsheet handling instead of
SheetJS/`xlsx`, which has a history of prototype-pollution and ReDoS advisories with slow npm
distribution. `@node-rs/argon2` provides Argon2id with prebuilt binaries and no build toolchain.

Re-run `npm audit` on every dependency bump and before each release.

---

## 5. Residual risks and recommendations

| # | Risk | Severity | Recommendation |
| --- | --- | --- | --- |
| 1 | No MFA on sign-in | Medium | Design is MFA-ready (single credential check, epoch-based invalidation). Add TOTP before wider rollout, or move to organization SSO. |
| 2 | No login rate limiting or lockout | Medium | Failures are audited but not throttled. Add per-IP and per-account rate limiting at the edge or in the proxy. |
| 3 | No self-service password reset | Low | Deliberate for MVP — administrators issue passwords. Users cannot rotate their own credentials without help. |
| 4 | Background exports run in-process | Low | A restart mid-job leaves it `PENDING`. Move to a durable queue if export volume grows. |
| 5 | Retention windows are stored but not auto-enforced | Low | `retention.*` settings are configurable; add a scheduled purge job before the retention period first elapses. |
| 6 | Password policy is length-only (≥ 12 chars) | Low | Add a breached-password check (e.g. k-anonymity range query) or raise minimum entropy. |
| 7 | CSP allows `'unsafe-inline'` for scripts | Low | Required by Next.js bootstrap. Move to nonce-based CSP when the framework makes it practical. |
| 8 | Audit log has no tamper-evidence | Low | An administrator with database access could alter history. Ship logs to append-only external storage if that threat matters. |
| 9 | Demo reset destroys data irreversibly | Low | Administrator-only, production-blocked and confirmation-gated. Keep `ALLOW_DEMO_RESET` unset outside disposable environments; recovery is restore-from-backup only. |

None of these block MVP delivery. Items 1 and 2 should be scheduled before the tool is used by a
materially larger operator group.

---

## 6. Sign-off

Re-check this review, and Meta's current platform requirements, before every production release and
after any major platform change.

| | |
| --- | --- |
| Reviewed by | _________________________ |
| Date | _________________________ |
| Meta policy re-check date | _________________________ |
