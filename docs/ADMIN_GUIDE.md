# Administrator guide

Deployment, user management, configuration and troubleshooting for the QROAD Influencer Outreach
Assistant.

---

## 1. Environments

Run three isolated environments, each with its own database and its own `SESSION_SECRET`:

| Environment | Purpose | Notes |
| --- | --- | --- |
| Development | Local work | The only environment allowed to run without TLS |
| Staging | Phase demos and UAT | Realistic sample data, never real creator PII |
| Production | Live campaigns | TLS enforced, backups verified, seed script never run |

---

## 2. Deployment

### 2.1 First deployment

```bash
git clone <qroad-repo-url> && cd influencer-outreach-assistant
cp .env.example .env
```

Fill in `.env`:

```bash
# Generate a strong session secret
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Production guidance |
| --- | --- |
| `DATABASE_URL` | Managed PostgreSQL 17, TLS enabled, dedicated least-privilege user |
| `SESSION_SECRET` | ≥ 32 chars from a secret manager. Never in source control. |
| `STORAGE_DIR` | Persistent volume, not the container filesystem |
| `SESSION_IDLE_TIMEOUT_MINUTES` | 30–60 for shared workstations |
| `MAX_UPLOAD_MB`, `MAX_IMPORT_ROWS` | Keep at defaults unless a real list needs more |
| `ALLOWED_EMAIL_DOMAINS` | Set to your corporate domain to prevent stray accounts |
| `BRAVE_SEARCH_API_KEY` | Optional server-side key for Creator discovery; use a plan permitting storage of reviewed URLs |
| `DISCOVERY_SEARCH_COUNTRY` | Search relevance country, normally `ph` |

Build and start:

```bash
docker compose --profile full up -d --build
docker compose exec app npx prisma migrate deploy
```

Create the first administrator (production — do **not** run `db:seed`):

```bash
docker compose exec app node -e "
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./src/generated/prisma/client');
const { hash } = require('@node-rs/argon2');
(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
  await prisma.user.create({ data: {
    email: 'admin@yourdomain.com',
    name: 'Your Name',
    roleId: role.id,
    passwordHash: await hash(process.env.INITIAL_PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
  }});
  await prisma.\$disconnect();
})();
"
```

> The four roles and their permission sets are created by the migration seed. If `role.findUnique`
> returns nothing, run `npm run db:seed` once against an **empty** database, then delete the demo
> users immediately.

Verify: `curl https://your-host/api/health` → `{"status":"ok","database":"reachable"}`.

### 2.2 Subsequent releases

```bash
git pull
docker compose --profile full build app
docker compose exec app npx prisma migrate deploy   # run before swapping traffic
docker compose --profile full up -d app
```

Migrations are forward-only and additive. Review `prisma/migrations/` before any release that
touches the schema, and take a backup first (see `BACKUP_RESTORE.md`).

### 2.3 Deployment checklist

- [ ] TLS terminates in front of the app; HTTP redirects to HTTPS
- [ ] `SESSION_SECRET` is unique to this environment and stored in a secret manager
- [ ] `STORAGE_DIR` is a persistent, backed-up volume
- [ ] Database backups scheduled **and a restore test completed**
- [ ] Demo accounts (`*@qroad.test`) deleted or disabled
- [ ] `ALLOWED_EMAIL_DOMAINS` set
- [ ] `/api/health` wired to your uptime monitor
- [ ] Error monitoring receives logs; verify no message bodies or credentials appear in them
- [ ] Meta platform policy re-checked and the review date recorded

---

## 3. Users and roles

### Creating accounts

**Administration → Users.** Enter name, email, role and an initial password (minimum 12 characters).
Deliver the password out of band and have the user change it at first sign-in.

### Roles

| Role | Intended for |
| --- | --- |
| Administrator | System owners. Full access including do-not-contact overrides. |
| Campaign Manager | Runs campaigns: creation, templates, imports, assignment, pipeline, reports. |
| Outreach Operator | Processes their assigned queue. No campaign or user administration. |
| Viewer / Client Service | Read-only dashboards and reports. |

### Adjusting permissions

**Administration → Role permissions** exposes every permission and its scope. Scopes widen in this
order: `none` < `own` < `assigned` < `campaign` < `all`.

Two entries the work order marks *Optional* ship disabled — enable them here if QROAD wants them:

| Role | Permission | Default | Effect when enabled |
| --- | --- | --- | --- |
| Operator | `influencers_import` | `none` | Operators can upload and commit influencer lists |
| Viewer | `export_data` | `none` | Viewers can export the data they can see |

The Administrator column is locked to prevent an accidental lockout. Every change is audited.

### Disabling access

Set a user to **Disabled**. Their live sessions are invalidated on their next request — no waiting
for a token to expire. Resetting a password has the same effect. Disable rather than delete, so
their audit history stays attributable.

---

## 4. Configuration

**Administration → Organization settings** (`app_settings`):

| Key | Purpose |
| --- | --- |
| `organization.name` | Fallback for `{{campaign_manager_name}}` |
| `outreach.disclaimer` | Responsibility notice shown in the workspace |
| `retention.audit_log_days` | How long audit entries are kept (default 730) |
| `retention.import_file_days` | How long uploaded source files are kept (default 180) |

**Skip reasons** are a controlled list; operators must pick one when skipping. Deactivate a reason
rather than deleting it so historical attempts keep their label.

### Reset and reseed the demo data

**Administration → Danger zone** rebuilds the seeded demo dataset. It exists so a demo or training
environment can be returned to a known state after testing, without shell access.

| | |
| --- | --- |
| **Deleted** | Campaigns, influencers, social profiles, outreach records and attempts, follow-up tasks, imports, exports, and the entire audit log |
| **Preserved** | User accounts, roles and permissions, organization settings, skip reasons — so you stay signed in |

Four independent guards protect it:

1. **Administrator role**, hard-coded in the endpoint. It is deliberately *not* a grantable
   permission, so it cannot be handed to another role through the role editor.
2. **Blocked in production.** The endpoint returns `RESET_DISABLED_IN_PRODUCTION` unless
   `ALLOW_DEMO_RESET=true` is set in the environment.
3. **Typed confirmation** — the exact phrase `RESET DEMO DATA`.
4. **Audited.** The wipe clears `audit_logs`, so a fresh `admin.demo_data.reset` entry is written
   immediately afterwards recording who ran it and the resulting counts.

> **Never set `ALLOW_DEMO_RESET=true` on a database holding real campaigns.** There is no undo —
> recovery would mean restoring from backup (see `BACKUP_RESTORE.md`). Leave the variable unset on
> every production environment.

The equivalent command-line operations are `npm run db:reset` (drops and re-creates everything,
including users) and `npm run db:seed` (adds missing seed data only).

---

## 5. Do-not-contact governance

A do-not-contact creator is blocked across **every** campaign, current and future. They cannot be
imported into an audience, assigned, queued, or have their message copied.

- **Setting** DNC: any campaign manager or administrator.
- **Clearing** DNC, or overriding it for one campaign record: **administrator only**, and a written
  reason of at least 10 characters is mandatory.

Both actions are written to the audit log with the actor, reason, timestamp and session. Review
`influencer.dnc.clear` and `campaign_influencer.dnc.override` entries periodically — they should be
rare and always justified.

---

## 6. Monitoring and audit

- **Audit log** (`/audit`) — searchable by actor, action and record type. Administrators see
  everything; campaign managers see their own actions plus their campaigns; operators see only their
  own actions.
- **Exports** are recorded on both creation and download.
- Logs never contain passwords, tokens or full private message bodies.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/api/health` returns `degraded` | Database unreachable. Check `DATABASE_URL`, network and that the DB container is healthy. |
| "SESSION_SECRET is missing or shorter than 32 characters" | The secret is unset or too short. Set it and restart. |
| Everyone is signed out after a deploy | `SESSION_SECRET` changed. Expected — it invalidates all tokens. Keep it stable across releases. |
| Operator sees an empty queue | Campaign not `ACTIVE`, nothing assigned to them, records not `READY`, or the creator is DNC. Check the campaign's Audience tab. |
| "Another operator is currently working on this record" | Normal processing lock, 15-minute TTL. It clears itself. |
| "This record was changed by someone else" | Optimistic-lock conflict; nothing was saved. The user refreshes and re-applies. |
| Import fails with `IMPORT_ROLLED_BACK` | The transaction rolled back — **no partial data was written**. Check `imports.errorMessage`, correct the file and retry. |
| Export stays `PENDING` | Result exceeded `EXPORT_SYNC_ROW_LIMIT` and is running as a background job. It appears under Reports when finished. |
| Clipboard fails for an operator | Non-HTTPS origin or a browser permission block. Serve over TLS; the workspace falls back to selectable text meanwhile. |

---

## 8. Platform policy obligations

This system must never gain the ability to:

- log in to Facebook or Instagram, or store Meta passwords, cookies or session data;
- scrape profiles or collect follower counts from platform pages;
- click Message, type into a Meta page, click Send, solve CAPTCHAs or evade rate limits;
- run headless browser automation (Selenium, Playwright, Puppeteer) or DOM-injecting extensions
  against Meta properties in production;
- claim message delivery or read confirmation without an authorized source.

Re-check Meta's current Messenger Platform and Instagram Messaging API policies, Instagram Terms of
Use, and the "Send a Message" documentation **before every production release** and after any major
platform change. Record the review date and reviewer.

Any future official Meta or Creator Marketplace integration must be developed as a separate feature
with its own policy and legal review.
