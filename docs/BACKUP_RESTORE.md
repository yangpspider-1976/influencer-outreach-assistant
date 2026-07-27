# Backup, restore and migration procedures

Satisfies SEC-012 and AC-015. **A backup you have never restored is not a backup** — run the drill in
§4 at least quarterly and record the result.

---

## 1. What must be backed up

| Asset | Contains | Loss impact |
| --- | --- | --- |
| PostgreSQL database | All campaigns, influencers, attempts, follow-ups, audit log | Total. Unrecoverable without a backup. |
| `STORAGE_DIR` volume | Uploaded source files, generated exports, campaign briefs | Import provenance and brief attachments lost |
| Secret manager entries | `SESSION_SECRET`, `DATABASE_URL` | App cannot start; all sessions invalidated |

The application image is rebuildable from git and does not need backing up.

---

## 2. Database backup

### Scheduled (recommended)

```bash
#!/usr/bin/env bash
# /opt/qroad/backup-db.sh — run hourly via cron
set -euo pipefail

BACKUP_DIR=/var/backups/qroad
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"

pg_dump --format=custom --no-owner --no-privileges \
  --file="$BACKUP_DIR/qroad_ioa_$STAMP.dump" "$DATABASE_URL"

# Verify the dump is readable before trusting it.
pg_restore --list "$BACKUP_DIR/qroad_ioa_$STAMP.dump" > /dev/null

# 30-day local retention; offsite copy is authoritative for long-term retention.
find "$BACKUP_DIR" -name 'qroad_ioa_*.dump' -mtime +30 -delete
```

Ship each dump to encrypted offsite storage immediately. Recommended cadence: hourly retained 48 h,
daily retained 30 d, monthly retained 12 months.

### Ad hoc, before any migration or risky change

```bash
docker compose exec -T db pg_dump -U qroad --format=custom qroad_ioa \
  > "pre-change-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

---

## 3. File storage backup

```bash
tar --create --gzip \
  --file "/var/backups/qroad/storage_$(date -u +%Y%m%dT%H%M%SZ).tar.gz" \
  -C /data storage
```

For the Docker volume:

```bash
docker run --rm \
  -v influencer-outreach-assistant_qroad_ioa_storage:/data:ro \
  -v "$(pwd)":/backup alpine \
  tar czf "/backup/storage_$(date -u +%Y%m%dT%H%M%SZ).tar.gz" -C /data .
```

Take the storage snapshot in the same window as the database dump so file keys referenced by
`imports.storedFileKey` and `export_jobs.storedFileKey` resolve after a restore.

---

## 4. Restore

> Restore into a **scratch environment first**. Never practise on production.

```bash
# 1. Stop the application (leave the database running)
docker compose stop app

# 2. Recreate an empty database
docker compose exec -T db psql -U qroad -d postgres \
  -c "DROP DATABASE IF EXISTS qroad_ioa;" -c "CREATE DATABASE qroad_ioa OWNER qroad;"

# 3. Restore the dump
docker compose exec -T db pg_restore -U qroad -d qroad_ioa --no-owner < backup.dump

# 4. Restore file storage
docker run --rm \
  -v influencer-outreach-assistant_qroad_ioa_storage:/data \
  -v "$(pwd)":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/storage_TIMESTAMP.tar.gz -C /data"

# 5. Apply any migrations newer than the dump
docker compose exec app npx prisma migrate deploy

# 6. Restart
docker compose --profile full up -d app
```

### Post-restore verification

```bash
curl -fsS https://your-host/api/health     # → {"status":"ok","database":"reachable"}
```

Then confirm by hand:

- [ ] Sign in as an administrator
- [ ] Row counts match the source: campaigns, influencers, campaign records, audit entries
- [ ] Open a campaign — audience, funnel and analytics render
- [ ] Open the outreach workspace — a message renders with variables resolved
- [ ] Open a do-not-contact creator — the block is still in force
- [ ] Download an existing export from Reports (proves storage keys resolve)
- [ ] Audit log shows entries from before the restore point

Record the drill date, dump timestamp, restore duration and the verifier's name.

```sql
-- Quick row-count comparison
SELECT 'campaigns' t, count(*) FROM campaigns
UNION ALL SELECT 'influencers', count(*) FROM influencers
UNION ALL SELECT 'campaign_influencers', count(*) FROM campaign_influencers
UNION ALL SELECT 'outreach_attempts', count(*) FROM outreach_attempts
UNION ALL SELECT 'follow_up_tasks', count(*) FROM follow_up_tasks
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;
```

---

## 5. Migration procedure

Migrations are versioned SQL in `prisma/migrations/`, applied in order and forward-only.

### Fresh install

```bash
npx prisma migrate deploy   # applies every migration to an empty database
npm run db:seed             # non-production only
```

### Upgrading an existing database

```bash
# 1. Back up first — always
docker compose exec -T db pg_dump -U qroad --format=custom qroad_ioa > pre-migrate.dump

# 2. Review what will run
npx prisma migrate status

# 3. Apply
npx prisma migrate deploy

# 4. Confirm the schema matches the checked-in schema exactly
npx prisma migrate status   # → "Database schema is up to date!"
```

### Migration testing (required before each release)

Both paths must pass:

1. **Fresh install** — empty database → `migrate deploy` → `db:seed` → application starts, sign-in
   works, dashboard renders.
2. **Upgrade** — restore a production-shaped dump taken at the *previous* release →
   `migrate deploy` → verify no data loss and that the acceptance walkthrough still passes.

### If a migration fails

`prisma migrate deploy` runs each migration in a transaction, so a failure leaves the schema at the
last successful migration.

```bash
npx prisma migrate status                  # identify the failed migration
docker compose stop app                    # keep traffic off a half-migrated schema
# restore pre-migrate.dump (section 4), fix the migration, redeploy
```

Never edit an already-applied migration file. Never use `prisma db push` against staging or
production — it bypasses migration history.

---

## 6. Disaster recovery targets

| Objective | Target |
| --- | --- |
| RPO (max data loss) | 1 hour — hourly database dumps |
| RTO (max downtime) | 4 hours — restore plus verification |

**Full-loss recovery order:** provision infrastructure → restore secrets from the secret manager →
restore database → restore file storage → `migrate deploy` → start app → run the §4 verification
checklist → re-enable user access.
