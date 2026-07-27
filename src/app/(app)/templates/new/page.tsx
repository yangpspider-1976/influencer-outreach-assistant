import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { has } from "@/lib/rbac";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/primitives";
import { TemplateEditor } from "@/components/template-editor";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const user = await requirePageUser();
  if (!has(user.permissions, "templates_write")) redirect("/templates");

  return (
    <Page>
      <PageHeader
        title="New message template"
        description="Compose the approved first-contact copy. Variables are replaced with campaign and influencer values when an operator opens the workspace."
      />
      <div className="mt-7">
        <TemplateEditor mode="create" />
      </div>
    </Page>
  );
}
