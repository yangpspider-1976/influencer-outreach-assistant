# UAT checklist and requirement traceability

Maps every acceptance criterion (§20), functional requirement (§6) and security requirement (§15)
to where it is implemented and how it was verified.

**Last run:** 22 July 2026 · **Result:** 112/112 unit tests, 69/69 end-to-end checks.

---

## How to reproduce the verification

```bash
# Unit suite — pure business logic
npm test

# End-to-end walkthrough — drives the HTTP API as all four roles
docker compose up -d db
npm run db:migrate && npm run db:seed
npm run build && npm run start        # or: npx next start -p 3311
node scripts/acceptance-walkthrough.mjs
```

The walkthrough signs in as administrator, campaign manager, operator and viewer; creates and
activates a campaign; imports a CSV exercising every §8 validation rule; assigns work; runs the full
outreach loop; completes and cancels follow-ups; moves the pipeline; exports data; and asserts every
negative authorization case.

---

## Acceptance criteria (§20)

| ID | Condition | Verified by | Result |
| --- | --- | --- | --- |
| **AC-001** | A manager can create and activate a valid campaign | E2E: create → activate. Also asserts end-before-start is rejected (`422`) and that a campaign with no approved template cannot activate (`NOT_READY`). | **Pass** |
| **AC-002** | A manager can import XLSX/CSV, see row-level validation, and commit selected rows | E2E: upload → auto-mapping → validation classifying 6 rows → error-file download → transactional commit of the selected rows. | **Pass** |
| **AC-003** | The system reuses existing influencers when the normalized platform URL already exists | Unit: 8 Instagram and 4 Facebook URL variants collapse to one dedupe key. E2E: re-importing `instagram.com/UATCREATOR…?igshid=xyz` matches the existing creator (`LINKED_EXISTING`) instead of creating a duplicate. | **Pass** |
| **AC-004** | DNC records cannot enter the outreach queue without an authorized, logged override | E2E: bulk assignment reports the DNC record as blocked; it is absent from the operator queue; a campaign manager's override attempt is `403`; an administrator override succeeds and is audited; an override with a 2-character reason is `422`. Unit: `requiresDncOverride`. | **Pass** |
| **AC-005** | An operator can render, edit, copy and open the correct profile from one workspace | E2E: workspace payload returns campaign summary, creator, profiles, history, rendered message and skip reasons. UI: Copy Message, Open Instagram / Open Facebook, editable text with Reset to Template. | **Pass** |
| **AC-006** | Opening or copying does not automatically mark a record Sent | E2E: status is `READY` before and after both a copy event and a profile-open event; only the analytics timestamps change. | **Pass** |
| **AC-007** | Mark Sent stores channel, exact confirmed message, user and timestamp | E2E: the stored `confirmedSentText` matches the operator-edited text exactly, with channel `INSTAGRAM`, the operator's name and `sentConfirmedAt`. Guards verified: missing confirmation → `422`, unresolved variables → `422`. | **Pass** |
| **AC-008** | After a saved outcome, the next eligible record loads correctly | E2E: the outcome response returns a `nextRecordId` resolved only after the save committed. | **Pass** |
| **AC-009** | Follow-up tasks are created, displayed, completed and cancelled according to rules | E2E: 2 reminders created on Sent; visible to the assigned operator; completed successfully; remaining reminders cancelled automatically when the record moved to Replied. Unit: day 3 / day 7 scheduling, 2-reminder cap, cancellation statuses, No Response closure. | **Pass** |
| **AC-010** | The campaign dashboard matches independently verified test data | Unit: a hand-calculated 60-record fixture asserts every §17 formula. E2E: report figures recomputed independently from the raw status counts and compared. | **Pass** |
| **AC-011** | CSV/XLSX export contains the selected filtered records and is protected against formula injection | E2E: export contains exactly the campaign's records; a `=HYPERLINK(...)` payload stored in a creator's notes appears prefixed with an apostrophe and no cell begins with `=`. Unit: 6 formula payloads. | **Pass** |
| **AC-012** | Role and campaign access restrictions pass negative authorization tests | E2E: 9 negative cases (see the security review table) all return `403`. Unit: permission matrix and scope ladder. | **Pass** |
| **AC-013** | Audit history identifies all important status, DNC, assignment, export and permission actions | E2E: 19 distinct audited actions present, including every required one; status changes carry previous and new values; entries carry actor and session id; an operator's audit view is limited to their own actions. | **Pass** |
| **AC-014** | No feature performs automated first-contact actions inside Facebook or Instagram | Code review: no browser-automation dependency, no Meta DOM access, no credential storage. Profile launch is `window.open` with a plain-link fallback; copy uses the Clipboard API after a click. See `SECURITY_REVIEW.md` §2. | **Pass** |
| **AC-015** | Deployment, migration, backup, restore and administrator documentation is delivered and tested | `README.md`, `ADMIN_GUIDE.md`, `BACKUP_RESTORE.md`, `Dockerfile`, `docker-compose.yml`, versioned migrations and a seed script. Migration verified on a fresh database; the restore drill is scripted with a verification checklist for the operations team to execute in their environment. | **Delivered** |

---

## Functional requirements (§6)

| ID | Requirement | Where | Status |
| --- | --- | --- | --- |
| FR-001 | Sign-in required before any campaign or influencer data | `proxy.ts`, `requireUser()` | Done |
| FR-002 | Server-side role and campaign enforcement on every action | `lib/rbac.ts`, `lib/api.ts`, every route handler | Done |
| FR-003 | Campaign create/edit with all required fields | `lib/campaign-service.ts`, `components/campaign-form.tsx` | Done |
| FR-004 | Draft / Active / Paused / Completed / Archived | `CampaignStatus` enum, status control | Done |
| FR-005 | Reusable templates with versioning, status, language, platform, variables | `message_templates`, `template_versions` | Done |
| FR-006 | Template preview with sample data before approval | `components/template-editor.tsx` | Done |
| FR-007 | Accept `.xlsx` and `.csv` up to a configurable size | `lib/import-parse.ts` | Done |
| FR-008 | Column mapping to system fields | `suggestMapping`, import wizard step 2 | Done |
| FR-009 | Valid / warning / rejected preview before import | `validateRow`, import wizard step 3 | Done |
| FR-010 | URL normalization preserving the original value | `lib/social-url.ts` | Done |
| FR-011 | Duplicate detection in file, database and campaign | `validateRow`, `enrichRows`, unique index | Done |
| FR-012 | Full influencer record incl. DNC flag | `influencers`, `social_profiles` | Done |
| FR-013 | Campaign audience with campaign-specific status | `campaign_influencers` | Done |
| FR-014 | Individual and bulk assignment | `POST /campaigns/{id}/assign` | Done |
| FR-015 | Variable replacement with unresolved highlighting | `lib/template.ts`, workspace warning banner | Done |
| FR-016 | Operator may edit rendered text; base template unchanged | Workspace editor; templates are immutable versions | Done |
| FR-017 | Clipboard copy with success/failure feedback | `copyPlainText` + selectable-text fallback | Done |
| FR-018 | Open profile in a new tab via a normal link action | `openProfile` + anchor fallback | Done |
| FR-019 | Operator must record the result; never inferred | Outcome endpoint requires explicit affirmation | Done |
| FR-020 | Load the next eligible record without losing unsaved work | `loadNextQueueRecord`, unsaved-changes guard, local draft | Done |
| FR-021 | Full 13-value status model | `lib/status.ts` | Done |
| FR-022 | Configurable follow-up tasks, cancelled on reply/decline/DNC | `lib/follow-up.ts` | Done |
| FR-023 | Influencer campaign and outreach history | Workspace history panel, influencer detail page | Done |
| FR-024 | Audit log with actor, action, values, session, timestamp | `lib/audit.ts`, `audit_logs` | Done |
| FR-025 | Dashboard funnel, daily progress, operator and response metrics | `lib/reports-service.ts`, dashboard and reports | Done |
| FR-026 | Export filtered data to CSV or XLSX | `lib/export-service.ts` | Done |
| FR-027 | Block DNC preparation and copying without an audited override | Queue filter, copy guard, override endpoint | Done |
| FR-028 | Filter by campaign, operator, status, channel, category, location, date, keyword | List and audience filters | Done |
| FR-029 | Bulk assignment, status prep, tagging, export — **no bulk send** | Assignment endpoint; no bulk-send path exists | Done |
| FR-030 | In-app reminders for overdue outreach and follow-ups | Sidebar badges, dashboard, follow-up queue | Done |
| FR-031 | AI variation *(Optional)* | Not implemented — see `KNOWN_LIMITATIONS.md` | Deferred |
| FR-032 | Email channel *(Future)* | Not implemented — out of MVP scope | Deferred |

---

## Security requirements (§15)

| ID | Status |
| --- | --- |
| SEC-001 … SEC-012 | All implemented — evidence per control in `SECURITY_REVIEW.md` §1 |

---

## Manual UAT script

Run this in staging with realistic data before sign-off. Sign in as the role named in each step.

### Campaign manager
- [ ] Create a campaign with all required fields; confirm an end date before the start date is refused
- [ ] Try to activate before selecting an approved template; confirm the blocker is explained
- [ ] Approve a template, select it, activate the campaign
- [ ] Import `docs/sample-influencer-list.csv`; confirm the classification of all 12 rows:
      valid rows import, the TikTok and YouTube rows are accepted, the duplicate is
      pre-deselected, the unsupported-domain row and empty row are rejected, and the email-only
      creator is stored but not queued
- [ ] Download the validation error file before committing
- [ ] Commit; confirm the counts (imported / new / linked / added to campaign)
- [ ] Assign records to two operators and mark them Ready
- [ ] Confirm the do-not-contact creator is reported as blocked and never assigned

### Operator (two operators, in parallel)
- [ ] Open the workspace; confirm the campaign summary matches the brief
- [ ] Confirm the message renders with no unresolved variables
- [ ] Edit the opening line; confirm Reset to Template restores it
- [ ] Copy the message and open both profiles; confirm the status has **not** changed
- [ ] Try Mark Sent without ticking the confirmation; confirm it is refused
- [ ] Paste `{{unfilled}}` into the message and try Mark Sent; confirm the explicit warning
- [ ] Mark Sent; confirm follow-ups are scheduled and the next record loads
- [ ] Skip a record; confirm a reason is required
- [ ] Mark one Invalid account and one Do not contact
- [ ] Have both operators open the same record; confirm the second is told it is locked
- [ ] Complete a follow-up from the follow-up queue
- [ ] Confirm you cannot see another operator's records

### Administrator
- [ ] Override a do-not-contact record with a written reason; confirm it is audited
- [ ] Try an override with a 3-character reason; confirm it is refused
- [ ] Change a role permission scope; confirm it takes effect and is audited
- [ ] Disable an account while that user is signed in; confirm they are signed out immediately
- [ ] Export campaign records to CSV **and** XLSX; open both in Excel and confirm no formula executes
- [ ] Review the audit log for the whole session

### Viewer
- [ ] Confirm dashboards and reports are readable
- [ ] Confirm no create, edit, assign, outreach or audit access

### Cross-cutting
- [ ] Repeat the operator loop in Chrome and Edge at 1280px, 1440px and 1920px
- [ ] Block clipboard permission; confirm selectable-text fallback
- [ ] Block popups; confirm the direct profile link appears
- [ ] Go offline mid-save; confirm the retry prompt and that the queue does **not** advance
- [ ] Leave a session idle past the timeout; confirm re-authentication and draft preservation

---

## Sign-off

| | |
| --- | --- |
| UAT executed by | _________________________ |
| Date | _________________________ |
| Campaign used | _________________________ |
| Influencer count (≥ 50 required) | _________________________ |
| Operators involved (≥ 2 required) | _________________________ |
| Defects raised / resolved | _________________________ |
| Accepted by (QROAD) | _________________________ |
