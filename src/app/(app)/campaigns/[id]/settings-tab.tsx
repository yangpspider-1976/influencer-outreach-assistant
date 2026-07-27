"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardHeader, Callout } from "@/components/ui/primitives";
import { CampaignForm, type CampaignFormValues } from "@/components/campaign-form";
import { api } from "@/lib/client-api";

type CampaignPayload = {
  campaign: {
    id: string;
    name: string;
    clientId: string;
    location: string;
    visitStart: string;
    visitEnd: string;
    deliverables: string;
    deliverablesShort: string;
    compensation: string;
    applicationDeadline: string | null;
    targetCategory: string;
    targetLocation: string;
    briefUrl: string | null;
    briefLinkEnabled: boolean;
    ownerId: string;
    notes: string;
    followUpOffsetDays: number[];
    templateVersion: { templateId: string } | null;
  };
};

function toDateInput(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function CampaignSettingsTab({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const [values, setValues] = useState<Partial<CampaignFormValues> | null>(null);
  const [options, setOptions] = useState<{
    clients: { id: string; name: string }[];
    owners: { id: string; name: string }[];
    templates: { id: string; name: string; versionLabel: string; approved: boolean }[];
  } | null>(null);

  useEffect(() => {
    async function load() {
      const [detail, templates, users, clients] = await Promise.all([
        api.get<CampaignPayload>(`/api/campaigns/${campaignId}`),
        api.get<{
          templates: {
            id: string;
            name: string;
            currentVersion: { version: number; status: string } | null;
          }[];
        }>("/api/templates"),
        api.get<{ users: { id: string; name: string; roleKey: string }[] }>("/api/users"),
        api.get<{ clients: { id: string; name: string }[] }>("/api/clients"),
      ]);

      const campaign = detail.campaign;
      setValues({
        id: campaign.id,
        name: campaign.name,
        clientId: campaign.clientId,
        clientName: "",
        location: campaign.location,
        visitStart: toDateInput(campaign.visitStart),
        visitEnd: toDateInput(campaign.visitEnd),
        deliverables: campaign.deliverables,
        deliverablesShort: campaign.deliverablesShort,
        compensation: campaign.compensation,
        applicationDeadline: toDateInput(campaign.applicationDeadline),
        targetCategory: campaign.targetCategory,
        targetLocation: campaign.targetLocation,
        briefUrl: campaign.briefUrl ?? "",
        briefLinkEnabled: campaign.briefLinkEnabled,
        ownerId: campaign.ownerId,
        templateId: campaign.templateVersion?.templateId ?? "",
        notes: campaign.notes,
        followUpOffsetDays: campaign.followUpOffsetDays,
      });

      setOptions({
        clients: clients.clients,
        owners: users.users
          .filter((user) => ["ADMIN", "CAMPAIGN_MANAGER"].includes(user.roleKey))
          .map((user) => ({ id: user.id, name: user.name })),
        templates: templates.templates.map((template) => ({
          id: template.id,
          name: template.name,
          versionLabel: template.currentVersion ? `v${template.currentVersion.version}` : "no version",
          approved: template.currentVersion?.status === "APPROVED",
        })),
      });
    }
    void load();
  }, [campaignId]);

  if (!canWrite) {
    return (
      <Callout tone="info">
        Your role can view this campaign but cannot change its settings.
      </Callout>
    );
  }

  if (!values || !options) {
    return (
      <Card className="flex items-center justify-center gap-2 px-5 py-16 text-[13px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading campaign settings…
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader
          title="Edit campaign"
          description="Changes are versioned in the audit log. Editing an active campaign changes the copy operators see immediately."
        />
      </Card>
      <CampaignForm
        mode="edit"
        initial={values}
        currentUserId={values.ownerId ?? ""}
        clients={options.clients}
        owners={options.owners}
        templates={options.templates}
      />
    </div>
  );
}
