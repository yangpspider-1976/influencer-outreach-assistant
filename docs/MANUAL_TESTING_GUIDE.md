# Manual testing checklist

Use this guide to test the application through the browser. It is written for a tester who has not read the product specification.

Mark each test **Pass**, **Fail**, or **Blocked**. When a test fails, capture a screenshot and note the actual result.

## Before you start

Start the app with seeded demo data:

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Confirm the app is ready:

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","database":"reachable"}
```

Use separate browser profiles or incognito windows when signed in as two people at the same time. Two normal tabs share the same session.

### Demo accounts

All accounts use password **`QroadDemo!2026`**.

| Account | Use it for |
| --- | --- |
| `admin@qroad.test` | Admin-only actions, audit log, DNC overrides |
| `manager@qroad.test` | Campaigns, imports, templates, assignment, reports |
| `operator1@qroad.test` | Outreach workspace and follow-ups |
| `operator2@qroad.test` | Concurrent-work testing |
| `viewer@qroad.test` | Read-only permission testing |

The main demo campaign is **ABC Korean Restaurant Creator Visit**. The supplied import file is [`sample-influencer-list.csv`](sample-influencer-list.csv).

---

## 1. Sign in

| Step | Action and sample input | Expected result |
| --- | --- | --- |
| 1 | Visit `http://localhost:3000/dashboard` while signed out. | Redirected to the login screen. |
| 2 | In the **Email** field enter `manager@qroad.test`. In the **Password** field enter `wrong-password`, then select **Sign in**. | Red error: **“The email or password is incorrect.”** |
| 3 | Replace the **Password** value with `QroadDemo!2026`, then select **Sign in**. | Dashboard opens and greets **Bianca**. |
| 4 | From the account controls at the bottom of the sidebar, select **Sign out**, then press the browser Back button. | You remain signed out; protected pages do not reopen. |

## 2. Dashboard

**Sign in as:** Manager

1. Confirm the dashboard shows these seeded values:

   - Active campaigns: **1**
   - Do-not-contact records: **2**
   - Follow-ups due: **9**
   - ABC Korean Restaurant Creator Visit: **42 of 56 done**
   - ABC Korean Restaurant - Makati Soft Launch: **0 of 8 done**

2. Confirm the funnel displays **Sent 37**, **Reply rate 59.5%**, **Interest rate 68.2%**, and **Confirmed 6 (16.2%)**.
3. Sign in as `operator1@qroad.test`. Expected: the dashboard instead includes **Ready in your queue: 9**.

## 3. Create and activate a campaign

**Sign in as:** Manager

1. From the sidebar, select **Campaigns**. On the Campaigns page, select **New campaign**.
2. Enter the following values, deliberately making the end date earlier than the start date:

   | Field | Sample input |
   | --- | --- |
   | Campaign name | `Manual Test Dinner — July 2026` |
   | Client | `ABC Korean Restaurant` |
   | Location | `Makati City` |
   | Visit start | `2026-07-20` |
   | Visit end | `2026-07-19` |
   | Deliverables | `1 Instagram Reel and 3 Story frames` |
   | Compensation | `PHP 3,000 dining credit` |

   Select **Create campaign**. Expected: **“The visit end date must be on or after the start date.”** The page scrolls to **Visit ends** and places keyboard focus in that field so it can be corrected immediately.

3. Change **Visit end** to `2026-07-21`, leave the default template blank, and select **Create campaign**. Expected: the campaign is created as **Draft**.
4. In the campaign header, confirm **Activate campaign** is disabled. In the **Not ready to activate** panel, confirm the blocker says **“Select a default message template before activating.”**
5. On the newly created **Manual Test Dinner — July 2026** campaign page, complete the following steps:

   | Location | Action | Expected result |
   | --- | --- | --- |
   | Campaign tabs | Select **Settings**. | The **Edit campaign** form loads. |
   | Messaging and ownership | From the **Default message template** dropdown, select **Restaurant creator visit - first contact · v1**. | The selected template appears in the dropdown. |
   | Bottom of the Edit campaign form | Select **Save changes**. | The campaign settings are updated. |
   | Campaign header | Select **Activate campaign**. | The campaign status changes from **Draft** to **Active**. |

   If the template is not listed, open **Message templates** from the sidebar and confirm that **Restaurant creator visit - first contact** has an **Approved** badge. For a local test database with missing demo data, run `npm run db:seed`, refresh the campaign settings, and check the dropdown again.

## 4. Import creators

**Sign in as:** Manager. **Campaign:** ABC Korean Restaurant Creator Visit.

1. From the sidebar, select **Campaigns**, open **ABC Korean Restaurant Creator Visit**, then select **Import list** in the campaign header. On the **Select an influencer list** screen, select **Choose file** and choose [`sample-influencer-list.csv`](sample-influencer-list.csv).
2. On the **Map columns** screen, confirm that each field dropdown contains the expected source header. From the **Notes** dropdown, select **Not mapped**, then select **Validate rows**. Expected: the Notes column is ignored during validation.
3. Expected validation total:

   > **Total rows: 10 · Valid: 6 · Warning: 2 · Rejected: 2 · Selected for import: 7**

4. Verify these representative rows:

   | Row | Expected result |
   | --- | --- |
   | Maria Santos, Jose Reyes, Ana Cruz, Paolo Bautista | Valid. |
   | Bea Ocampo | Informational note that extra social-URL path segments were removed. |
   | Miguel Garcia | Informational notes for a reconstructed `@miguelgarciaeats` handle and raw `50k-80k` follower text. |
   | Camille Mendoza | Duplicate warning; deselected by default. |
   | Rafael Torres | Rejected because TikTok is not a supported domain. |
   | Isabel Villanueva | Warning: no social profile, so the creator can be stored but cannot be queued. |
   | Empty final row | Rejected because it has no name or usable profile. |

5. Above the validation table, select **Download error file**. Expected: a CSV containing warnings and rejected rows downloads.
6. Below the validation table, select **Commit 7 rows**. Expected: **Imported 7 · New creators 7 · Linked to existing 0 · Added to campaign 6 · Blocked (DNC) 0**.
7. Test duplicate matching using the supplied [`duplicate-test.csv`](duplicate-test.csv):

   ```csv
   influencer_name,instagram_url,category
   Maria Santos Renamed,https://instagram.com/EXAMPLECREATOR?igshid=abc123,Food
   ```

   From the campaign header, select **Import list**, select **Choose file**, and choose `docs/duplicate-test.csv`. Keep the automatic mappings, then select **Validate rows**. Expected: it matches the existing Maria Santos and does not create another campaign record.

## 5. Assign creators

**Sign in as:** Manager

1. From **Campaigns**, open **ABC Korean Restaurant Creator Visit**, then select the **Audience** tab. From the **Filter by status** dropdown, select **Do not contact**.
2. Tick the selection checkbox for both displayed records. In the bulk-action bar, choose **Carlo Mendoza** from the **Assign to operator** dropdown, then select **Assign & mark ready**. Expected: assignment is refused because DNC records need an administrator override.
3. From the **Filter by status** dropdown, select **Not contacted**. Tick several record checkboxes. From the **Assign to operator** dropdown, choose **Carlo Mendoza**, then select **Assign & mark ready**. Expected: the records change to **Ready to send**, and Carlo’s queue increases.
4. Confirm the application has no bulk-send button. Each message must be sent by a person.

## 6. Outreach workspace

**Sign in as:** Operator 1 (`operator1@qroad.test`)

1. From the sidebar, select **Outreach workspace**. Confirm the creator details, campaign summary, and rendered message are visible. The original message must not contain unresolved values such as `{{first_name}}`.
2. Select **Copy message**, then paste it into a text editor. Expected: a **“Message copied”** toast and plain text.
3. Select **Open Instagram** or **Open Facebook**. Expected: the profile opens in a new tab.
4. Reload the workspace. Expected: the record has not been marked sent; copying or opening a profile must not change status.
5. Check send safeguards:

   | Action | Sample input | Expected result |
   | --- | --- | --- |
   | Try to send without confirmation | Leave **I manually sent this message** unticked. | **Mark sent** is disabled. |
   | Try to send unresolved content | In the **Message to send** box, add `{{test}}`. Tick **I manually sent this message**, then select **Mark sent**. | An unresolved-variable warning and **I confirm the unresolved variables are intentional** appear. Nothing saves yet. |
   | Send a personal edit | Remove `{{test}}`. In the **Message to send** box, replace the opening with `Hi! We would love to invite you to an ABC Korean Restaurant creator visit.` Tick **I manually sent this message**, then select **Mark sent**. | Save succeeds and a toast says **2 follow-up reminders scheduled**. |

6. On an unsent record, select **Reset to template**. Expected: your edited text is replaced with the original template.
7. After sending, confirm the next record opens and the queue count decreases by one.
8. Reload the sent record. Expected: attempt history records outcome `sent`, channel, operator, timestamp, and your edited message.
9. Test alternative outcomes on unsent records. From the **Skip reason** dropdown, choose an available reason. In **Operator note**, enter `Creator only accepts paid collaborations.`, then select **Skip**; expected: the selected reason and note are saved. On other unsent records, test the **Invalid account**, **Duplicate**, and **Do not contact** outcome buttons.

## 7. Follow-ups and pipeline

### Follow-ups

**Sign in as:** Operator 1

1. From the sidebar, select **Follow-up queue**. From the queue filter dropdown, select **Due now**. Expected seeded count: **3 due**.
2. On one follow-up card, select **Copy previous** and paste into a text editor. Expected: the previous sent message is copied.
3. On the same card, select **Open profile**. Expected: the social profile opens.
4. On **Cielo Padilla**’s card, select **I sent it**. Expected: the task becomes complete and the queue count drops by one.

   **I sent it** records that *you* sent the follow-up; it does not mean the creator replied. Cielo does not leave the campaign — her status becomes **Sent**, and she appears in the **Sent · awaiting reply** column on the pipeline board (checked in the next section). Recording an actual reply is a separate action.

### Pipeline board

**Sign in as:** Manager

The board is the full recruitment funnel: a leading **Sent · awaiting reply** column feeds the six pipeline lanes.

1. To compare with untouched seed counts, run `npm run db:reset` in the project terminal. After it finishes, sign in again as Manager, select **Pipeline board** from the sidebar, then choose **ABC Korean Restaurant Creator Visit** from the **Campaign** dropdown. Confirm these columns:

   | Column | Count |
   | --- | ---: |
   | Sent · awaiting reply | 11 |
   | Replied | 4 |
   | Interested | 5 |
   | Negotiating | 4 |
   | Confirmed | 6 |
   | Declined | 3 |
   | No Response | 4 |

   The **Sent · awaiting reply** column holds creators who have been messaged but have not yet replied — statuses **Sent** and **Follow-up Due**. Each card shows which of the two it is.

2. Record a reply. In **Sent · awaiting reply**, choose any card labelled **Sent** (for example **Reese Aquino**) and select **Replied** from its **Move to…** dropdown. Expected: the card moves to the **Replied** lane; the Sent count drops to 10 and Replied rises to 5.
3. On a card in the **Confirmed** lane, open the **Move to…** dropdown. Expected: only legal next statuses are available; **Ready to send** is not listed.
4. Confirm a reply cancels pending reminders. In **Sent · awaiting reply**, find a card labelled **Follow-up Due** (for example **Denise Salazar**) and move it to **Replied**. Then sign in as **Operator 1**, open the **Follow-up queue**, and confirm that creator’s reminder is gone — moving to Replied cancelled it automatically.

## 8. Templates, creators, and reports

### Templates

**Sign in as:** Manager

1. From the sidebar, select **Message templates**, then select **Restaurant creator visit - first contact** from the template list.
2. Click inside the **Template content** box where the token should be inserted, then select the `{{first_name}}` token button above the box. Expected: `{{first_name}}` is inserted at the cursor and the **Preview** renders it as `Maria`.
3. In the **Template content** box, add `{{nonexistent}}` on a new line. Expected: the Preview card shows an unresolved-variable warning.
4. Remove the `{{nonexistent}}` line. Add `Campaign brief: {{brief_link?}}` on a new line. Expected: the entire Campaign brief line is absent from the Preview because the sample brief-link value is empty and the token is optional.
5. In the **Version note** field, enter `Manual test of variables and optional lines.`, then select **Save new version**. Expected: version 2 is created with a **Draft** badge.
6. Select **Approve version 2**. Expected: the badge changes to **Approved**, and campaigns can select this version from the **Default message template** dropdown.

### Creator database and do-not-contact

**Sign in as:** Manager, then Admin

1. From the sidebar, select **Influencer database**. In the **Search creators** field, enter `denise`. Expected: matching creators appear. Replace the search with `instagram.com`; expected: creators with matching profile URLs appear.
2. From the **Filter by do-not-contact** dropdown, select **Do not contact only**. Expected: exactly 2 seeded creators.
3. Clear the DNC filter, open a creator without a DNC badge, and select **Mark do not contact** in the page header. In the reason prompt, enter `Creator asked not to receive future campaign invitations.`, then confirm. Expected: campaign records are withdrawn and pending follow-ups are cancelled.
4. While signed in as Manager, confirm **Clear do-not-contact** is unavailable. Sign in as Admin and open that creator. Select **Clear do-not-contact**, enter `Too short` in the reason prompt, and confirm; expected: it is rejected. Select **Clear do-not-contact** again, enter `Creator contacted support and opted back in.`, and confirm; expected: the DNC flag is cleared.

### Reports and safe export

**Sign in as:** Manager

1. Before comparing exact metrics, run `npm run db:reset` in the project terminal. After it finishes, sign in again as Manager, select **Reports** from the sidebar, then choose **ABC Korean Restaurant Creator Visit · ABC Korean Restaurant** from the **Campaign** dropdown. Confirm these seeded values: Outreach completion **77.8%**, Reply rate **59.5%**, Interest rate **68.2%**, Confirmation rate **16.2%**, Invalid rate **4.8%**, Follow-up completion **59.1%**.
2. Confirm operator productivity: Dana Villanueva **27 assigned / 19 completed**; Carlo Mendoza **27 / 18**.
3. To test spreadsheet formula protection, create a file named `formula-export-test.csv` containing:

   ```csv
   influencer_name,instagram_url,notes
   Formula Export Test,https://instagram.com/formulaexporttest,"=HYPERLINK(""http://evil.test"",""click"")"
   ```

4. From **Campaigns**, open **ABC Korean Restaurant Creator Visit**, select **Import list**, choose `formula-export-test.csv`, keep the automatic mappings, select **Validate rows**, then select **Commit 1 row**.
5. Return to **Reports** and choose **ABC Korean Restaurant Creator Visit · ABC Korean Restaurant** from the **Campaign** dropdown. From the **Export format** dropdown choose **CSV**, then select **Export records**. Open the downloaded file in Excel. Expected: the Notes cell is literal text with a leading apostrophe; no formula runs and no external-link prompt appears.
6. From the **Export format** dropdown choose **XLSX**, then select **Export records**. Expected: the same formula protection is applied and the file contains only records from the selected campaign.

## 9. Permissions and recovery

### Permissions

| Account | Attempt | Expected result |
| --- | --- | --- |
| Operator | Open `/campaigns/new` | Redirected and API returns 403. |
| Operator | Open `/admin` | Redirected; Administration is not in the sidebar. |
| Viewer | Open `/outreach` | Redirected; no workspace access. |
| Viewer | Open `/audit` | Redirected. |
| Manager | Attempt DNC override | 403; only Admin can override. |

### Recovery and edge cases

| Test | Action | Expected result |
| --- | --- | --- |
| Clipboard blocked | Block Clipboard permission for localhost and select **Copy message**. | A selectable textarea provides the message for manual copying. |
| Pop-up blocked | Block pop-ups, then select **Open Instagram**. | A notification and clickable fallback profile link appear. |
| Concurrent edit | Operator 1 opens a record; Admin changes it; Operator 1 tries to save. | Conflict message, no save, and **Refresh record** option. |
| Offline save | DevTools → Network → Offline; edit message and select **Mark sent**. | Error shown, text stays available, queue does not advance, and Retry is offered. |
| Invalid upload | Upload `.exe`, `.php`, a file over 10 MB, or CSV over 5,000 rows. | The upload is rejected with the relevant validation message. |

## Reset after testing

Manual and acceptance tests change the seeded data. Restore a clean local test database with:

```bash
npm run db:reset
```

This deletes the local database contents, then migrates and seeds it again. Never run it against real data.
