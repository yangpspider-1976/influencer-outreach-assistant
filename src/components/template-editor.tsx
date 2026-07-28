"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout, Badge } from "@/components/ui/primitives";
import { Field, FormError, Input, SelectMenu, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";
import { SOCIAL_PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/social-url";
import {
  DEFAULT_TEMPLATE_CONTENT,
  VARIABLE_CATALOG,
  renderTemplate,
} from "@/lib/template";

/** Sample data used for the pre-approval preview (FR-006). */
const SAMPLE_CONTEXT = {
  first_name: "Maria",
  influencer_name: "Maria Santos",
  restaurant_name: "ABC Korean Restaurant",
  campaign_location: "BGC, Taguig",
  visit_period: "10-20 August 2026",
  deliverables: "1 Reel + 3 Stories + location tag",
  compensation: "PHP 5,000 + complimentary meal for two",
  application_deadline: "5 August 2026",
  campaign_manager_name: "Bianca Cruz",
  brief_link: "",
};

export function TemplateEditor({
  mode,
  template,
}: {
  mode: "create" | "edit";
  template?: {
    id: string;
    name: string;
    platform: string;
    language: string;
    description: string;
    status: string;
    content: string;
    versionId: string | null;
    version: number;
    canApprove: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState(template?.name ?? "");
  const [platform, setPlatform] = useState(template?.platform ?? "ANY");
  const [language, setLanguage] = useState(template?.language ?? "en");
  const [description, setDescription] = useState(template?.description ?? "");
  const [content, setContent] = useState(template?.content ?? DEFAULT_TEMPLATE_CONTENT);
  const [versionNote, setVersionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => renderTemplate(content, SAMPLE_CONTEXT), [content]);

  function insertToken(token: string) {
    const area = contentRef.current;
    const snippet = `{{${token}}}`;
    if (!area) {
      setContent((current) => `${current}${snippet}`);
      return;
    }
    const start = area.selectionStart;
    const end = area.selectionEnd;
    setContent((current) => `${current.slice(0, start)}${snippet}${current.slice(end)}`);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = { name, platform, language, description, content, versionNote, lockedTokens: [] };
      if (mode === "create") {
        const result = await api.post<{ template: { id: string } }>("/api/templates", payload);
        toast.success("Template created");
        // Navigate to the newly created template; this unmounts the editor.
        router.push(`/templates/${result.template.id}`);
      } else {
        const result = await api.patch<{
          template: { id: string };
          versionCreated: boolean;
          changed: boolean;
        }>(`/api/templates/${template!.id}`, payload);
        // Report what actually happened. Saving identical content does not mint
        // a new version, so don't claim one was created.
        if (result.versionCreated) {
          toast.success("New version saved");
        } else if (result.changed) {
          toast.success("Template details updated", "The content was unchanged, so no new version was created.");
        } else {
          toast.info("No changes to save", "The template already matches what is on screen.");
        }
        // Editing stays on the same route — just refresh the server data so the
        // version history and current-version props update in place.
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "The template could not be saved.");
    } finally {
      // Reset in every case. On a same-route edit the component stays mounted,
      // so the button must be re-enabled here or it would spin forever.
      setBusy(false);
    }
  }

  async function approve() {
    if (!template?.versionId) return;
    setBusy(true);
    try {
      await api.post(`/api/templates/${template.id}`, { versionId: template.versionId });
      toast.success("Version approved", "Campaigns can now use this template.");
      router.refresh();
    } catch (caught) {
      toast.error("Approval failed", caught instanceof ClientApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <FormError>{error}</FormError>

        <Card>
          <CardHeader title="Template details" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required className="sm:col-span-2">
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Platform" htmlFor="platform">
              <SelectMenu
                id="platform"
                value={platform}
                onChange={(value) => setPlatform(value)}
              >
                <option value="ANY">Any platform</option>
                {SOCIAL_PLATFORMS.map((entry) => (
                  <option key={entry} value={entry}>
                    {SOCIAL_PLATFORM_LABELS[entry]}
                  </option>
                ))}
              </SelectMenu>
            </Field>
            <Field label="Language" htmlFor="language">
              <Input
                id="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en"
              />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <Input
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="When should this template be used?"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Content"
            description="Plain text only. Operators copy exactly what is rendered here."
            action={
              <span className="text-[12px] tabular-nums text-slate-400">
                {content.length} characters
              </span>
            }
          />
          <div className="p-5">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {VARIABLE_CATALOG.map((variable) => (
                <button
                  key={variable.token}
                  type="button"
                  onClick={() => insertToken(variable.token)}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                >
                  {`{{${variable.token}}}`}
                </button>
              ))}
            </div>
            <Textarea
              ref={contentRef}
              aria-label="Template content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={18}
              className="font-mono text-[13px] leading-6"
            />
            <Field label="Version note" htmlFor="versionNote" className="mt-4">
              <Input
                id="versionNote"
                value={versionNote}
                onChange={(event) => setVersionNote(event.target.value)}
                placeholder="What changed in this version?"
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            {mode === "edit" && template?.canApprove && template.status !== "APPROVED" ? (
              <Button
                variant="success"
                onClick={approve}
                disabled={busy}
                icon={<CheckCircle2 className="size-4" aria-hidden />}
              >
                Approve version {template.version}
              </Button>
            ) : null}
            <Button onClick={save} disabled={busy || name.length < 3 || content.length < 20}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {mode === "create" ? "Create template" : "Save new version"}
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Preview"
            description="Rendered with sample campaign and influencer data."
            action={
              preview.unresolvedRequired.length > 0 ? (
                <Badge tone="warning">{preview.unresolvedRequired.length} unresolved</Badge>
              ) : (
                <Badge tone="positive">All resolved</Badge>
              )
            }
          />
          <div className="p-5">
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-[12px] leading-6 text-slate-700">
              {preview.text}
            </pre>
            {preview.unknownTokens.length > 0 ? (
              <Callout tone="warning" className="mt-4">
                Unknown variables: {preview.unknownTokens.map((token) => `{{${token}}}`).join(", ")}.
                They will never resolve and stay visible in the operator&apos;s message.
              </Callout>
            ) : null}
            {preview.removedLines > 0 ? (
              <p className="mt-3 text-[12px] text-slate-500">
                {preview.removedLines} optional line{preview.removedLines === 1 ? "" : "s"} would be
                removed when the value is missing.
              </p>
            ) : null}
          </div>
        </Card>

        <Callout tone="info">
          A template must be approved before a campaign that uses it can be activated. Saving new
          content creates a new version and returns the template to Draft.
        </Callout>
      </div>
    </div>
  );
}
