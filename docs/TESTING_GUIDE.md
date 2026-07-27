# Manual testing guide

This guide lets a tester verify the QROAD Influencer Outreach Assistant without having to interpret the product requirements. Complete the tests in order: several later tests rely on data created earlier.

For every test, record **Pass**, **Fail**, or **Blocked**, along with a screenshot or the exact error shown when it fails.

## Contents

- [1. Prepare the test environment](#1-prepare-the-test-environment)
- [2. Test accounts and demo data](#2-test-accounts-and-demo-data)
- [3. Manual test checklist](#3-manual-test-checklist)
- [4. Error and edge-case tests](#4-error-and-edge-case-tests)
- [5. Permission tests](#5-permission-tests)
- [6. Automated checks](#6-automated-checks)
- [7. Reset and troubleshooting](#7-reset-and-troubleshooting)

---

## 1. Prepare the test environment

Run these commands from the project folder. The setup creates a local database, loads predictable demo data, and starts the website.

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Copy the generated value into SESSION_SECRET in .env

docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` in your browser. Before starting the checklist, confirm that the application and database are available:

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","database":"reachable"}
```

If the response says `degraded`, start Docker Desktop and run `docker compose up -d db` again.

### Test in separate browser sessions

Use an incognito window, a second browser, or separate browser profiles when testing two users at once. Two tabs in one profile share the same sign-in session and cannot test separate roles.

---

## 2. Test accounts and demo data

All demo users have the password **`QroadDemo!2026`**.

| Account | Role | Use it for |
| --- | --- | --- |
| `admin@qroad.test` | Administrator | User administration, do-not-contact overrides, audit log |
| `manager@qroad.test` | Campaign Manager | Campaigns, imports, templates, assignment, reports |
| `operator1@qroad.test` | Operator — Carlo Mendoza | Outreach workspace and follow-ups |
| `operator2@qroad.test` | Operator — Dana Villanueva | Concurrent-work testing |
| `viewer@qroad.test` | Viewer | Read-only permission checks |

The seeded data includes:

- An active campaign: **ABC Korean Restaurant Creator Visit** with 56 records.
- A draft campaign: **ABC Korean Restaurant - Makati Soft Launch** with 8 records.
- An approved template: **Restaurant creator visit - first contact** (version 1).
- Two do-not-contact creators: **Trisha Manalo** and **Renz Fernandez**.
- The import fixture: `docs/sample-influencer-list.csv`.

> In development, the sign-in page has a **Development only** account picker. It fills the email and password, but you must still select **Sign in**.

---

## 3. Manual test checklist

### MT-01 — Sign in and sign out

**Account:** Manager (`manager@qroad.test`)

| Step | What to do | Sample input | Expected result |
| --- | --- | --- | --- |
| 1 | Open `/dashboard` while signed out. | URL: `http://localhost:3000/dashboard` | You are redirected to `/login?next=%2Fdashboard`. |
| 2 | Try a failed sign-in. | Email: `manager@qroad.test`<br>Password: `wrong-password` | A red error says **“The email or password is incorrect.”** You remain on the login page. |
| 3 | Sign in successfully. | Email: `manager@qroad.test`<br>Password: `QroadDemo!2026` | The dashboard opens and greets **Bianca**. |
| 4 | Use **Sign out** in the sidebar, then press the browser Back button. | — | You return to login and cannot reopen an authenticated page with Back. |

### MT-02 — Dashboard values

**Account:** Manager

1. On the dashboard, confirm these summary values:

   - Active campaigns: **1**
   - Do-not-contact records: **2**
   - Follow-ups due: **9**
   - Creator Visit card: **42 of 56 done**
   - Soft Launch card: **0 of 8 done**

2. Confirm the funnel shows **Sent 37**, **Reply rate 59.5%**, **Interest rate 68.2%**, and **Confirmed 6 (16.2%)**. The funnel segments must total 56.
3. Sign out and sign in as `operator1@qroad.test`. The dashboard should show **Ready in your queue: 9** instead of manager-level totals.

### MT-03 — Create and activate a campaign

**Account:** Manager

1. Go to **Campaigns → New campaign**.
2. First verify date validation:

   | Field | Sample input |
   | --- | --- |
   | Campaign name | `Manual Test Dinner — July 2026` |
   | Client | `ABC Korean Restaurant` |
   | Location | `Makati City` |
   | Visit start | `2026-07-20` |
   | Visit end | `2026-07-19` |
   | Deliverables | `1 Instagram Reel and 3 Story frames` |
   | Compensation | `PHP 3,000 dining credit` |

   Select **Save**. Expected: **“The visit end date must be on or after the start date.”**

3. Change **Visit end** to `2026-07-21`, leave **Default message template** empty, and save. Expected: the campaign is created with a **Draft** badge.
4. Select **Activate campaign**. Expected: the button is unavailable or activation is blocked with **“Select a default message template before activating.”**
5. Open the campaign settings and select **Restaurant creator visit - first contact** as the default template. Save, then activate the campaign. Expected: the badge changes to **Active**.
6. Optional warning check: set **Application deadline** to `2026-01-01` and activate. Expected: activation succeeds but displays a warning that the deadline is already in the past.

### MT-04 — Import creators

**Account:** Manager. **Campaign:** ABC Korean Restaurant Creator Visit.

1. Select **Import list** and upload `docs/sample-influencer-list.csv`.
2. On the mapping step, confirm every header is mapped automatically. Change one optional column to **Not mapped**, then validate again; that column should be ignored.
3. On validation, confirm the summary is exactly:

   > **Total rows: 10 · Valid: 6 · Warning: 2 · Rejected: 2 · Selected for import: 7**

4. Confirm these examples appear in the row results:

   | Creator / row | Expected result |
   | --- | --- |
   | Maria Santos, Jose Reyes, Ana Cruz, Paolo Bautista (rows 2–5) | Valid. Paolo’s Facebook numeric profile ID is retained. |
   | Bea Ocampo (row 6) | Informational message: extra URL path was removed to reach the profile. |
   | Miguel Garcia (row 7) | Informational messages: the `@miguelgarciaeats` handle was reconstructed and `50k-80k` remains raw follower text. |
   | Camille Mendoza (row 8) | Duplicate warning; its checkbox is deselected by default. |
   | Rafael Torres (row 9) | Rejected because `tiktok.com` is not supported; the checkbox is disabled. |
   | Isabel Villanueva (row 10) | Warning because no social profile was supplied; it can be stored but not queued. |
   | Empty row (row 11) | Rejected because it has no name or usable profile URL. |

5. Select **Download error file**. Expected: a CSV downloads containing all warnings and rejections.
6. Select **Commit 7 rows**. Expected: **Imported 7 · New creators 7 · Linked to existing 0 · Added to campaign 6 · Blocked (DNC) 0**. Isabel is saved as a creator but is not added to the outreach queue.
7. Test duplicate matching by importing a one-row CSV with this exact content:

   ```csv
   influencer_name,instagram_url,category
   Maria Santos Renamed,https://instagram.com/EXAMPLECREATOR?igshid=abc123,Food
   ```

   Expected: the import identifies the existing **Maria Santos** and says the creator is already in the campaign; no duplicate is created.

### MT-05 — Assign creators to an operator

**Account:** Manager. **Campaign:** ABC Korean Restaurant Creator Visit.

1. Open the **Audience** tab and filter **Status = Do Not Contact**.
2. Select both displayed records, choose an operator such as **Carlo Mendoza**, and select **Assign & mark ready**. Expected: the action is refused because do-not-contact records require an administrator override.
3. Change the filter to **Not Contacted**. Select several records, choose **Carlo Mendoza**, and select **Assign & mark ready**. Expected: selected records become **Ready to Send** and Carlo’s queue count increases.
4. Confirm there is no bulk-send action. The application must require an operator to send each outreach message manually.

### MT-06 — Send outreach from the workspace

**Account:** Operator 1 (`operator1@qroad.test`)

1. Open **Outreach workspace**. Confirm the creator name, current status, supplied follower count, campaign summary, and a fully rendered message. There must be no unresolved `{{token}}` values in the initial template text.
2. Select **Copy message**, then paste into a text editor. Expected: a green **“Message copied”** notification and plain text in the editor.
3. Select **Open Instagram** or **Open Facebook**. Expected: the profile opens in a new tab.
4. Reload the workspace. Expected: the outreach status has **not** changed. Only activity timestamps such as Last copied or Last profile open may have updated.
5. Test the send safeguards:

   | Action | Sample input | Expected result |
   | --- | --- | --- |
   | Try to send without confirming | Leave the send-confirmation checkbox clear. | **Mark sent** is disabled. |
   | Add an unresolved token | Add `{{test}}` at the end of the message, tick the first checkbox, then select **Mark sent**. | An amber unresolved-variable warning and a second confirmation checkbox appear. Nothing saves until the second box is ticked. |
   | Send an edited message | Replace the opening with `Hi! We would love to invite you to an ABC Korean Restaurant creator visit.` Tick the confirmation box and select **Mark sent**. | The record saves and a toast confirms **2 follow-up reminders scheduled**. |

6. Select **Reset to template** on another unsent record. Expected: your changes are discarded and the original template returns.
7. After a successful send, confirm the next record opens automatically and the “left in your queue” count decreases by one.
8. Reload the sent record. Expected: attempt history includes outcome `sent`, the channel, your name, timestamp, and the exact edited message.
9. On suitable records, also test **Skip**, **Invalid account**, **Duplicate**, and **Do not contact**. For Skip, use a sample reason such as `Creator only accepts paid collaborations.` Expected: a reason is required, and marking do-not-contact affects the creator in every campaign.

### MT-07 — Follow-up workflow

**Account:** Operator 1

1. Open **Follow-up queue** and set the filter to **Due now**. Expected: around **3 due** (the exact number depends on the seed dates).
2. For one task, select **Copy previous** and paste into a text editor. Expected: it copies the earlier sent message for adaptation.
3. Select **Open profile**. Expected: the creator’s social profile opens.
4. On **Cielo Padilla**’s card, select **I sent it**. Expected: the task is marked complete and the queue count drops by one.

   > **I sent it** records that *you* sent the follow-up — it does not mean the creator replied. The creator does **not** leave the campaign: their status becomes **Sent**, and they move to the **Sent · awaiting reply** column on the pipeline board (verified in MT-08). Recording an actual reply is a separate action, also in MT-08.

### MT-08 — Pipeline board and recording a reply

**Account:** Manager. **Campaign:** ABC Korean Restaurant Creator Visit.

The board is the full recruitment funnel: a leading **Sent · awaiting reply** column feeds the six pipeline lanes.

1. Open **Pipeline board** and confirm the columns and initial counts (on freshly seeded data):

   | Column | Expected count |
   | --- | ---: |
   | Sent · awaiting reply | 11 |
   | Replied | 4 |
   | Interested | 5 |
   | Negotiating | 4 |
   | Confirmed | 6 |
   | Declined | 3 |
   | No Response | 4 |

   > The **Sent · awaiting reply** column holds creators who have been messaged but have not yet replied (statuses *Sent* and *Follow-up Due*). Each card shows which of the two it is. Completing a follow-up in MT-07 keeps the creator in this column, so the count stays 11.

2. Find **Cielo Padilla** in **Sent · awaiting reply** (this is the creator you completed a follow-up for in MT-07 — confirm they are here, not missing). On the card, open **Move to…** and choose **Replied**. Expected: Cielo moves to the **Replied** lane; the Sent count drops to 10 and Replied rises to 5.
3. On any card, open **Move to…**. Expected: only valid next statuses are listed. For example, a Confirmed card must not offer **Ready to Send**.
4. Verify that a reply cancels pending reminders. Find a card labelled **Follow-up Due** in the Sent column (for example **Denise Salazar**) and move it to **Replied**. Then sign in as **Operator 1**, open the **Follow-up queue**, and confirm that creator’s reminder is gone — moving to Replied cancelled it automatically.

### MT-09 — Templates

**Account:** Manager

1. Open **Message templates** and select **Restaurant creator visit - first contact**.
2. Use a token button to insert a variable such as `{{creator_first_name}}`. Expected: the live preview updates using sample creator data.
3. Add `{{nonexistent}}` to the message. Expected: the preview warns that it is unknown and will not resolve.
4. Change an application-deadline line to `Application deadline: {{application_deadline?}}`, then clear the deadline sample value. Expected: the entire line disappears from the preview because the token is optional.
5. Select **Save new version**. Expected: version 2 appears in history and the new version is **Draft**.
6. Attempt to activate a campaign using that version. Expected: activation is blocked until the template version is approved. Approve it, then confirm the campaign can be activated.

### MT-10 — Influencer database and do-not-contact

**Account:** Manager, then Administrator

1. Open **Influencers** and search `denise`. Expected: matching creators appear. Search using part of a profile URL, such as `instagram.com`, to confirm URL-fragment search also works.
2. Filter **Do not contact only**. Expected: exactly **2** seeded creators appear.
3. Open a creator. Expected: profile fields, tags, social links, campaign history, and past attempts are visible.
4. Select **Mark do not contact** and enter a reason.

   | Field | Sample input |
   | --- | --- |
   | Reason | `Creator asked not to receive future campaign invitations.` |

   Expected: open outreach records are withdrawn and pending follow-ups are cancelled.

5. Still as Manager, confirm **Clear do-not-contact** is not available.
6. Sign in as Administrator and open the same creator. Try to clear the flag with `Too short`. Expected: the reason is rejected because it is fewer than 10 characters. Use `Creator contacted support and opted back in.` Expected: the flag can be cleared.

### MT-11 — Reports and safe export

**Account:** Manager. **Campaign:** ABC Korean Restaurant Creator Visit.

1. Open **Reports** and confirm these initial seeded values:

   | Metric | Expected | Calculation check |
   | --- | ---: | --- |
   | Outreach completion | 77.8% | 42 completed ÷ 54 assigned |
   | Reply rate | 59.5% | 22 replied-or-later ÷ 37 sent |
   | Interest rate | 68.2% | 15 interested-or-later ÷ 22 replied |
   | Confirmation rate | 16.2% | 6 confirmed ÷ 37 sent |
   | Invalid rate | 4.8% | 2 invalid ÷ 42 processed |
   | Follow-up completion | 59.1% | completed ÷ due tasks |

2. Confirm productivity totals: **Dana Villanueva: 27 assigned / 19 completed** and **Carlo Mendoza: 27 assigned / 18 completed**.
3. Confirm Declined is counted as a reply, so replied-or-later is 22 rather than 19.
4. To test spreadsheet safety, open any creator and set **Notes** to this sample input:

   ```text
   =HYPERLINK("http://evil.test","click")
   ```

5. Export campaign records as CSV and open it in Excel. Expected: the cell is literal text with a leading apostrophe; Excel does not evaluate a formula or request an external link.
6. Repeat the export as XLSX. Expected: the same protection is applied and only records from the selected campaign are included.

### MT-12 — Audit log

**Account:** Administrator, then Operator 1

1. Open **Audit log** after completing several tests above. Expected: your actions appear with an actor, session ID, timestamp, and old → new values for status changes.
2. Filter by a record type and search by actor name, such as `Carlo Mendoza`. Expected: filters narrow the log correctly.
3. Sign in as Operator 1 and open the audit log. Expected: only Operator 1’s own actions are visible; other operators’ activity is never exposed.

---

## 4. Error and edge-case tests

These tests verify that a problem does not silently lose work or bypass a business rule.

| Test | How to perform it | Expected result |
| --- | --- | --- |
| Clipboard blocked | In Chrome site settings, block Clipboard for `localhost`; reload Outreach workspace; select **Copy message**. | An amber panel provides the message in a selectable textarea and explains how to copy it manually. |
| Pop-up blocked | Block pop-ups for `localhost`, then select **Open Instagram**. | A notification appears and a normal clickable profile link is shown below the buttons. |
| Concurrent edit | In separate sessions, have Operator 1 open a record without saving. Have Admin change the same record’s status, then have Operator 1 select **Mark sent**. | Operator sees **“This record was changed by someone else”**; nothing saves and **Refresh record** is available. |
| Processing lock | Assign the same record to both operators. Have both open it within 15 minutes. | The second operator sees **“Another operator is currently working on this record.”** |
| Network failure | In browser DevTools → Network, select **Offline**. Edit a message and select **Mark sent**. | A red error appears; text remains available, the queue does not advance, and **Retry** is offered. Return online and retry to save. |
| Session expiry | Set `SESSION_IDLE_TIMEOUT_MINUTES=1` in `.env`, restart, sign in, wait about 90 seconds, then perform an action. | Redirected to `/login?expired=1`; edited text is preserved locally where possible. |
| Disabled user | With Operator 1 active, have Admin disable the account. Have Operator 1 perform any action. | The next request returns 401 immediately. |
| Bad upload type | Rename a `.php` or `.exe` file to look like an upload and attempt import. | **“Only .xlsx and .csv influencer lists are accepted.”** |
| Oversized upload | Upload a file larger than 10 MB. | Upload is rejected with the size limit. |
| Too many rows | Upload a CSV with more than 5,000 data rows. | Upload is rejected with the row limit. |
| Import rollback | During a large import, stop the database with `docker compose stop db`. | The app reports that the import was rolled back; no partial rows exist after the database restarts. |

---

### MT-13 — Reset and reseed the demo data

**Account:** Administrator (`admin@qroad.test`)

This is the fastest way to return to a known state after the earlier tests have changed the data. It is destructive, so it is guarded four ways.

1. Sign in as Manager and open `/admin`. Expected: you are redirected to the dashboard — the danger zone is administrator-only.
2. Sign in as Administrator, open **Administration**, and scroll to **Danger zone — reset demo data**.
3. Confirm **Reset and reseed** is unavailable while the confirmation box is empty.
4. Type `reset demo data` (lower case). Expected: the button stays unavailable and a hint says **“The phrase must match exactly.”**
5. Type `RESET DEMO DATA` exactly. Expected: the button becomes available.
6. Select **Reset and reseed**. Expected: a success message reads **“Demo data rebuilt — 2 campaigns · 56 influencers · 64 campaign records · 74 follow-up tasks.”**
7. Confirm the effects:

   | Check | Expected result |
   | --- | --- |
   | Campaigns list | Only the two seeded campaigns remain; anything you created during testing is gone. |
   | Your session | You are still signed in — user accounts, roles and settings are preserved. |
   | Dashboard values | Back to the MT-02 numbers exactly (Sent 37, Reply rate 59.5%, Confirmed 6). |
   | Audit log | A new `admin.demo_data.reset` entry recorded against your account. |

> The reset deletes campaigns, influencers, outreach records, follow-ups, imports, exports and the audit log. It preserves user accounts, roles, permissions, organization settings and skip reasons.

> **Production safety.** The action is blocked when the app runs in production, returning `RESET_DISABLED_IN_PRODUCTION`. It can only be enabled on a disposable environment by setting `ALLOW_DEMO_RESET=true`. Never set that on a database holding real campaigns.

---

## 5. Permission tests

Sign in with the listed role and attempt each action by typing the URL or using the UI. A missing button is helpful, but the server response is the security control.

| Role | Attempt | Sample URL / action | Expected result |
| --- | --- | --- | --- |
| Operator | Create campaign | `/campaigns/new` | Redirected away; API returns 403. |
| Operator | Open another operator’s record | `/outreach?record=<record-id-assigned-to-operator2>` | 403: **“This outreach record is not assigned to you.”** |
| Operator | Open admin area | `/admin` | Redirected; no Administration link. |
| Operator | Export data | Use any export control or API endpoint. | 403. |
| Viewer | Open outreach workspace | `/outreach` | Redirected; no workspace link. |
| Viewer | Open audit log | `/audit` | Redirected. |
| Manager | Override a do-not-contact record | Attempt the override from a DNC record. | 403; administrator only. |
| Manager | Promote a user | Attempt to change a user role to Administrator. | 403. |
| Manager | Reset demo data | POST `/api/admin/reset-demo-data` | 403: administrator only. |
| Operator | Reset demo data | POST `/api/admin/reset-demo-data` | 403. |
| Viewer | Reset demo data | POST `/api/admin/reset-demo-data` | 403. |

For a direct server check, use an Operator session cookie from browser DevTools and run:

```bash
curl -i -X POST http://localhost:3000/api/campaigns \
  -H 'content-type: application/json' \
  -H 'cookie: qroad_session=<operator-cookie-from-DevTools>' \
  -d '{"name":"Should not work","clientName":"Example Client","location":"Makati City", "visitStart":"2026-09-10","visitEnd":"2026-09-20", "deliverables":"1 post","compensation":"PHP 1000","ownerId":"example-owner-id"}'
# Expected: HTTP/1.1 403 Forbidden
```

---

## 6. Automated checks

Automated checks are a fast complement to the manual tests; they do not replace the manual verification of browser behaviour and workflows.

| Check | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | 7 files and 112 tests passing. |
| Acceptance tests | Start the app with `npm run build && npm run start`, then run `npm run test:acceptance` in another terminal. | 69/69 checks passing. |
| Browser UI smoke test | Run `npx playwright install chromium` once. Start the production app, then run `npm run test:ui`. | 32/32 checks passing with no page, console, or 5xx errors. |
| Type check | `npm run typecheck` | No output or errors. |
| Lint | `npm run lint` | No output or errors. |
| Dependency audit | `npm audit` | No known vulnerabilities. |

Useful UI-test options:

```bash
SHOTS=./shots npm run test:ui   # saves screenshots
BROWSER=msedge npm run test:ui  # uses Microsoft Edge
```

---

## 7. Reset and troubleshooting

### Reset the demo data

Manual testing and the acceptance suite both leave data behind — the latter creates rows whose names begin with `UAT `. There are two ways to get back to the seeded state.

**From the app (recommended).** Sign in as Administrator, open **Administration → Danger zone**, type `RESET DEMO DATA` and select **Reset and reseed**. This wipes campaign and influencer data and rebuilds the demo dataset in a few seconds. You stay signed in, because user accounts, roles and settings are preserved. See [MT-13](#mt-13--reset-and-reseed-the-demo-data).

**From the command line.**

```bash
npm run db:demo-reset  # same as the admin button: wipe campaign data, rebuild the demo set
npm run db:reset       # heavier — drops, migrates and re-seeds, including users and roles
npm run db:seed        # adds missing seeded data without deleting anything
```

Run `npm run db:demo-reset` before `npm run test:ui`: several UI checks assert the exact counts the seed produces, so they fail if earlier testing changed the data. The acceptance suite creates its own data and needs no reset.

Both are destructive: use them only against local test data, never a real campaign database. `npm run db:reset` asks for confirmation before it runs.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/api/health` says `degraded`, or requests return **503 DATABASE_UNAVAILABLE** | The database is down. Start Docker Desktop, then `docker compose up -d db`. The app recovers on its own once it is back. |
| Page has no styling | Stop the server, remove `.next`, then rebuild and restart. |
| `EADDRINUSE :::3000` | Start on another port: `npx next start -p 3311`. For acceptance tests use `BASE=http://localhost:3311 npm run test:acceptance`. |
| SESSION_SECRET missing or too short | Generate a new value with the setup command and put it in `.env`. |
| Everyone signs out after a restart | Keep the same `SESSION_SECRET`; changing it invalidates sessions. |
| Operator queue is empty | Check that the campaign is Active, records are Ready to Send, assigned to that operator, and not do-not-contact. |
| UI test cannot find a browser | Run `npx playwright install chromium`. |
| Acceptance test fails at login | Run `npm run db:seed`, then retry. |
| Counts differ from this guide | Reset the database or check whether earlier manual tests changed the seeded records. |

---

## Related coverage

| Area | Reference |
| --- | --- |
| Functional requirements | [`UAT_CHECKLIST.md`](UAT_CHECKLIST.md) |
| Security review | [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) |
| Sample import file | [`sample-influencer-list.csv`](sample-influencer-list.csv) |
