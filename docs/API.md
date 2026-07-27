# API reference

All endpoints are JSON over HTTPS and require an authenticated session cookie unless marked public.
Authorization is enforced server-side on every route (FR-002 / SEC-004) — hiding a control in the UI
is never the security boundary.

## Conventions

**Success** responses return the resource directly:

```json
{ "campaign": { "id": "…", "name": "…" } }
```

**Errors** always use the same envelope:

```json
{ "error": "Human-readable message.", "code": "MACHINE_CODE", "details": { } }
```

| Status | Meaning |
| --- | --- |
| `400` | Malformed request (bad JSON, missing file) |
| `401` | No valid session — sign in again |
| `403` | Authenticated but the role or campaign scope forbids the action |
| `404` | Record not found or not visible to the caller |
| `409` | Conflict: stale optimistic lock, invalid status transition, already committed |
| `413` / `415` | Upload too large / unsupported file type |
| `422` | Validation failure; `details` lists field paths |
| `423` | Record is locked by another operator |

### Notable error codes

| Code | Raised when |
| --- | --- |
| `STALE_RECORD` | The optimistic concurrency token no longer matches. Refresh and retry. |
| `INVALID_TRANSITION` | The requested status change is not allowed from the current status. |
| `MANUAL_SEND_NOT_AFFIRMED` | Mark Sent was attempted without the operator's explicit confirmation. |
| `UNRESOLVED_VARIABLES` | Mark Sent was attempted with `{{tokens}}` still in the text and no acknowledgement. |
| `NOT_READY` | Campaign activation was blocked; `details.blockers` lists the reasons. |
| `RECORD_LOCKED` | Another operator holds the short processing lock. |
| `IMPORT_ROLLED_BACK` | The import transaction failed; **no rows were saved**. |

---

## Authentication

### `POST /api/auth/login` *(public)*
Authenticate and create a secure session.

```json
{ "email": "manager@qroad.test", "password": "…" }
```

Sets an HTTP-only, SameSite=Lax session cookie. Returns `401` with an identical message for unknown
accounts, wrong passwords and disabled accounts, so the endpoint cannot enumerate users. Both
success and failure are written to the audit log.

### `POST /api/auth/logout`
Clears the session cookie and records `auth.logout`.

### `GET /api/health` *(public)*
Liveness probe. Returns `{ "status": "ok", "database": "reachable" }` or `503`.

---

## Campaigns

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/campaigns` | `campaigns_view` | List with `search`, `status`, `ownerId` filters |
| `POST` | `/api/campaigns` | `campaigns_write` | Create a campaign (starts in `DRAFT`) |
| `GET` | `/api/campaigns/{id}` | `campaigns_view` | Read one campaign |
| `PATCH` | `/api/campaigns/{id}` | `campaigns_write` | Update; archived campaigns are read-only |
| `GET` | `/api/campaigns/{id}/activate` | `campaigns_view` | Activation readiness preview |
| `POST` | `/api/campaigns/{id}/activate` | `campaigns_write` | Set status; validates readiness for `ACTIVE` |
| `GET` | `/api/campaigns/{id}/records` | `campaigns_view` | Campaign audience with filters and status counts |
| `POST` | `/api/campaigns/{id}/assign` | `queue_assign` | Bulk assign to an operator |

**Create/update body** — `name`, `clientId` *or* `clientName`, `location`, `visitStart`, `visitEnd`,
`deliverables`, `deliverablesShort`, `compensation`, `applicationDeadline`, `targetCategory`,
`targetLocation`, `briefUrl`, `briefLinkEnabled`, `ownerId`, `templateId`, `notes`,
`followUpOffsetDays` (0–2 entries). `visitEnd` must be on or after `visitStart`.

**Activation readiness** returns `{ ready, blockers[], warnings[] }`. Activation is refused unless an
**approved** template version is selected and every required field is present. A past application
deadline and an empty audience are warnings, not blockers.

**Assignment** never queues a do-not-contact record. The response reports
`{ assigned, markedReady, blockedByDnc[] }`. There is deliberately **no bulk send** endpoint.

---

## Imports

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/imports` | `influencers_import` | Upload `.xlsx`/`.csv` and open a session |
| `POST` | `/api/imports/{id}/mapping` | `influencers_import` | Save the mapping and run validation |
| `GET` | `/api/imports/{id}/errors` | `influencers_import` | Download the validation error CSV |
| `POST` | `/api/imports/{id}/commit` | `influencers_import` | Commit the selected rows in one transaction |

`POST /api/imports` takes `multipart/form-data` with `file` and optional `campaignId`. It returns the
detected worksheet names, headers, a suggested column mapping and a five-row preview. Files are
validated for type, size and row count before parsing.

Validation classifies each row `VALID`, `WARNING` or `REJECTED` and attaches `issues[]` of
`{ field, code, message, severity }`. Rows that duplicate an earlier row, or that already belong to
the campaign, are pre-deselected. Do-not-contact creators are rejected outright.

Commit is fully transactional: if any row fails, **nothing** is written and the import is marked
`FAILED` with `IMPORT_ROLLED_BACK`. The response reports
`{ imported, created, linked, addedToCampaign, skipped }`.

---

## Influencers

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/influencers` | `influencers_view` | Search by name, email or normalized URL; filter by category, location, channel, DNC |
| `GET` | `/api/influencers/{id}` | `influencers_view` | Full record with profiles, tags and campaign history |
| `PATCH` | `/api/influencers/{id}` | `influencers_write` | Update editable fields |
| `POST` | `/api/influencers/{id}/dnc` | `influencers_dnc` | Set or clear the do-not-contact flag |
| `POST` | `/api/discovery/search` | `influencers_import` | Search configured web index by keywords, category, location, channel, and limit (maximum 20) |
| `POST` | `/api/discovery/save` | `influencers_import` | Save reviewed profile URLs with normalized-URL deduplication |

Setting DNC also withdraws the creator from every unfinished outreach record and cancels pending
follow-ups. **Clearing** DNC requires `dnc_override` (administrator) and a written reason of at least
10 characters. Both directions are audited.

Discovery search is read-only against Instagram/Facebook: the server queries Brave Search, filters
the response to supported profile URLs, and checks them against the local database. It never fetches
the profile page. Search and save actions are audited separately.

---

## Outreach

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/outreach/queue` | `outreach_process` | The caller's eligible queue, correctly ordered |
| `GET` | `/api/outreach/{id}` | `outreach_process` | Workspace payload; `?lock=1` takes the processing lock |
| `POST` | `/api/outreach/{id}/copy-event` | `outreach_process` | Record a copy or profile-open event |
| `POST` | `/api/outreach/{id}/outcome` | `outreach_process` | Save an outcome with an optimistic token |
| `PATCH` | `/api/outreach/{id}/status` | `pipeline_update` | Recruitment pipeline transition |
| `POST` | `/api/outreach/{id}/dnc-override` | `dnc_override` | Administrator override, reason required |

**Queue eligibility:** campaign `ACTIVE`, status `READY` or `FOLLOW_UP_DUE`, assigned to the caller,
not do-not-contact (unless overridden), and not locked by another live session.
**Ordering:** priority descending, due date ascending, then creation timestamp ascending.

**`copy-event`** accepts `{ "kind": "copy" | "profile_open" }`. It stores a timestamp for workflow
analytics and explicitly returns `{ "statusChanged": false }`. Copying is blocked for do-not-contact
creators. Neither action ever implies that a message was sent.

**`outcome`** body:

```json
{
  "outcome": "SENT",
  "version": 3,
  "channel": "INSTAGRAM",
  "confirmedText": "the exact text the operator sent",
  "preparedText": "the text the system rendered",
  "skipReasonId": null,
  "note": "",
  "manualSendAffirmed": true,
  "unresolvedAcknowledged": false
}
```

`SENT` requires a channel, the exact confirmed text, and `manualSendAffirmed`. If the text still
contains `{{tokens}}`, the request is refused with `UNRESOLVED_VARIABLES` unless
`unresolvedAcknowledged` is true. `SKIPPED` requires a `skipReasonId` from the controlled list.
Saving `SENT` schedules the campaign's follow-up reminders. The response returns
`{ recordId, newStatus, followUpsCreated, nextRecordId }` — the next record is resolved only after
the save succeeds.

---

## Follow-ups

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/follow-ups` | `outreach_process` | `?scope=due\|all`, optional `campaignId` |
| `PATCH` | `/api/follow-ups/{id}` | `outreach_process` | `{ "status": "COMPLETED" \| "CANCELLED" }` |

Operators see only their own reminders; managers see the whole campaign. Completing the final
reminder past its closure window moves the record to `NO_RESPONSE`.

---

## Templates

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/templates` | `campaigns_view` | List templates with their current version |
| `POST` | `/api/templates` | `templates_write` | Create a template and its first version |
| `GET` | `/api/templates/{id}` | `campaigns_view` | Template with full version history |
| `PATCH` | `/api/templates/{id}` | `templates_write` | Save a new immutable version |
| `POST` | `/api/templates/{id}` | `templates_approve` | Approve `{ "versionId": "…" }` |

Editing content always creates a new version and returns the template to `DRAFT`. Only an approved
version can back an active campaign.

---

## Reports and exports

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/reports/campaign/{id}` | `reports_view` | Funnel, daily series and operator metrics |
| `POST` | `/api/exports` | `export_data` | Create a filtered CSV/XLSX export |
| `GET` | `/api/exports` | `export_data` | The caller's recent export jobs |
| `GET` | `/api/exports/{id}/download` | `export_data` | Stream the generated file |

Export entities: `campaign_records`, `influencers`, `follow_ups`, `audit_logs`. Every cell is passed
through formula-injection protection. Results above `EXPORT_SYNC_ROW_LIMIT` become a background job
that the client polls; no email delivery is promised because none is implemented. Downloads are
audited.

An operator whose `reports_view` scope is `own` only ever receives their own numbers, regardless of
the query string.

---

## Administration

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/users` | `manage_users` or `queue_assign` | List users (assignment pickers need this) |
| `POST` | `/api/users` | `manage_users` | Create an account |
| `PATCH` | `/api/users/{id}` | `manage_users` | Change name, email, role, status or password |
| `GET` / `PATCH` | `/api/admin/roles` | `manage_users` | Read or adjust a permission scope |
| `GET` / `PATCH` | `/api/admin/settings` | `manage_settings` | Organization and retention settings |
| `GET` / `POST` / `PATCH` | `/api/admin/skip-reasons` | `manage_settings` (writes) | Controlled skip-reason list |
| `POST` | `/api/admin/reset-demo-data` | **Administrator role** | Wipe and rebuild the demo dataset |
| `GET` | `/api/audit-logs` | `audit_view` | Authorized audit search |
| `GET` | `/api/clients` | `campaigns_view` | Client picker |

Disabling an account or changing its password increments `sessionEpoch`, which invalidates every
live session for that user on their next request. An administrator cannot disable their own account.

`/api/audit-logs` is automatically scoped: administrators see everything, campaign managers see
their own actions plus their campaigns, and operators see only their own actions.

### `POST /api/admin/reset-demo-data`

Deletes every campaign, influencer and outreach record, then rebuilds the seeded demo dataset.
**Irreversible.**

```json
{ "confirm": "RESET DEMO DATA" }
```

Four guards, checked in this order:

| Order | Guard | Failure |
| --- | --- | --- |
| 1 | Caller must hold the **Administrator role** — checked directly, not via the permission matrix, so it cannot be granted to another role | `403` |
| 2 | Refused when `NODE_ENV=production` unless `ALLOW_DEMO_RESET=true` | `403 RESET_DISABLED_IN_PRODUCTION` |
| 3 | Body must contain the exact phrase `RESET DEMO DATA` | `422 CONFIRMATION_REQUIRED` |
| 4 | Audited as `admin.demo_data.reset` once the new dataset is in place | — |

Users, roles, application settings and skip reasons are **preserved**, so the acting administrator
keeps their session. Everything else, including `audit_logs`, is deleted.

Returns `{ summary: { campaigns, influencers, records, followUps }, durationMs }`.
