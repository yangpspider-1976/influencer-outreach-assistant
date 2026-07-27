import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { VARIABLE_CATALOG } from "@/lib/template";

export const metadata: Metadata = { title: "Message templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requirePageUser();
  if (!has(user.permissions, "campaigns_view")) redirect("/dashboard");

  const templates = await prisma.messageTemplate.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      currentVersion: true,
      createdBy: { select: { name: true } },
      _count: { select: { versions: true } },
    },
  });

  return (
    <Page>
      <PageHeader
        title="Message templates"
        description="Approved copy with campaign variables. Operators may personalize the rendered text, but the approved template itself never changes."
        actions={
          has(user.permissions, "templates_write") ? (
            <ButtonLink href="/templates/new">
              New template
            </ButtonLink>
          ) : null
        }
      />

      <div className="mt-7 grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {templates.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileText className="size-5" aria-hidden />}
                title="No templates yet"
                description="A campaign needs an approved template before it can be activated."
              />
            </Card>
          ) : (
            templates.map((template) => (
              <Card key={template.id}>
                <CardHeader
                  title={
                    <Link href={`/templates/${template.id}`} className="hover:text-brand-700">
                      {template.name}
                    </Link>
                  }
                  description={`${template.description || "No description"} · ${template._count.versions} version${
                    template._count.versions === 1 ? "" : "s"
                  } · ${template.createdBy.name}`}
                  action={
                    <div className="flex items-center gap-2">
                      <Badge tone={template.status === "APPROVED" ? "positive" : "warning"}>
                        {template.status === "APPROVED" ? "Approved" : "Draft"}
                      </Badge>
                      {template.currentVersion ? (
                        <Badge tone="info">v{template.currentVersion.version}</Badge>
                      ) : null}
                    </div>
                  }
                />
                <div className="p-5">
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-[12px] leading-6 text-slate-700">
                    {template.currentVersion?.content ?? "No content"}
                  </pre>
                  <p className="mt-3 text-[12px] text-slate-400">
                    Platform {template.platform.toLowerCase()} · {template.language.toUpperCase()} ·
                    updated {formatDate(template.updatedAt)}
                  </p>
                </div>
              </Card>
            ))
          )}
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Available variables"
            description="Write a token as {{name?}} to drop its whole line when the value is missing."
          />
          <ul className="divide-y divide-slate-100">
            {VARIABLE_CATALOG.map((variable) => (
              <li key={variable.token} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-700">
                    {`{{${variable.token}}}`}
                  </code>
                  {variable.required ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                      required
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">{variable.fallbackNote}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
