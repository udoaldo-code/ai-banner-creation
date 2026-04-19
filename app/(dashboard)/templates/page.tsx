import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArchiveToggle } from "@/components/templates/ArchiveToggle";
import type { Role } from "@/types";

interface Props {
  searchParams: Promise<{ archived?: string }>;
}

export default async function TemplatesPage({ searchParams }: Props) {
  const { archived } = await searchParams;
  const showArchived = archived === "true";

  const session = await getSession();
  if (!session?.user) return null;

  const canManage = canManageTemplates(session.user.role as Role);

  const templates = await db.template.findMany({
    where: showArchived ? undefined : { isArchived: false },
    orderBy: [{ isDefault: "desc" }, { isArchived: "asc" }, { name: "asc" }],
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { requests: true, versions: true } },
    },
  }).catch(() => []);

  const activeCount = templates.filter((t) => !t.isArchived).length;
  const archivedCount = templates.filter((t) => t.isArchived).length;

  return (
    <div>
      <Header
        title="Brand Templates"
        description="Reusable brand identities for AI banner generation"
        action={
          canManage ? (
            <Link href="/templates/new">
              <Button size="sm">New Template</Button>
            </Link>
          ) : undefined
        }
      />

      {/* Archived toggle */}
      {canManage && (
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/templates"
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              !showArchived
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Active{activeCount > 0 && ` (${activeCount})`}
          </Link>
          <Link
            href="/templates?archived=true"
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              showArchived
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Archived{archivedCount > 0 && ` (${archivedCount})`}
          </Link>
        </div>
      )}

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 text-sm">
              {showArchived ? "No archived templates." : "No templates yet."}
            </p>
            {canManage && !showArchived && (
              <Link href="/templates/new">
                <Button className="mt-4">Create first template</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className={`overflow-hidden ${t.isArchived ? "opacity-60" : ""}`}>
              {/* Color swatch strip */}
              <div className="flex h-2">
                <div className="flex-1" style={{ backgroundColor: t.primaryColor }} />
                <div className="flex-1" style={{ backgroundColor: t.secondaryColor }} />
                {t.accentColor && (
                  <div className="flex-1" style={{ backgroundColor: t.accentColor }} />
                )}
              </div>

              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                      {t.isDefault && (
                        <Badge className="bg-blue-100 text-blue-700 shrink-0">Default</Badge>
                      )}
                      {t.isArchived && (
                        <Badge className="bg-gray-100 text-gray-500 shrink-0">Archived</Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                  {canManage && !t.isArchived && (
                    <Link href={`/templates/${t.id}/edit`}>
                      <Button variant="ghost" size="sm" className="text-xs shrink-0">
                        Edit
                      </Button>
                    </Link>
                  )}
                  {canManage && t.isArchived && (
                    <ArchiveToggle templateId={t.id} isArchived={true} />
                  )}
                </div>

                {/* Category + style tags */}
                <div className="flex flex-wrap gap-1.5">
                  {t.category && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5 capitalize font-medium">
                      {t.category}
                    </span>
                  )}
                  {t.layoutStyle && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                      {t.layoutStyle}
                    </span>
                  )}
                  {t.tone && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                      {t.tone}
                    </span>
                  )}
                  {t.industry && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                      {t.industry}
                    </span>
                  )}
                </div>

                {/* Supported sizes */}
                {t.supportedSizes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.supportedSizes.map((s) => (
                      <span key={s} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer meta */}
                <div className="flex items-center gap-3 pt-1 border-t border-gray-50">
                  <div className="flex gap-1.5">
                    {[t.primaryColor, t.secondaryColor, t.accentColor]
                      .filter(Boolean)
                      .map((c) => (
                        <div
                          key={c}
                          title={c!}
                          className="h-4 w-4 rounded-full border border-gray-200 shadow-sm"
                          style={{ backgroundColor: c! }}
                        />
                      ))}
                  </div>
                  <span className="text-xs text-gray-400 ml-auto">
                    {t._count.requests} request{t._count.requests !== 1 ? "s" : ""}
                  </span>
                  {t._count.versions > 0 && (
                    <Link
                      href={`/templates/${t.id}`}
                      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                    >
                      v{t._count.versions}
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
