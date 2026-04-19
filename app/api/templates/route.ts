import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { z } from "zod";
import type { Role } from "@/types";

export const templateSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  supportedSizes: z.array(z.string()).default([]),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("")),
  fontStack: z.string().optional(),
  logoKey: z.string().optional(),
  layoutStyle: z.enum(["bold", "minimal", "editorial", "balanced"]).default("balanced"),
  industry: z.string().optional(),
  tone: z.enum(["professional", "playful", "luxury", "urgent", "friendly"]).optional(),
  doNotes: z.string().optional(),
  dontNotes: z.string().optional(),
  isDefault: z.boolean().default(false),
});

// GET /api/templates — list all non-archived templates
// Pass ?archived=true to include archived ones (admin only)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const showArchived =
    req.nextUrl.searchParams.get("archived") === "true" &&
    canManageTemplates(session.user.role as Role);

  const templates = await db.template.findMany({
    where: showArchived ? undefined : { isArchived: false },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { requests: true, versions: true } },
    },
  });

  return NextResponse.json(templates);
}

// POST /api/templates — create a template
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageTemplates(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden: CREATIVE_HEAD or ADMIN role required" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.issues }, { status: 422 });
  }

  const data = parsed.data;

  // Unset any existing default before setting a new one
  if (data.isDefault) {
    await db.template.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  const template = await db.template.create({
    data: {
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      supportedSizes: data.supportedSizes,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      accentColor: data.accentColor || null,
      fontStack: data.fontStack || null,
      logoKey: data.logoKey || null,
      layoutStyle: data.layoutStyle,
      industry: data.industry || null,
      tone: data.tone || null,
      doNotes: data.doNotes || null,
      dontNotes: data.dontNotes || null,
      isDefault: data.isDefault,
      createdById: session.user.id,
    },
  });

  // Seed version 1 immediately so history always has at least one entry
  await db.templateVersion.create({
    data: {
      templateId: template.id,
      version: 1,
      snapshot: { ...template, _event: "created" },
    },
  });

  await logActivity({
    action: "TEMPLATE_CREATED",
    entityType: "Template",
    entityId: template.id,
    actorId: session.user.id,
    metadata: { name: template.name, category: template.category },
  });

  return NextResponse.json(template, { status: 201 });
}
