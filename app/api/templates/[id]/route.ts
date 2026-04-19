import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { z } from "zod";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  supportedSizes: z.array(z.string()).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().optional(),
  fontStack: z.string().optional(),
  logoKey: z.string().optional(),
  layoutStyle: z.enum(["bold", "minimal", "editorial", "balanced"]).optional(),
  industry: z.string().optional(),
  tone: z.string().optional(),
  doNotes: z.string().optional(),
  dontNotes: z.string().optional(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

// GET /api/templates/[id] — fetch a single template with its version history
export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await db.template.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      versions: { orderBy: { version: "desc" }, take: 10 },
      _count: { select: { requests: true, versions: true } },
    },
  });

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

// PATCH /api/templates/[id] — update template fields; snapshots a new version on every save
export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageTemplates(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.issues }, { status: 422 });
  }

  const data = parsed.data;

  // Unset existing default if this one is being set as default
  if (data.isDefault) {
    await db.template.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  // Count existing versions to determine the next version number
  const versionCount = await db.templateVersion.count({ where: { templateId: id } });

  const template = await db.template.update({
    where: { id },
    data: {
      ...data,
      // Normalise empty strings to null for optional fields
      accentColor: data.accentColor !== undefined ? (data.accentColor || null) : undefined,
      fontStack: data.fontStack !== undefined ? (data.fontStack || null) : undefined,
      category: data.category !== undefined ? (data.category || null) : undefined,
      industry: data.industry !== undefined ? (data.industry || null) : undefined,
    },
  });

  // Snapshot the updated state as a new version
  await db.templateVersion.create({
    data: {
      templateId: id,
      version: versionCount + 1,
      snapshot: { ...(template as object), _event: "updated" },
    },
  });

  await logActivity({
    action: "TEMPLATE_UPDATED",
    entityType: "Template",
    entityId: id,
    actorId: session.user.id,
    metadata: { updatedFields: Object.keys(data), version: versionCount + 1 },
  });

  return NextResponse.json(template);
}

// DELETE /api/templates/[id] — archive (soft delete) the template
// Hard delete is blocked when any request references this template.
export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageTemplates(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inUse = await db.request.count({ where: { templateId: id } });

  if (inUse > 0) {
    // Soft archive — keeps data intact for existing requests
    const template = await db.template.update({
      where: { id },
      data: { isArchived: true, isDefault: false },
    });
    await logActivity({
      action: "TEMPLATE_UPDATED",
      entityType: "Template",
      entityId: id,
      actorId: session.user.id,
      metadata: { _action: "archived", usedByRequests: inUse },
    });
    return NextResponse.json({ archived: true, template });
  }

  // No requests — safe to hard delete
  await db.template.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
