"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";

const CONFIRM_PHRASE = "RESET DEMO DATA";

type Summary = {
  campaigns: number;
  influencers: number;
  records: number;
  followUps: number;
};

/**
 * Administrator-only destructive action. The server enforces the role, the
 * production block and the confirmation phrase independently — this form is
 * convenience, never the control.
 */
export function ResetDemoData({ allowedHere }: { allowedHere: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);

  const phraseMatches = confirm === CONFIRM_PHRASE;

  async function run() {
    if (!phraseMatches) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await api.post<{ summary: Summary; durationMs: number }>(
        "/api/admin/reset-demo-data",
        { confirm },
      );
      setResult(response.summary);
      setConfirm("");
      toast.success(
        "Demo data reset",
        `${response.summary.campaigns} campaigns and ${response.summary.influencers} influencers rebuilt in ${(
          response.durationMs / 1000
        ).toFixed(1)}s.`,
      );
      router.refresh();
    } catch (caught) {
      toast.error(
        "Reset failed",
        caught instanceof ClientApiError ? caught.message : "Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-rose-200">
      <CardHeader
        title={
          <span className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="size-4" aria-hidden />
            Danger zone — reset demo data
          </span>
        }
        description="Deletes every campaign, influencer and outreach record, then rebuilds the seeded demo dataset."
      />

      <div className="space-y-4 p-5">
        <Callout tone="danger" title="This cannot be undone">
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>
              <strong>Deleted:</strong> campaigns, influencers, social profiles, outreach records and
              attempts, follow-up tasks, imports, exports and the entire audit log.
            </li>
            <li>
              <strong>Preserved:</strong> user accounts, roles and permissions, organization settings
              and skip reasons — so you stay signed in.
            </li>
          </ul>
        </Callout>

        {allowedHere ? null : (
          <Callout tone="warning" title="Disabled in this environment">
            Resetting is blocked when the app runs in production. It can only be enabled on a
            disposable environment by setting <code>ALLOW_DEMO_RESET=true</code>.
          </Callout>
        )}

        <Field
          label={
            <>
              Type <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">{CONFIRM_PHRASE}</code>{" "}
              to confirm
            </>
          }
          htmlFor="reset-confirm"
        >
          <Input
            id="reset-confirm"
            value={confirm}
            disabled={!allowedHere || busy}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            disabled={!allowedHere || !phraseMatches || busy}
            onClick={run}
            icon={
              busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="size-4" aria-hidden />
              )
            }
          >
            {busy ? "Resetting…" : "Reset and reseed"}
          </Button>
          {!phraseMatches && confirm.length > 0 ? (
            <span className="text-[12px] text-slate-500">The phrase must match exactly.</span>
          ) : null}
        </div>

        {result ? (
          <Callout tone="success" title="Demo data rebuilt">
            {result.campaigns} campaigns · {result.influencers} influencers · {result.records}{" "}
            campaign records · {result.followUps} follow-up tasks.
          </Callout>
        ) : null}
      </div>
    </Card>
  );
}
