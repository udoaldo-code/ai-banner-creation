import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAdmin, canViewAllRequests } from "@/lib/permissions";
import { db } from "@/lib/db";
import { requestDraftSchema, requestSubmitSchema } from "@/lib/validations";
import { notifyNewRequest } from "@/lib/slack";
import { logActivity, logStatusChange } from "@/lib/activity";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.request.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      template: { select: { id: true, name: true, primaryColor: true, secondaryColor: true } },
      attachments: {
        include: { uploadedBy: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      generationRuns: {
        orderBy: { runNumber: "desc" },
        take: 1,
        include: {
          variants: { orderBy: [{ size: "asc" }, { variant: "asc" }] },
        },
      },
      reviews: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        include: {
          reviewer: { select: { name: true, email: true } },
          checklistItems: { orderBy: { sortOrder: "asc" } },
        },
      },
      _count: { select: { comments: true, attachments: true, generationRuns: true } },
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isPrivileged = canViewAllRequests(session.user.role as Role);

  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(request);
}

// PATCH /api/requests/[id]
// Accepts:
//   - partial request fields (any editable field)
//   - `_action: "submit"` — transition DRAFT → SUBMITTED
//   - `_action: "cancel"` — transition → CANCELLED
//   - `_action: "reopen"` — transition REVISION_REQUESTED → DRAFT (to allow edits)
export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.request.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action: string | undefined = body._action;

  // ── Action: submit ──────────────────────────────────────────────────────────
  if (action === "submit") {
    if (!["DRAFT", "REVISION_REQUESTED"].includes(request.status)) {
      return NextResponse.json(
        { error: `Cannot submit a request with status: ${request.status}` },
        { status: 409 }
      );
    }

    // Run full validation before submitting
    const parsed = requestSubmitSchema.safeParse({
      title: request.title,
      campaignName: request.campaignName,
      campaignObjective: request.campaignObjective,
      targetAudience: request.targetAudience,
      offerMessage: request.offerMessage,
      headline: request.headline,
      subheadline: request.subheadline,
      copyVariants: request.copyVariants,
      ctaText: request.ctaText,
      ctaUrl: request.ctaUrl,
      platforms: request.platforms,
      sizes: request.sizes,
      priority: request.priority,
      priorityReason: request.priorityReason,
      brandColors: request.brandColors,
      notes: request.notes,
      deadline: request.deadline?.toISOString(),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Request is incomplete. Fix validation errors before submitting.",
          issues: parsed.error.issues,
        },
        { status: 422 }
      );
    }

    const updated = await db.request.update({
      where: { id },
      data: { status: "SUBMITTED" },
      include: { requester: true },
    });

    await logStatusChange({
      requestId: id,
      actorId: session.user.id,
      oldStatus: request.status,
      newStatus: "SUBMITTED",
    });

    notifyNewRequest({
      id: updated.id,
      title: updated.title,
      campaignName: updated.campaignName,
      requesterName: updated.requester.name ?? "Unknown",
      requesterEmail: updated.requester.email,
      platforms: updated.platforms,
      sizes: updated.sizes,
      deadline: updated.deadline,
    }).catch(console.error);

    return NextResponse.json(updated);
  }

  // ── Action: cancel ──────────────────────────────────────────────────────────
  if (action === "cancel") {
    if (["APPROVED", "REJECTED", "CANCELLED"].includes(request.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a request with status: ${request.status}` },
        { status: 409 }
      );
    }

    const updated = await db.request.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await logStatusChange({
      requestId: id,
      actorId: session.user.id,
      oldStatus: request.status,
      newStatus: "CANCELLED",
      reason: body.reason,
    });

    return NextResponse.json(updated);
  }

  // ── Action: reopen (revision_requested → draft for editing) ─────────────────
  if (action === "reopen") {
    if (request.status !== "REVISION_REQUESTED") {
      return NextResponse.json(
        { error: "Only REVISION_REQUESTED requests can be reopened for editing" },
        { status: 409 }
      );
    }

    const updated = await db.request.update({
      where: { id },
      data: { status: "DRAFT" },
    });

    await logStatusChange({
      requestId: id,
      actorId: session.user.id,
      oldStatus: "REVISION_REQUESTED",
      newStatus: "DRAFT",
    });

    return NextResponse.json(updated);
  }

  // ── Default: field update (only allowed on DRAFT or REVISION_REQUESTED) ─────
  const editableStatuses = ["DRAFT", "REVISION_REQUESTED"];
  if (!editableStatuses.includes(request.status) && !isAdmin) {
    return NextResponse.json(
      { error: `Cannot edit a request with status: ${request.status}` },
      { status: 409 }
    );
  }

  // Validate changed fields against draft schema
  const draftFields = {
    title: body.title ?? request.title,
    campaignName: body.campaignName,
    campaignObjective: body.campaignObjective,
    targetAudience: body.targetAudience,
    offerMessage: body.offerMessage,
    headline: body.headline,
    subheadline: body.subheadline,
    copyVariants: body.copyVariants,
    ctaText: body.ctaText,
    ctaUrl: body.ctaUrl,
    platforms: body.platforms ?? [],
    sizes: body.sizes ?? [],
    priority: body.priority,
    priorityReason: body.priorityReason,
    brandColors: body.brandColors ?? [],
    deadline: body.deadline,
    notes: body.notes,
  };

  const parsed = requestDraftSchema.safeParse(draftFields);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const updateData: Record<string, unknown> = {};
  const allowedFields = [
    "title", "campaignName", "campaignObjective", "targetAudience",
    "offerMessage", "headline", "subheadline", "copyVariants",
    "ctaText", "ctaUrl", "platforms", "sizes", "priority", "priorityReason",
    "brandColors", "notes", "templateId", "assignedToId",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      updateData[field] = body[field] === "" ? null : body[field];
    }
  }

  if (body.deadline !== undefined) {
    updateData.deadline = body.deadline ? new Date(body.deadline as string) : null;
  }

  const updated = await db.request.update({ where: { id }, data: updateData });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.request.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!["DRAFT", "REJECTED", "CANCELLED"].includes(request.status)) {
    return NextResponse.json(
      { error: "Can only delete DRAFT, REJECTED, or CANCELLED requests" },
      { status: 409 }
    );
  }

  await db.request.delete({ where: { id } });

  await logActivity({
    action: "REQUEST_CANCELLED",
    entityType: "Request",
    entityId: id,
    actorId: session.user.id,
    metadata: { deletedTitle: request.title },
  });

  return new NextResponse(null, { status: 204 });
}
