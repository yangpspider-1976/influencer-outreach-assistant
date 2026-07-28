# Data dictionary

PostgreSQL schema for the QROAD Influencer Outreach Assistant. Authoritative source:
[`prisma/schema.prisma`](../prisma/schema.prisma).

Every table has `createdAt`; mutable tables also have `updatedAt`. Primary keys are `cuid` strings.

---

## Identity and access

### `roles`
| Column | Type | Notes |
| --- | --- | --- |
| `key` | enum | `ADMIN`, `CAMPAIGN_MANAGER`, `OPERATOR`, `VIEWER` — unique |
| `name`, `description` | text | Display strings |
| `permissionSet` | jsonb | `{ permission: scope }`. Scopes: `none` < `own` < `assigned` < `campaign` < `all`. Read by every server-side authorization check. |

Storing permissions as data lets an administrator enable the entries the work order marks "Optional"
(operator import, viewer export) without a code change.

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `email` | text | Unique, lower-cased |
| `passwordHash` | text | Argon2id. Never a plaintext or reversible value. |
| `name` | text | Display name |
| `roleId` | fk → `roles` | |
| `status` | enum | `ACTIVE`, `DISABLED` |
| `lastLoginAt` | timestamptz | Set on successful sign-in |
| `sessionEpoch` | int | Incremented on disable or password change; a token whose epoch differs is rejected immediately (SEC-011) |

---

## Clients and campaigns

### `clients`
`name` (unique), `contactName`, `contactEmail`, `contactPhone`, `notes`, `status`.

### `campaigns`
| Column | Type | Notes |
| --- | --- | --- |
| `clientId` | fk → `clients` | |
| `name`, `location` | text | Required |
| `visitStart`, `visitEnd` | timestamptz | End must be ≥ start |
| `deliverables` | text | Full description, may be multi-line |
| `deliverablesShort` | text | Single-line copy-safe form rendered into the DM |
| `compensation` | text | Free text — supports barter and mixed offers |
| `applicationDeadline` | timestamptz? | Optional; a past date warns on activation |
| `targetCategory`, `targetLocation` | text | Advisory targeting notes |
| `briefUrl`, `briefFileKey`, `briefFileName` | text? | `briefFileKey` points into private storage and is never exposed publicly |
| `briefLinkEnabled` | bool | `{{brief_link}}` is omitted from rendered copy unless this is true |
| `ownerId` | fk → `users` | Responsible campaign manager |
| `templateVersionId` | fk → `template_versions`? | Must reference an **approved** version before activation |
| `status` | enum | `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `ARCHIVED` |
| `followUpOffsetDays` | int[] | 0–2 entries, days after Sent. Default `[3, 7]` |
| `notes` | text | Internal only; never rendered into outreach copy |
| `activatedAt`, `archivedAt` | timestamptz? | Lifecycle stamps |

---

## Influencer database

### `influencers`
| Column | Type | Notes |
| --- | --- | --- |
| `displayName`, `firstName` | text | `firstName` drives `{{first_name}}` |
| `category`, `location` | text | Filtering and campaign suitability |
| `followerCountRaw` | text? | **Exactly** as supplied by QROAD. Never scraped. |
| `followerCountNumeric` | int? | Parsed only when unambiguous; `null` for ranges like `50k-80k` |
| `email`, `phone`, `rate` | text? | Optional alternative contact and known fee |
| `notes` | text | Relevance, prior collaboration, restrictions |
| `dncFlag` | bool | Blocks new outreach across **all** campaigns |
| `dncReason`, `dncSetById`, `dncSetAt` | | Who set it, when and why |
| `archivedAt` | timestamptz? | Soft delete — historical reports stay resolvable |

### `social_profiles`
| Column | Type | Notes |
| --- | --- | --- |
| `influencerId` | fk → `influencers` | Cascade delete |
| `platform` | enum | `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `YOUTUBE` |
| `originalUrl` | text | Preserved exactly as uploaded |
| `normalizedUrl` | text | Canonical dedupe key, e.g. `instagram.com/examplecreator` |
| `usernameHint` | text? | Handle or numeric id |
| `preferredFlag` | bool | Controls which profile button appears first |
| `validityStatus` | enum | `UNKNOWN`, `VALID`, `INVALID` — operator-reported only |

> **Unique constraint:** `(platform, normalizedUrl)`. This is what makes an existing influencer be
> reused instead of duplicated when the same profile arrives in a different URL format (AC-003).

### `tags` / `influencer_tags`
Controlled classifications; many-to-many with a composite primary key.

---

## Campaign audience

### `campaign_influencers`
The join between a campaign and an influencer, and the unit of operator work.

| Column | Type | Notes |
| --- | --- | --- |
| `campaignId`, `influencerId` | fk | **Unique together** — one record per creator per campaign |
| `assigneeId` | fk → `users`? | Owning operator |
| `priority` | int | Higher sorts first in the queue |
| `outreachStatus` | enum | The full 13-value model (see below) |
| `pipelineStatus` | enum | `NONE`, `REPLIED`, `INTERESTED`, `NEGOTIATING`, `CONFIRMED`, `DECLINED`, `NO_RESPONSE` |
| `dueAt` | timestamptz? | Next follow-up date |
| `lastContactAt` | timestamptz? | Last confirmed send |
| `quotedRate`, `notes` | text? | Negotiation state and operator notes |
| `draftMessage` | text? | Saved but unsent operator draft |
| `version` | int | **Optimistic concurrency token.** A save whose version is stale is rejected. |
| `lockedById`, `lockedAt` | | Short processing lock (15 min TTL) so two operators cannot work one record |
| `queueOpenedAt` | timestamptz? | Start of the processing-time measurement |
| `lastCopiedAt`, `lastProfileOpenAt` | timestamptz? | Workflow analytics only — **never** imply a send |
| `dncOverrideById`, `dncOverrideAt`, `dncOverrideReason` | | The audited administrator override that lets a DNC record be queued |

**Outreach status values:** `NOT_CONTACTED`, `READY`, `SENT`, `FOLLOW_UP_DUE`, `REPLIED`,
`INTERESTED`, `NEGOTIATING`, `CONFIRMED`, `DECLINED`, `NO_RESPONSE`, `INVALID`, `DUPLICATE`,
`DO_NOT_CONTACT`. Allowed transitions are defined in `src/lib/status.ts` and enforced server-side.

---

## Templates

### `message_templates`
`name`, `platform`, `language`, `status`, `description`, `createdById`, `currentVersionId`,
`archivedAt`.

### `template_versions`
| Column | Type | Notes |
| --- | --- | --- |
| `templateId`, `version` | | Unique together; versions are immutable once created |
| `content` | text | Plain text with `{{token}}` / `{{token?}}` variables |
| `variables` | jsonb | Tokens discovered in the content |
| `lockedTokens` | text[] | Mandatory legal/compensation text a manager pinned |
| `status` | enum | `DRAFT`, `APPROVED`, `ARCHIVED` |
| `approvedById`, `approvedAt`, `versionNote` | | Approval metadata |

---

## Outreach activity

### `outreach_attempts`
| Column | Type | Notes |
| --- | --- | --- |
| `campaignInfluencerId` | fk | Cascade delete |
| `type` | enum | `FIRST_CONTACT`, `FOLLOW_UP` |
| `channel` | enum? | `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `YOUTUBE` |
| `templateVersionId` | fk? | Exact template version in force |
| `preparedText` | text | What the system rendered |
| `confirmedSentText` | text? | **The exact text the operator confirmed sending** (AC-007) |
| `outcome` | enum | `SENT`, `SKIPPED`, `INVALID`, `DUPLICATE`, `DO_NOT_CONTACT`, `SAVED_FOR_LATER` |
| `skipReasonId` | fk → `skip_reasons`? | Required for `SKIPPED` |
| `manualSendAffirmed` | bool | The operator's "I manually sent this message" acknowledgement |
| `unresolvedAcknowledged` | bool | True when sent despite unresolved variables |
| `sentConfirmedAt` | timestamptz? | Operator confirmation time — **not** a platform delivery receipt |
| `createdById` | fk → `users` | |

### `skip_reasons`
Administrator-managed controlled list: `label` (unique), `active`, `sortOrder`.

### `follow_up_tasks`
`campaignInfluencerId`, `attemptId`, `sequence` (1 or 2), `dueAt`, `status`
(`PENDING`/`COMPLETED`/`CANCELLED`), `assignedToId`, `completedAt`, `cancelledAt`, `cancelReason`.

---

## Import pipeline

### `imports`
`campaignId`, `originalFileName`, `storedFileKey`, `fileSizeBytes`, `sheetName`, `availableSheets`,
`headers`, `mapping` (jsonb), `status` (`UPLOADED`→`MAPPED`→`VALIDATED`→`COMMITTED`/`FAILED`), the
row counters (`totalRows`, `validRows`, `warningRows`, `rejectedRows`, `importedRows`,
`linkedExisting`, `createdCount`), `errorMessage`, `uploadedById`, `committedAt`.

### `import_rows`
`importId`, `rowNumber`, `rawData` (jsonb, original values), `normalizedData` (jsonb, post-mapping),
`status` (`VALID`/`WARNING`/`REJECTED`/`IMPORTED`/`SKIPPED`), `issues` (jsonb array of
`{ field, code, message, severity }`), `selected`, `influencerId`, `campaignInfluencerId`.

Keeping raw and normalized data plus per-row issues is what makes the import fully auditable and
lets the validation error file be regenerated at any time.

---

## Exports, settings and audit

### `export_jobs`
`requestedById`, `entity`, `format`, `filters` (jsonb), `status`, `rowCount`, `storedFileKey`,
`fileName`, `errorMessage`, `completedAt`.

### `app_settings`
`key` (primary key), `value` (jsonb). Seeded keys: `retention.audit_log_days`,
`retention.import_file_days`, `outreach.disclaimer`, `organization.name`.

### `audit_logs`
| Column | Type | Notes |
| --- | --- | --- |
| `actorId`, `actorEmail` | | Actor; `actorEmail` survives user deletion |
| `action` | text | Dotted action name, e.g. `campaign_influencer.status.change` |
| `entity`, `entityId` | text | Target record |
| `campaignId` | text? | Enables campaign-scoped audit access for managers |
| `oldValues`, `newValues` | jsonb? | Field-level diff, credential keys redacted |
| `ipAddress`, `sessionId`, `userAgent` | | Request metadata |

Indexed on `(entity, entityId)`, `(actorId, createdAt)`, `(campaignId, createdAt)` and `createdAt`.

---

## Retention and deletion

Records that must remain resolvable for historical reporting use soft deletion
(`influencers.archivedAt`, `campaigns.archivedAt`) rather than row removal. Audit log and uploaded
import file retention windows are administrator-configurable in `app_settings`; deleting either is
itself an audited administrative action.
