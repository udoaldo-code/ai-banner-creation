import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { Header } from "@/components/layout/header";
import { TemplateForm } from "@/components/templates/TemplateForm";
import type { Role } from "@/types";

export default async function NewTemplatePage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canManageTemplates(session.user.role as Role)) redirect("/templates");

  return (
    <div>
      <Header
        title="New Brand Template"
        description="Define a reusable brand identity for AI banner generation."
      />
      <TemplateForm />
    </div>
  );
}
