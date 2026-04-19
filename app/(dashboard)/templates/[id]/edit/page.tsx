import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { TemplateForm } from "@/components/templates/TemplateForm";
import type { Role } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return null;
  if (!canManageTemplates(session.user.role as Role)) redirect("/templates");

  const template = await db.template.findUnique({
    where: { id },
    include: { _count: { select: { versions: true } } },
  });
  if (!template) notFound();

  // Archived templates can't be edited — redirect to detail view
  if (template.isArchived) redirect(`/templates/${id}`);

  return (
    <div>
      <Header
        title={`Edit: ${template.name}`}
        description="Update brand identity and generation hints."
        action={
          template._count.versions > 0 ? (
            <Link
              href={`/templates/${id}`}
              className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              v{template._count.versions} · View history
            </Link>
          ) : undefined
        }
      />
      <TemplateForm template={template} />
    </div>
  );
}
