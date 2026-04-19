import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestSubmitSchema, requestDraftSchema } from "@/lib/validations";
import { notifyNewRequest } from "@/lib/slack";
import { logActivity } from "@/lib/activity";

// GET /api/requests — list requests scoped by role + optional filters
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = ["ADMIN", "CREATIVE_HEAD"].includes(session.user.role);
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");   // optional status filter
  const priority = searchParams.get("priority"); // optional priority filter
  const q = searchParams.get("q");              // optional text search

  const requests = await db.request.findMany({
    where: {
      ...(isAdmin ? {} : { requesterId: session.user.id }),
      ...(status ? { status: status as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { campaignName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    include: {
      requester: { select: { name: true, email: true } },
      template: { select: { name: true, primaryColor: true } },
      _count: { select: { attachments: true, comments: true, generationRuns: true } },
    },
  });

  return NextResponse.json(requests);
}

// POST /api/requests — create DRAFT or SUBMITTED
// Body includes `_action: "draft" | "submit"` to control status
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const action: "draft" | "submit" = body._action === "draft" ? "draft" : "submit";
  const schema = action === "draft" ? requestDraftSchema : requestSubmitSchema;

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Validate templateId if provided
  const templateId = (data.templateId as string | undefined)?.trim() || null;
  if (templateId) {
    const tpl = await db.template.findUnique({ where: { id: templateId } });
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const status = action === "draft" ? "DRAFT" : "SUBMITTED";

  const request = await db.request.create({
    data: {
      title: data.title,
      campaignName: data.campaignName || "",
      campaignObjective: (data.campaignObjective as string) || "",
      targetAudience: (data.targetAudience as string) || "",
      offerMessage: (data.offerMessage as string) || "",
      headline: (data.headline as string) || "",
      subheadline: (data.subheadline as string) || null,
      copyVariants: (data.copyVariants as string) || null,
      ctaText: (data.ctaText as string) || "",
      ctaUrl: (data.ctaUrl as string) || null,
      platforms: data.platforms || [],
      sizes: data.sizes || [],
      priority: data.priority || "NORMAL",
      priorityReason: (data.priorityReason as string) || null,
      brandColors: (data.brandColors as string[]) || [],
      notes: (data.notes as string) || null,
      deadline: data.deadline ? new Date(data.deadline as string) : null,
      requesterId: session.user.id,
      templateId,
      status,
    },
    include: { requester: true },
  });

  await logActivity({
    action: status === "SUBMITTED" ? "REQUEST_SUBMITTED" : "REQUEST_CREATED",
    entityType: "Request",
    entityId: request.id,
    actorId: session.user.id,
    requestId: request.id,
    metadata: { status, title: request.title },
  });

  if (status === "SUBMITTED") {
    notifyNewRequest({
      id: request.id,
      title: request.title,
      campaignName: request.campaignName,
      requesterName: request.requester.name ?? "Unknown",
      requesterEmail: request.requester.email,
      platforms: request.platforms,
      sizes: request.sizes,
      deadline: request.deadline,
    }).catch(console.error);
  }

  return NextResponse.json(request, { status: 201 });
}
