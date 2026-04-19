import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchiveToggle } from "@/components/templates/ArchiveToggle";
import { format } from "date-fns";
import type { Role } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TemplateDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return null;

  const template = await db.template.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      versions: { orderBy: { version: "desc" } },
      _count: { select: { requests: true } },
    },
  });

  if (!template) notFound();

  const canManage = canManageTemplates(session.user.role as Role);

  return (
    <div>
      <Header
        title={template.name}
        description={template.description ?? "Brand template"}
        action={
          <div className="flex items-center gap-2">
            {canManage && !template.isArchived && (
              <>
                <ArchiveToggle templateId={template.id} isArchived={false} />
                <Link href={`/templates/${template.id}/edit`}>
                  <Button size="sm">Edit Template</Button>
                </Link>
              </>
            )}
            {canManage && template.isArchived && (
              <ArchiveToggle templateId={template.id} isArchived={true} />
            )}
            <Link
              href="/templates"
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        {/* Left: brand identity */}
        <div className="col-span-2 space-y-4">
          <Card>
            <div className="flex h-3 rounded-t-lg overflow-hidden">
              <div className="flex-1" style={{ backgroundColor: template.primaryColor }} />
              <div className="flex-1" style={{ backgroundColor: template.secondaryColor }} />
              {template.accentColor && (
                <div className="flex-1" style={{ backgroundColor: template.accentColor }} />
              )}
            </div>
            <CardContent className="pt-4 space-y-4">
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {template.isDefault && <Badge className="bg-blue-100 text-blue-700">Default</Badge>}
                {template.isArchived && <Badge className="bg-gray-100 text-gray-500">Archived</Badge>}
                {template.category && (
                  <Badge className="bg-indigo-50 text-indigo-600 capitalize">{template.category}</Badge>
                )}
                {template.layoutStyle && (
                  <Badge className="bg-gray-100 text-gray-600 capitalize">{template.layoutStyle}</Badge>
                )}
                {template.tone && (
                  <Badge className="bg-gray-100 text-gray-600 capitalize">{template.tone}</Badge>
                )}
                {template.industry && (
                  <Badge className="bg-gray-100 text-gray-600">{template.industry}</Badge>
                )}
              </div>

              {/* Colors */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Brand Colors</p>
                <div className="flex gap-3">
                  {[
                    { label: "Primary", value: template.primaryColor },
                    { label: "Secondary", value: template.secondaryColor },
                    ...(template.accentColor ? [{ label: "Accent", value: template.accentColor }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full border border-gray-200 shadow-sm"
                        style={{ backgroundColor: value }}
                      />
                      <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-xs font-mono text-gray-700">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Font */}
              {template.fontStack && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Font Stack</p>
                  <p className="text-xs font-mono text-gray-700">{template.fontStack}</p>
                </div>
              )}

              {/* Supported sizes */}
              {template.supportedSizes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Supported Sizes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.supportedSizes.map((s) => (
                      <span key={s} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5 font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Do's */}
              {template.doNotes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Brand Do&apos;s
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{template.doNotes}</p>
                </div>
              )}

              {/* Don'ts */}
              {template.dontNotes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Brand Don&apos;ts
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{template.dontNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: version history */}
        <div className="space-y-4">
          <Card>
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Version History
                <span className="ml-1.5 text-xs text-gray-400 font-normal">
                  ({template.versions.length})
                </span>
              </h2>
            </div>
            {template.versions.length === 0 ? (
              <CardContent className="py-6 text-center">
                <p className="text-xs text-gray-400">No versions recorded yet.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
                {template.versions.map((v, idx) => {
                  const snap = v.snapshot as Record<string, unknown>;
                  const event = snap._event as string | undefined;
                  return (
                    <div key={v.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-800">
                          v{v.version}
                          {idx === 0 && (
                            <span className="ml-1.5 text-blue-600 font-normal">(current)</span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(v.createdAt, "d MMM yyyy")}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 capitalize">{event ?? "updated"}</p>
                      {/* Show color swatches from this version */}
                      {snap.primaryColor && (
                        <div className="flex gap-1 mt-1.5">
                          {[snap.primaryColor, snap.secondaryColor, snap.accentColor]
                            .filter(Boolean)
                            .map((c) => (
                              <div
                                key={c as string}
                                className="h-3 w-3 rounded-full border border-gray-200"
                                style={{ backgroundColor: c as string }}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Used by</span>
                <span className="font-medium text-gray-800">
                  {template._count.requests} request{template._count.requests !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Created by</span>
                <span className="font-medium text-gray-800 truncate ml-2">
                  {template.createdBy.name ?? template.createdBy.email}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Created</span>
                <span className="font-medium text-gray-800">
                  {format(template.createdAt, "d MMM yyyy")}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Last updated</span>
                <span className="font-medium text-gray-800">
                  {format(template.updatedAt, "d MMM yyyy")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
