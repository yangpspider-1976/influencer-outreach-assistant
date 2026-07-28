# QROAD Influencer Outreach Assistant

A human-in-the-loop tool for managing personalized influencer outreach across Instagram,
Facebook, TikTok, and YouTube.

The system automates campaign preparation, list management, personalization, profile launching,
copying, tracking and follow-up scheduling. **A human operator performs the final paste, review and
Send action inside the selected social platform for every first-contact DM.**

> **Non-negotiable boundary.** This application never signs in to social platforms, never stores
> platform passwords/cookies/session data, never scrapes profiles, never types into or clicks inside
> Instagram, Facebook, TikTok, or YouTube, and never sends a message. It opens a saved profile URL in a new tab with a normal
> link and copies prepared text to the clipboard after a user gesture. Nothing more.

---

## Table of contents

- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Environment configuration](#environment-configuration)
- [Common tasks](#common-tasks)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation index](#documentation-index)

---

## Quick start

**Prerequisites:** Node.js 22+, Docker (for PostgreSQL), npm 10+.

```bash
# 1. Install dependencies (runs `prisma generate` automatically)
npm install

# 2. Create your environment file and generate a session secret
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    → paste the value into SESSION_SECRET in .env

# 3. Start PostgreSQL
docker compose up -d db

# 4. Apply migrations and load demo data
npm run db:migrate
npm run db:seed

# 5. Run the app
npm run dev
```

Open <http://localhost:3000> and sign in with one of the demo accounts below.

To run the whole stack (app + database) in Docker instead:

```bash
docker compose --profile full up -d --build
docker compose exec app npx prisma migrate deploy
```

### Share the dev server on your WiFi (LAN)

Other people on the same network can open the running dev server:

1. Find this machine's LAN IP — the address `next dev` prints next to **Network**
   (e.g. `http://192.168.0.104:3000`). Ignore the `127.0.0.1` / WSL / Hyper-V addresses.
2. Have others browse to `http://<that-ip>:3000` and sign in normally.

Two things are already configured for this:

- **`allowedDevOrigins`** in [`next.config.ts`](next.config.ts) permits the common private ranges
  (`192.168.*.*`, `10.*.*.*`, `172.16.*.*`) so Next 16 does not block HMR / dev resources for LAN
  visitors. If your subnet differs, set `DEV_ALLOWED_ORIGINS` (comma-separated hosts) in `.env`.
- The auth proxy excludes all `_next/` paths, so hot reload works over the LAN.

If a device cannot connect, allow inbound **TCP 3000** through Windows Defender Firewall for the
network profile your WiFi uses (run in an **admin** PowerShell):

```powershell
New-NetFirewallRule -DisplayName "QROAD Dev Server (port 3000)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private,Public
```

> This shares the **development** server, meant for a trusted local network only. It runs over plain
> HTTP, so session cookies are not marked `secure` — do not expose it to the public internet. For a
> real multi-user deployment, use the production Docker image behind HTTPS (see
> [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md)).

## Demo accounts

The seed creates one realistic restaurant campaign with 56 influencers across two operators.
All demo accounts share the password `QroadDemo!2026`.

| Role | Email | What they can do |
| --- | --- | --- |
| Administrator | `admin@qroad.test` | Everything, including do-not-contact overrides, users and roles |
| Campaign Manager | `manager@qroad.test` | Campaigns, templates, imports, assignment, pipeline, reports, exports |
| Outreach Operator | `operator1@qroad.test` | Only their assigned outreach queue and follow-ups |
| Outreach Operator | `operator2@qroad.test` | Only their assigned outreach queue and follow-ups |
| Viewer | `viewer@qroad.test` | Read-only dashboards and reports |

Change or disable these before any non-local deployment.

Under `npm run dev` the sign-in screen shows a **Development only** panel with a one-click shortcut
per role. It never exists in a production build — `npm run verify:no-demo-creds` proves no demo
credential reaches the client.

## Architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript | Server components for reads, client components for queue workflows |
| UI | Tailwind CSS v4, Inter via `next/font` | White surfaces, blue primary, visible focus rings, keyboard navigable |
| API | Next.js Route Handlers (REST/JSON) | One stack, no unnecessary service split |
| Database | PostgreSQL 17 + Prisma 7 | Migrations, unique constraints, transactional status updates |
| Auth | Email/password, Argon2id, JWT in an HTTP-only cookie | MFA-ready; rolling inactivity window |
| File storage | Private filesystem volume (`STORAGE_DIR`) | Never served statically; streamed through authorized routes only |
| Deployment | Docker (multi-stage, non-root, standalone output) | Separate dev / staging / production environments |

### Business logic lives in pure modules

Everything the work order calls out for unit testing is a pure, dependency-free module so it can be
verified directly:

| Module | Responsibility | Requirement |
| --- | --- | --- |
| `src/lib/social-url.ts` | Social profile URL normalization, follower parsing | FR-010, FR-011, AC-003 |
| `src/lib/template.ts` | Variable rendering, unresolved-token detection | FR-015, §9 |
| `src/lib/status.ts` | Status model and allowed transitions | FR-021 |
| `src/lib/follow-up.ts` | Follow-up scheduling and cancellation rules | FR-022, §13 |
| `src/lib/metrics.ts` | Every §17 reporting formula | FR-025, AC-010 |
| `src/lib/rbac.ts` | Permission matrix and scope evaluation | FR-002, §5, AC-012 |
| `src/lib/spreadsheet.ts` | CSV/XLSX generation with formula-injection protection | FR-026, SEC-005, AC-011 |
| `src/lib/import-fields.ts` | Column mapping and per-row validation | FR-008, FR-009, §8 |

## Project layout

```
prisma/
  schema.prisma          Data model (§13)
  migrations/            Versioned SQL migrations
  seed.ts                Demo campaign, 56 influencers, roles, skip reasons
src/
  app/
    login/               Sign-in screen
    (app)/               Authenticated shell: dashboard, campaigns, outreach,
                         follow-ups, pipeline, influencers, templates, reports,
                         audit, admin
    api/                 REST route handlers
  components/            Design-system primitives and shared UI
  lib/                   Business logic, services and access control
  proxy.ts               Session gate and rolling idle expiry
tests/                   Vitest unit tests for the pure modules
docs/                    Source documents, guides and the sample import file
```

## Environment configuration

See [`.env.example`](.env.example) for the annotated list. The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Signs session cookies. Minimum 32 characters. Never commit it. |
| `STORAGE_DIR` | Private storage root for uploads and generated exports |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Inactivity timeout (SEC-011) |
| `MAX_UPLOAD_MB`, `MAX_IMPORT_ROWS` | Import file guards (SEC-005) |
| `ALLOWED_EMAIL_DOMAINS` | Optional account domain allow-list |
| `EXPORT_SYNC_ROW_LIMIT` | Row count above which an export becomes a background job |
| `BRAVE_SEARCH_API_KEY` | Optional server-only key enabling automatic Creator discovery |
| `DISCOVERY_SEARCH_COUNTRY` | Two-letter country used to improve discovery relevance (`ph` by default) |

### Creator discovery

Admins and Campaign Managers can use **Creator discovery** to search a public web index for
Instagram, Facebook, TikTok, and YouTube profile links using keywords, category, location, channel, and a maximum of
5, 10, or 20 results. Access is limited to roles with influencer-import permission; saving reuses
the same normalized-URL duplicate protection as CSV import.

The feature never opens or scrapes profile pages and does not collect follower counts, contact
details, cookies, or platform credentials. When the public web index returns a YouTube video
instead of its channel, the server may use YouTube's public oEmbed metadata only to resolve the
creator name and channel URL. Configure one of the supported discovery providers with terms that
permit saving user-reviewed profile URLs for automatic results. Without a key,
the free manual-assisted workflow generates targeted Google search links and lets the user paste,
or import from the clipboard, validate, deduplicate, and save reviewed social
profile URLs. Browser security prevents the application from reading results in the separate
Google tab, so the user must still copy the links they choose to keep.

## Common tasks

```bash
npm run dev          # Development server
npm run build        # Production build (runs prisma generate first)
npm run start        # Serve the production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit suite
npm run db:migrate   # Create and apply a migration
npm run db:deploy    # Apply migrations (production)
npm run db:seed      # Load demo data
npm run db:reset     # Drop, re-migrate and re-seed (destructive)
npm run db:demo-reset # Rebuild demo data only, keeping users and settings
npm run db:studio    # Prisma Studio
npm run verify:no-demo-creds  # assert no demo credential is in the production build
```

## Testing

Three suites, each runnable on its own. **[`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) is the
full walkthrough** — how to run each suite, what every screen should show, and the exact numbers the
demo data produces.

```bash
npm test               # 112 unit tests — no server or database needed
npm run test:acceptance # 69 API checks across all four roles (needs a running server)
npm run test:ui        # 32 browser checks via Playwright (needs a running server)
```

| Suite | Covers |
| --- | --- |
| Unit | URL normalization, variable rendering, status transitions, follow-up scheduling, duplicate rules, permission scopes, every §17 formula, formula-injection escaping |
| Acceptance | AC-001 … AC-014 end to end, including every negative authorization case |
| UI | Sign-in, dashboard, campaign tabs, import wizard, workspace, follow-ups, admin, audit, responsive widths |

Requirement-to-test traceability lives in [`docs/UAT_CHECKLIST.md`](docs/UAT_CHECKLIST.md).

## Deployment

See [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) for the full procedure and
[`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) for backup, restore and migration drills.

## Documentation index

| Document | Contents |
| --- | --- |
| [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) | **How to test every feature**, with the exact expected numbers |
| [`docs/API.md`](docs/API.md) | Every endpoint, payload and error code |
| [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) | Table-by-table field reference |
| [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) | Deployment, users, roles, retention, troubleshooting |
| [`docs/OPERATOR_GUIDE.md`](docs/OPERATOR_GUIDE.md) | Outreach quick-start for operators |
| [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) | Backup, restore and migration procedures |
| [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) | Control-by-control security report |
| [`docs/UAT_CHECKLIST.md`](docs/UAT_CHECKLIST.md) | Requirement and acceptance ID traceability |
| [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) | Current limitations and roadmap |
| [`docs/sample-influencer-list.csv`](docs/sample-influencer-list.csv) | Import template exercising every validation rule |

---

**Policy review.** Meta platform requirements must be re-checked before every production release and
after any major platform change. If QROAD later obtains an official Meta or Creator Marketplace
integration, it must be built as a separate, formally reviewed feature.
