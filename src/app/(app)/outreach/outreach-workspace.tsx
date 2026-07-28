"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  ClipboardCopy,
  ExternalLink,
  History,
  Loader2,
  RotateCcw,
  Save,
  ShieldAlert,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  DefinitionList,
  StatusBadge,
} from "@/components/ui/primitives";
import { Checkbox, Field, SelectMenu, Textarea } from "@/components/ui/form";
import { Page } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError, copyPlainText, openProfile } from "@/lib/client-api";
import { formatCompactNumber, formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-url";
import { findUnresolvedTokens } from "@/lib/template";
import type { WorkspacePayload } from "@/lib/workspace-payload";
import { cn } from "@/lib/cn";

type Props = {
  payload: WorkspacePayload;
  remaining: number;
  upcoming: {
    id: string;
    displayName: string;
    category: string;
    outreachStatus: string;
    dueAt: string | null;
  }[];
  canEditSentRecord: boolean;
};

type PendingOutcome = {
  outcome: "SENT" | "SKIPPED" | "INVALID" | "DUPLICATE" | "DO_NOT_CONTACT" | "SAVED_FOR_LATER";
  label: string;
};

export function OutreachWorkspace({ payload, remaining, upcoming }: Props) {
  const router = useRouter();
  const toast = useToast();

  const { record, campaign, influencer, message, attempts, followUps, history, skipReasons } =
    payload;

  const [text, setText] = useState(message.text);
  const [note, setNote] = useState(record.notes ?? "");
  const [channel, setChannel] = useState<SocialPlatform>(
    (influencer.preferredPlatform as SocialPlatform | null) ??
      (influencer.profiles[0]?.platform as SocialPlatform | undefined) ??
      "INSTAGRAM",
  );
  const [skipReasonId, setSkipReasonId] = useState(skipReasons[0]?.id ?? "");
  const [manualSendAffirmed, setManualSendAffirmed] = useState(false);
  const [unresolvedAcknowledged, setUnresolvedAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clipboardFallback, setClipboardFallback] = useState(false);
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOutcome | null>(null);
  const [failedOutcome, setFailedOutcome] = useState<PendingOutcome | null>(null);
  const [conflict, setConflict] = useState(false);

  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  const dirty = text !== message.text || note !== (record.notes ?? "");
  const unresolved = useMemo(() => findUnresolvedTokens(text), [text]);
  const blockedByDnc = influencer.dncFlag && !record.dncOverrideAt;

  // §10 — warn before navigating away from unsaved message text or notes.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // §18 — preserve the operator's draft locally if the session expires.
  useEffect(() => {
    const key = `qroad.draft.${record.id}`;
    if (dirty) window.localStorage.setItem(key, text);
    else window.localStorage.removeItem(key);
  }, [dirty, text, record.id]);

  async function handleCopy() {
    if (blockedByDnc) {
      toast.error(
        "Copy blocked",
        "This creator is flagged Do Not Contact. An administrator override is required.",
      );
      return;
    }
    const ok = await copyPlainText(text);
    if (ok) {
      setCopied(true);
      setClipboardFallback(false);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Message copied", "Paste it into the conversation and review before sending.");
    } else {
      setClipboardFallback(true);
      toast.error(
        "Clipboard unavailable",
        "Select the text below and copy it manually. Nothing was lost.",
      );
      setTimeout(() => fallbackRef.current?.select(), 50);
    }
    // Analytics only — copying never implies a message was sent (AC-006).
    await api.post(`/api/outreach/${record.id}/copy-event`, { kind: "copy" }).catch(() => undefined);
  }

  async function handleOpenProfile(platform: SocialPlatform) {
    const profile = influencer.profiles.find((entry) => entry.platform === platform);
    if (!profile) return;
    setChannel(platform);
    const opened = openProfile(profile.url);
    if (!opened) {
      setPopupBlockedUrl(profile.url);
      toast.error("Popup blocked", "Use the direct link shown below the buttons.");
    }
    await api
      .post(`/api/outreach/${record.id}/copy-event`, { kind: "profile_open" })
      .catch(() => undefined);
  }

  async function saveOutcome(outcome: PendingOutcome) {
    if (outcome.outcome === "SENT") {
      if (!manualSendAffirmed) {
        toast.error(
          "Confirmation required",
          'Tick "I manually sent this message" before marking the record Sent.',
        );
        return;
      }
      if (unresolved.length > 0 && !unresolvedAcknowledged) {
        toast.error(
          "Unresolved variables",
          `The message still contains ${unresolved.map((t) => `{{${t}}}`).join(", ")}. Fix it or confirm explicitly.`,
        );
        return;
      }
    }

    setPending(outcome);
    setFailedOutcome(null);
    setConflict(false);

    try {
      const result = await api.post<{ nextRecordId: string | null; followUpsCreated: number }>(
        `/api/outreach/${record.id}/outcome`,
        {
          outcome: outcome.outcome,
          version: record.version,
          channel: outcome.outcome === "SENT" ? channel : null,
          confirmedText: text,
          preparedText: message.renderedText,
          skipReasonId: outcome.outcome === "SKIPPED" ? skipReasonId : null,
          note,
          manualSendAffirmed,
          unresolvedAcknowledged,
        },
      );

      window.localStorage.removeItem(`qroad.draft.${record.id}`);
      toast.success(
        `${outcome.label} recorded`,
        result.followUpsCreated > 0
          ? `${result.followUpsCreated} follow-up reminder${result.followUpsCreated === 1 ? "" : "s"} scheduled.`
          : undefined,
      );

      // FR-020 / AC-008 — only advance after a confirmed save.
      if (result.nextRecordId) router.replace(`/outreach?record=${result.nextRecordId}`);
      else router.replace("/outreach");
      router.refresh();
    } catch (caught) {
      setPending(null);
      if (caught instanceof ClientApiError && caught.code === "STALE_RECORD") {
        setConflict(true);
        return;
      }
      setFailedOutcome(outcome);
      toast.error(
        `${outcome.label} was not saved`,
        caught instanceof ClientApiError ? caught.message : "The record stayed where it was.",
      );
    }
  }

  const profiles = influencer.profiles;

  return (
    <Page width="full" className="max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-slate-500">
            <Link href={`/campaigns/${campaign.id}`} className="hover:text-slate-800">
              {campaign.name}
            </Link>
            {" · "}
            {campaign.client}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-tight text-slate-900">
            {influencer.displayName}
            <StatusBadge status={record.outreachStatus} />
            {influencer.dncFlag ? (
              <Badge tone="danger">
                <ShieldAlert className="size-3" aria-hidden />
                Do not contact
              </Badge>
            ) : null}
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            {[influencer.category, influencer.location].filter(Boolean).join(" · ") ||
              "No category or location recorded"}
            {influencer.followerCountNumeric
              ? ` · ${formatCompactNumber(influencer.followerCountNumeric)} followers (supplied)`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-600">
            {remaining} left in your queue
          </span>
        </div>
      </div>

      {blockedByDnc ? (
        <Callout tone="danger" className="mt-5" title="Outreach is blocked for this creator">
          This creator opted out. Copying the prepared message and marking the record Sent are both
          disabled until an administrator records an audited override.
        </Callout>
      ) : null}

      {conflict ? (
        <Callout tone="warning" className="mt-5" title="This record changed while you were working">
          Someone else updated it. Nothing was saved. Refresh to load the current version, then
          re-apply your outcome.
          <div className="mt-2.5">
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
              Refresh record
            </Button>
          </div>
        </Callout>
      ) : null}

      {failedOutcome ? (
        <Callout tone="danger" className="mt-5" title="The outcome was not saved">
          Your text is still here and the queue has not advanced. Retry when you are ready.
          <div className="mt-2.5">
            <Button size="sm" onClick={() => saveOutcome(failedOutcome)}>
              Retry &ldquo;{failedOutcome.label}&rdquo;
            </Button>
          </div>
        </Callout>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Campaign summary"
              description="Exactly what you are inviting this creator to."
            />
            <div className="p-5">
              <DefinitionList
                columns={4}
                items={[
                  { label: "Client", value: campaign.client },
                  { label: "Location", value: campaign.location },
                  { label: "Visit period", value: campaign.visitPeriod },
                  {
                    label: "Apply by",
                    value: campaign.applicationDeadline
                      ? formatDate(campaign.applicationDeadline)
                      : "—",
                  },
                  {
                    label: "Deliverables",
                    value: <span className="whitespace-pre-line">{campaign.deliverables}</span>,
                  },
                  { label: "Compensation", value: campaign.compensation },
                  { label: "Template", value: campaign.templateName },
                  { label: "Owner", value: campaign.owner ?? "—" },
                ]}
              />
              {campaign.notes ? (
                <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-[13px] leading-6 text-slate-600">
                  {campaign.notes}
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Message"
              description="Edit freely for natural personalization. The approved template is never changed."
              action={
                <div className="flex items-center gap-3">
                  <span className="text-[12px] tabular-nums text-slate-400">
                    {text.length} characters
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setText(message.renderedText)}
                    disabled={text === message.renderedText}
                    icon={<RotateCcw className="size-3.5" aria-hidden />}
                  >
                    Reset to template
                  </Button>
                </div>
              }
            />
            <div className="p-5">
              {unresolved.length > 0 ? (
                <Callout tone="warning" className="mb-4">
                  <span className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <strong className="font-semibold">Unresolved variables:</strong>{" "}
                      {unresolved.map((token) => `{{${token}}}`).join(", ")}. Fill these in before
                      sending, or confirm explicitly below.
                    </span>
                  </span>
                </Callout>
              ) : null}

              <Textarea
                aria-label="Message to send"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={14}
                className="font-mono text-[13px] leading-6"
                spellCheck
              />

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleCopy}
                  disabled={blockedByDnc}
                  icon={
                    copied ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <ClipboardCopy className="size-4" aria-hidden />
                    )
                  }
                >
                  {copied ? "Copied" : "Copy message"}
                </Button>

                {profiles.map((profile) => (
                  <Button
                    key={profile.id}
                    variant="secondary"
                    onClick={() => handleOpenProfile(profile.platform as SocialPlatform)}
                    icon={<ExternalLink className="size-4" aria-hidden />}
                  >
                    Open {SOCIAL_PLATFORM_LABELS[profile.platform as SocialPlatform]}
                  </Button>
                ))}
                {profiles.length === 0 ? (
                  <span className="text-[13px] text-rose-600">
                    No supported social profile is saved for this creator.
                  </span>
                ) : null}

                <Button
                  variant="ghost"
                  onClick={() =>
                    saveOutcome({ outcome: "SAVED_FOR_LATER", label: "Saved for later" })
                  }
                  disabled={Boolean(pending)}
                  icon={<Save className="size-4" aria-hidden />}
                >
                  Save draft
                </Button>
              </div>

              {clipboardFallback ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[12px] font-medium text-amber-900">
                    Your browser blocked clipboard access. Select all of the text below and copy it
                    manually.
                  </p>
                  <textarea
                    ref={fallbackRef}
                    readOnly
                    value={text}
                    rows={6}
                    className="mt-2 w-full rounded-md border border-amber-300 bg-white p-2 font-mono text-[12px] leading-5"
                  />
                </div>
              ) : null}

              {popupBlockedUrl ? (
                <p className="mt-3 text-[12px] text-amber-800">
                  The new tab was blocked. Open this link manually:{" "}
                  <a
                    href={popupBlockedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-700 underline underline-offset-2"
                  >
                    {popupBlockedUrl}
                  </a>
                </p>
              ) : null}

              <Callout tone="info" className="mt-4">
                {payload.disclaimer} Opening a profile or copying the message never marks this
                record as sent.
              </Callout>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Record the outcome"
              description="Nothing changes until you save an outcome here."
            />
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Channel used" htmlFor="channel">
                  <SelectMenu
                    id="channel"
                    value={channel}
                    onChange={(value) =>
                      setChannel(value as SocialPlatform)
                    }
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.platform}>
                        {SOCIAL_PLATFORM_LABELS[profile.platform as SocialPlatform]}
                      </option>
                    ))}
                  </SelectMenu>
                </Field>

                <Field label="Skip reason" htmlFor="skipReason" hint="Required when you skip.">
                  <SelectMenu
                    id="skipReason"
                    value={skipReasonId}
                    onChange={(value) => setSkipReasonId(value)}
                  >
                    {skipReasons.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {reason.label}
                      </option>
                    ))}
                  </SelectMenu>
                </Field>
              </div>

              <Field label="Operator note" htmlFor="note">
                <Textarea
                  id="note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Anything the campaign manager should know."
                />
              </Field>

              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <Checkbox
                  label="I manually sent this message"
                  description="Required before a record can be marked Sent. The exact text above is stored for audit."
                  checked={manualSendAffirmed}
                  onChange={(event) => setManualSendAffirmed(event.target.checked)}
                />
                {unresolved.length > 0 ? (
                  <Checkbox
                    label="I confirm the unresolved variables are intentional"
                    description="The message still contains template tokens."
                    checked={unresolvedAcknowledged}
                    onChange={(event) => setUnresolvedAcknowledged(event.target.checked)}
                  />
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="success"
                  disabled={Boolean(pending) || blockedByDnc || !manualSendAffirmed}
                  onClick={() => saveOutcome({ outcome: "SENT", label: "Sent" })}
                  icon={
                    pending?.outcome === "SENT" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )
                  }
                >
                  Mark sent
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(pending)}
                  onClick={() => saveOutcome({ outcome: "SKIPPED", label: "Skipped" })}
                  icon={<SkipForward className="size-4" aria-hidden />}
                >
                  Skip
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(pending)}
                  onClick={() => saveOutcome({ outcome: "INVALID", label: "Invalid account" })}
                  icon={<AlertTriangle className="size-4" aria-hidden />}
                >
                  Invalid account
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(pending)}
                  onClick={() => saveOutcome({ outcome: "DUPLICATE", label: "Duplicate" })}
                >
                  Duplicate
                </Button>
                <Button
                  variant="danger"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    saveOutcome({ outcome: "DO_NOT_CONTACT", label: "Do not contact" })
                  }
                  icon={<Ban className="size-4" aria-hidden />}
                >
                  Do not contact
                </Button>
              </div>

              {upcoming.length > 0 ? (
                <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <ArrowRight className="size-3.5" aria-hidden />
                  Next up: {upcoming[0].displayName}
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Profiles" description="Saved links only. Nothing is scraped." />
            <ul className="divide-y divide-slate-100">
              {influencer.profiles.length === 0 ? (
                <li className="px-5 py-6 text-center text-[13px] text-slate-400">
                  No profile links saved.
                </li>
              ) : (
                influencer.profiles.map((profile) => (
                  <li key={profile.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-medium text-slate-800">
                        {SOCIAL_PLATFORM_LABELS[profile.platform as SocialPlatform]}
                        {profile.preferred ? (
                          <span className="ml-2 text-[11px] font-normal text-brand-600">
                            preferred
                          </span>
                        ) : null}
                      </span>
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
                      >
                        Open
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                      {profile.normalizedUrl}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="p-5">
              <DefinitionList
                columns={1}
                items={[
                  { label: "Current status", value: <StatusBadge status={record.outreachStatus} /> },
                  { label: "Assigned to", value: record.assignee?.name ?? "Unassigned" },
                  { label: "Queue opened", value: formatDateTime(record.queueOpenedAt) },
                  { label: "Last copied", value: formatDateTime(record.lastCopiedAt) },
                  { label: "Last profile open", value: formatDateTime(record.lastProfileOpenAt) },
                  { label: "Last contact", value: formatDateTime(record.lastContactAt) },
                ]}
              />

              {followUps.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Follow-up schedule
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {followUps.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center justify-between text-[12px] text-slate-600"
                      >
                        <span>Follow-up {task.sequence}</span>
                        <span className="flex items-center gap-2">
                          {formatDate(task.dueAt)}
                          <Badge
                            tone={
                              task.status === "COMPLETED"
                                ? "positive"
                                : task.status === "CANCELLED"
                                  ? "neutral"
                                  : "warning"
                            }
                          >
                            {task.status.toLowerCase()}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Attempt history"
              description="Every prior outcome recorded for this campaign record."
            />
            {attempts.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-slate-400">
                No attempts recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attempts.map((attempt) => (
                  <li key={attempt.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-slate-800">
                        {attempt.outcome.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {relativeTime(attempt.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {attempt.createdBy}
                      {attempt.channel
                        ? ` · ${SOCIAL_PLATFORM_LABELS[attempt.channel as SocialPlatform]}`
                        : ""}
                      {attempt.skipReason ? ` · ${attempt.skipReason}` : ""}
                    </p>
                    {attempt.note ? (
                      <p className="mt-1 text-[12px] italic text-slate-500">{attempt.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Other campaigns"
              description="Prevents conflicting contact with the same creator."
            />
            {history.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-slate-400">
                <History className="mx-auto mb-2 size-4 text-slate-300" aria-hidden />
                No prior campaign history.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((entry) => (
                  <li key={entry.id} className="px-5 py-3.5">
                    <Link
                      href={`/campaigns/${entry.campaignId}`}
                      className="text-[13px] font-medium text-slate-800 hover:text-brand-700"
                    >
                      {entry.campaignName}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={entry.outreachStatus} />
                      <span className="text-[11px] text-slate-400">
                        {relativeTime(entry.updatedAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {upcoming.length > 0 ? (
            <Card>
              <CardHeader title="Up next" description="Ordered by priority, then due date." />
              <ul className="divide-y divide-slate-100">
                {upcoming.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/outreach?record=${entry.id}`}
                      className={cn(
                        "flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-slate-800">
                          {entry.displayName}
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {entry.category || "No category"}
                        </span>
                      </span>
                      <StatusBadge status={entry.outreachStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
