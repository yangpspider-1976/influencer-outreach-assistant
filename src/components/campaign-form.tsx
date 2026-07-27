"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/primitives";
import { Checkbox, Field, FormError, Input, SelectMenu, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";

export type CampaignFormValues = {
  id?: string;
  name: string;
  clientId: string;
  clientName: string;
  location: string;
  visitStart: string;
  visitEnd: string;
  deliverables: string;
  deliverablesShort: string;
  compensation: string;
  applicationDeadline: string;
  targetCategory: string;
  targetLocation: string;
  briefUrl: string;
  briefLinkEnabled: boolean;
  ownerId: string;
  templateId: string;
  notes: string;
  followUpOffsetDays: number[];
};

const EMPTY: CampaignFormValues = {
  name: "",
  clientId: "",
  clientName: "",
  location: "",
  visitStart: "",
  visitEnd: "",
  deliverables: "",
  deliverablesShort: "",
  compensation: "",
  applicationDeadline: "",
  targetCategory: "",
  targetLocation: "",
  briefUrl: "",
  briefLinkEnabled: false,
  ownerId: "",
  templateId: "",
  notes: "",
  followUpOffsetDays: [3, 7],
};

type FieldError = { path: string; message: string };

const ERROR_FIELD_IDS: Record<string, string> = {
  clientId: "client",
  clientName: "client",
  followUpOffsetDays: "followUps",
};

function focusFirstInvalidField(fieldErrors: FieldError[]) {
  const firstError = fieldErrors[0];
  if (!firstError) return;

  const fieldId = ERROR_FIELD_IDS[firstError.path] ?? firstError.path;
  window.requestAnimationFrame(() => {
    const field = document.getElementById(fieldId);
    if (!(field instanceof HTMLElement)) return;

    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

export function CampaignForm({
  mode,
  initial,
  currentUserId,
  clients,
  owners,
  templates,
}: {
  mode: "create" | "edit";
  initial?: Partial<CampaignFormValues>;
  currentUserId: string;
  clients: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  templates: { id: string; name: string; versionLabel: string; approved: boolean }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<CampaignFormValues>({
    ...EMPTY,
    ownerId: currentUserId,
    ...initial,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [useNewClient, setUseNewClient] = useState(!initial?.clientId && clients.length === 0);

  function set<K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function errorFor(path: string) {
    return errors.find((error) => error.path === path)?.message;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrors([]);
    setFormError(null);

    const payload = {
      name: values.name,
      ...(useNewClient
        ? { clientName: values.clientName }
        : { clientId: values.clientId || undefined, clientName: values.clientName || undefined }),
      location: values.location,
      visitStart: values.visitStart,
      visitEnd: values.visitEnd,
      deliverables: values.deliverables,
      deliverablesShort: values.deliverablesShort,
      compensation: values.compensation,
      applicationDeadline: values.applicationDeadline || null,
      targetCategory: values.targetCategory,
      targetLocation: values.targetLocation,
      briefUrl: values.briefUrl || null,
      briefLinkEnabled: values.briefLinkEnabled,
      ownerId: values.ownerId,
      templateId: values.templateId || null,
      notes: values.notes,
      followUpOffsetDays: values.followUpOffsetDays,
    };

    try {
      const result = await (mode === "create"
        ? api.post<{ campaign: { id: string } }>("/api/campaigns", payload)
        : api.patch<{ campaign: { id: string } }>(`/api/campaigns/${values.id}`, payload));
      toast.success(
        mode === "create" ? "Campaign created" : "Campaign updated",
        mode === "create" ? "Import an influencer list to build the audience." : undefined,
      );
      router.push(`/campaigns/${result.campaign.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ClientApiError && Array.isArray(caught.details)) {
        const fieldErrors = caught.details as FieldError[];
        setErrors(fieldErrors);
        setFormError("Some fields need attention.");
        focusFirstInvalidField(fieldErrors);
      } else {
        setFormError(
          caught instanceof ClientApiError ? caught.message : "The campaign could not be saved.",
        );
      }
    } finally {
      // Reset even on success: if navigation does not unmount the form (e.g. a
      // same-route save), the button must not stay stuck in its loading state.
      setPending(false);
    }
  }

  const followUpValue = values.followUpOffsetDays.join(", ");

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <FormError>{formError}</FormError>

      <Card>
        <CardHeader
          title="Campaign identity"
          description="These values appear in the copy operators send, so use the client-facing wording."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field
            label="Campaign name"
            htmlFor="name"
            required
            error={errorFor("name")}
            className="sm:col-span-2"
          >
            <Input
              id="name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="ABC Korean Restaurant Creator Visit"
              required
            />
          </Field>

          <Field
            label="Client / restaurant"
            htmlFor="client"
            required
            error={errorFor("clientName") ?? errorFor("clientId")}
            hint={
              clients.length > 0 ? (
                <button
                  type="button"
                  className="font-medium text-brand-600 hover:text-brand-700"
                  onClick={() => setUseNewClient((current) => !current)}
                >
                  {useNewClient ? "Choose an existing client" : "Add a new client instead"}
                </button>
              ) : undefined
            }
          >
            {useNewClient || clients.length === 0 ? (
              <Input
                id="client"
                value={values.clientName}
                onChange={(event) => set("clientName", event.target.value)}
                placeholder="ABC Korean Restaurant"
                required
              />
            ) : (
              <SelectMenu
                id="client"
                value={values.clientId}
                onChange={(value) => set("clientId", value)}
                required
              >
                <option value="">Select a client…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectMenu>
            )}
          </Field>

          <Field label="Campaign location" htmlFor="location" required error={errorFor("location")}>
            <Input
              id="location"
              value={values.location}
              onChange={(event) => set("location", event.target.value)}
              placeholder="BGC, Taguig"
              required
            />
          </Field>

          <Field label="Visit starts" htmlFor="visitStart" required error={errorFor("visitStart")}>
            <Input
              id="visitStart"
              type="date"
              value={values.visitStart}
              onChange={(event) => set("visitStart", event.target.value)}
              required
            />
          </Field>

          <Field label="Visit ends" htmlFor="visitEnd" required error={errorFor("visitEnd")}>
            <Input
              id="visitEnd"
              type="date"
              value={values.visitEnd}
              onChange={(event) => set("visitEnd", event.target.value)}
              required
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Offer"
          description="Deliverables and compensation are rendered into every message. Compensation stays free text so barter and mixed offers are supported."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field
            label="Deliverables"
            htmlFor="deliverables"
            required
            error={errorFor("deliverables")}
            className="sm:col-span-2"
            hint="Full description. Line breaks are allowed."
          >
            <Textarea
              id="deliverables"
              rows={3}
              value={values.deliverables}
              onChange={(event) => set("deliverables", event.target.value)}
              placeholder="1 Reel + 3 Stories + location tag"
              required
            />
          </Field>

          <Field
            label="Short copy-safe deliverables"
            htmlFor="deliverablesShort"
            hint="Single line used inside the DM. Defaults to the first line above."
            className="sm:col-span-2"
          >
            <Input
              id="deliverablesShort"
              value={values.deliverablesShort}
              onChange={(event) => set("deliverablesShort", event.target.value)}
              placeholder="1 Reel + 3 Stories + location tag"
            />
          </Field>

          <Field label="Compensation" htmlFor="compensation" required error={errorFor("compensation")}>
            <Input
              id="compensation"
              value={values.compensation}
              onChange={(event) => set("compensation", event.target.value)}
              placeholder="PHP 5,000 + complimentary meal for two"
              required
            />
          </Field>

          <Field
            label="Application deadline"
            htmlFor="applicationDeadline"
            hint="Recommended. Activation warns if it is already in the past."
          >
            <Input
              id="applicationDeadline"
              type="date"
              value={values.applicationDeadline}
              onChange={(event) => set("applicationDeadline", event.target.value)}
            />
          </Field>

          <Field label="Target category" htmlFor="targetCategory">
            <Input
              id="targetCategory"
              value={values.targetCategory}
              onChange={(event) => set("targetCategory", event.target.value)}
              placeholder="Food, lifestyle, family"
            />
          </Field>

          <Field label="Target location" htmlFor="targetLocation">
            <Input
              id="targetLocation"
              value={values.targetLocation}
              onChange={(event) => set("targetLocation", event.target.value)}
              placeholder="Metro Manila"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Messaging and ownership"
          description="A campaign needs an approved template before it can be activated."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Default message template" htmlFor="templateId" error={errorFor("templateId")}>
            <SelectMenu
              id="templateId"
              value={values.templateId}
              onChange={(value) => set("templateId", value)}
            >
              <option value="">No template selected</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id} disabled={!template.approved}>
                  {template.name} · {template.versionLabel}
                  {template.approved ? "" : " (not approved)"}
                </option>
              ))}
            </SelectMenu>
          </Field>

          <Field label="Internal owner" htmlFor="ownerId" required error={errorFor("ownerId")}>
            <SelectMenu
              id="ownerId"
              value={values.ownerId}
              onChange={(value) => set("ownerId", value)}
              required
            >
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </SelectMenu>
          </Field>

          <Field
            label="Follow-up reminders"
            htmlFor="followUps"
            hint="Up to two reminders, in days after an operator records Sent. Leave empty for none."
          >
            <Input
              id="followUps"
              defaultValue={followUpValue}
              placeholder="3, 7"
              onBlur={(event) =>
                set(
                  "followUpOffsetDays",
                  event.target.value
                    .split(",")
                    .map((part) => Number.parseInt(part.trim(), 10))
                    .filter((value) => Number.isFinite(value) && value > 0)
                    .slice(0, 2),
                )
              }
            />
          </Field>

          <Field
            label="Campaign brief link"
            htmlFor="briefUrl"
            hint="Authorized link only. Never paste a private storage URL."
          >
            <Input
              id="briefUrl"
              type="url"
              value={values.briefUrl}
              onChange={(event) => set("briefUrl", event.target.value)}
              placeholder="https://…"
            />
          </Field>

          <div className="sm:col-span-2">
            <Checkbox
              label="Allow {{brief_link}} in outreach copy"
              description="Off by default. The brief link is omitted from every rendered message unless this is enabled."
              checked={values.briefLinkEnabled}
              onChange={(event) => set("briefLinkEnabled", event.target.checked)}
            />
          </div>

          <Field label="Internal notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea
              id="notes"
              rows={3}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Client expectations, tone guidance, constraints…"
            />
          </Field>
        </div>
      </Card>

      <Callout tone="info">
        Creating a campaign leaves it in <strong>Draft</strong>. Import the influencer list, assign
        operators, then activate it from the campaign page.
      </Callout>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {mode === "create" ? "Create campaign" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
