# Known limitations and future roadmap

Current state of the MVP at first delivery, and what is deliberately out of scope.

---

## 1. Deliberate product boundaries

These are not defects. They are the reason the product is safe to operate.

| Boundary | Why |
| --- | --- |
| The operator sends every first-contact DM by hand | Meta requires a person-initiated conversation before API messaging. Automating it would mean building an unauthorized bot. |
| No Meta login, cookies or session storage | §16 blocks it outright, and it removes an entire class of account-compromise risk. |
| Follower counts are imported, never collected from a profile page | Scraping is restricted by the Instagram Terms of Use. Every follower figure in the UI is labelled "supplied". |
| "Sent" means an operator confirmed sending | Without an authorized integration, no delivery or read receipt exists. The field is `sentConfirmedAt`, not `deliveredAt`. |
| No "safe daily DM limit" anywhere in the product | Platform limits vary and are never guaranteed. Publishing a number would be a false assurance. |
| No bulk send | Bulk assignment, tagging, status preparation and export are supported. Bulk sending is not, by design. |

---

## 2. Not implemented in the MVP

### Marked Optional or Future in the work order

| Requirement | Status | Notes |
| --- | --- | --- |
| **FR-031** AI-assisted message variation | Not implemented | The workspace already supports free-form editing, which covers the underlying need. Add behind an approved prompt with mandatory operator review. |
| **FR-032** Email outreach channel | Not implemented | Explicitly a separate future integration. Email addresses are captured and exportable today. |
| Single sign-on | Not implemented | Email/password with Argon2id and epoch-based invalidation. The design is SSO-ready. |
| Client portal and client-facing approvals | Not implemented | The Viewer role covers read-only client service internally. |
| Direct creator-platform / Creator Marketplace integrations | Not implemented | Requires separate policy and legal review. |
| Profile enrichment | Partially implemented | Creator discovery can find public profile links through a configured web-search provider. YouTube video hits may be resolved to their public creator name and channel URL through oEmbed, but the app never scrapes profile pages or collects follower/contact data. |
| Calendar and Slack notifications | Not implemented | In-app badges and the follow-up queue cover reminders. |
| Billing, payment settlement, contracts | Not implemented | Out of MVP scope. |
| Advanced profitability / creator-performance analytics | Not implemented | Campaign funnel, operator productivity and CSV/XLSX export are available for external analysis. |

### Additional MVP gaps

| Gap | Impact | Recommendation |
| --- | --- | --- |
| No multi-factor authentication | Medium | Design is MFA-ready. Add TOTP before wider rollout. |
| No login rate limiting or account lockout | Medium | Failures are audited but not throttled. Add per-IP and per-account limits at the edge. |
| No self-service password reset | Low | Administrators issue passwords out of band. Add email-based reset once a mail service is approved. |
| Retention windows configurable but not auto-enforced | Low | `retention.audit_log_days` and `retention.import_file_days` are stored and editable; add a scheduled purge job before the first window elapses. |
| Background exports run in-process | Low | A restart mid-job leaves it `PENDING`. Move to a durable queue if volume grows. |
| Influencer merge is not exposed in the UI | Low | Deduplication happens automatically on normalized URL, so true duplicates are rare. Merge remains a manual database task. |
| Campaign brief file upload is modelled but has no UI | Low | The schema, private storage and authorized streaming exist; only the upload control is missing. Authorized brief URLs work today. |
| Single campaign location per campaign | Low | The work order anticipates multiple locations later; the field is a single text value today. |
| No automated browser (UI) test suite | Medium | Logic is covered by 112 unit tests and the API by a 69-check end-to-end walkthrough. Browser flows are covered by the manual UAT script. Add Playwright once the UI stabilizes. |
| Pipeline board moves via a dropdown, not drag-and-drop | Cosmetic | The dropdown is keyboard-accessible and only offers legal transitions, which drag-and-drop would not. |

---

## 3. Operational notes

- **`SESSION_SECRET` must stay stable across releases.** Changing it signs everyone out.
- **Never run `npm run db:seed` against production.** It creates demo accounts with a published
  password.
- **Delete or disable the `*@qroad.test` demo accounts** before any non-local deployment.
- **The clipboard needs a secure context.** Over plain HTTP the workspace falls back to
  selectable text, which is slower for operators. Serve production over TLS.
- **Imports are capped** at `MAX_UPLOAD_MB` (10) and `MAX_IMPORT_ROWS` (5000). Split larger lists or
  raise the limits deliberately.
- **The processing lock is 15 minutes.** A record abandoned mid-edit returns to the queue after that.

---

## 4. Suggested roadmap

**Phase 6 — Hardening**
MFA or SSO, login rate limiting, scheduled retention enforcement, Playwright browser tests across
Chrome and Edge.

**Phase 7 — Operator efficiency**
Keyboard shortcuts for the queue loop, saved queue filters, influencer merge UI, campaign brief file
upload, bulk tagging.

**Phase 8 — Reach (requires policy review)**
Approved AI personalization (FR-031) with mandatory operator review; an authorized email channel
(FR-032); official Meta or Creator Marketplace integration as a separately reviewed feature.

**Phase 9 — Commercial**
Client portal with approvals, profitability analytics, contract and payment tracking.

---

## 5. Policy review obligation

The compliance boundary in this document reflects Meta's published requirements as of the delivery
date. Before every production release, and after any major platform change, re-check:

- Meta — Send a Message
- Meta — Messenger Platform and Instagram Messaging API Policy
- Instagram Terms of Use
- Instagram Messaging documentation

Record the review date and reviewer in `SECURITY_REVIEW.md`. Any proposal to automate interaction
with the Facebook or Instagram user interface must be rejected or submitted for formal policy and
legal review before development.
