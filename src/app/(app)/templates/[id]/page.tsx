import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { Page } from "@/components/ui/page";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { TemplateEditor } from "@/components/template-editor";

export const metadata: Metadata = { title: "Template" };
export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "campaigns_view")) redirect("/dashboard");
  const { id } = await params;

  const template = await prisma.messageTemplate.findUnique({
    where: { id },
    include: {
      currentVersion: true,
      versions: {
        orderBy: { version: "desc" },
        include: { approvedBy: { select: { name: true } } },
      },
    },
  });
  if (!template) notFound();

  const canWrite = has(user.permissions, "templates_write");

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Message templates
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {template.name}
            <Badge tone={template.status === "APPROVED" ? "positive" : "warning"}>
              {template.status === "APPROVED" ? "Approved" : "Draft"}
            </Badge>
          </span>
        }
        description={template.description || "No description recorded."}
      />

      <div className="mt-7 space-y-6">
        {canWrite ? (
          <TemplateEditor
            mode="edit"
            template={{
              id: template.id,
              name: template.name,
              platform: template.platform,
              language: template.language,
              description: template.description,
              status: template.status,
              content: template.currentVersion?.content ?? "",
              versionId: template.currentVersionId,
              version: template.currentVersion?.version ?? 1,
              canApprove: has(user.permissions, "templates_approve"),
            }}
          />
        ) : (
          <Card>
            <CardHeader title="Current content" />
            <pre className="whitespace-pre-wrap p-5 font-mono text-[13px] leading-6 text-slate-700">
              {template.currentVersion?.content ?? "No content"}
            </pre>
          </Card>
        )}

        <Card>
          <CardHeader title="Version history" description="Every saved version is retained for audit." />
          <ul className="divide-y divide-slate-100">
            {template.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Badge tone={version.id === template.currentVersionId ? "info" : "neutral"}>
                  v{version.version}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">
                  {version.versionNote || "No version note"}
                </span>
                <span className="text-[12px] text-slate-400">
                  {formatDateTime(version.createdAt)}
                </span>
                <Badge tone={version.status === "APPROVED" ? "positive" : "warning"}>
                  {version.status === "APPROVED"
                    ? `Approved by ${version.approvedBy?.name ?? "—"}`
                    : "Draft"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
