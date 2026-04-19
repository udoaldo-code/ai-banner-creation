import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canReview, canViewAllRequests } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/banners/variant/[id]
// Returns the full variant record including htmlContent (for client-side preview).
export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variant = await db.generatedVariant.findUnique({
    where: { id },
    include: { request: { select: { requesterId: true } } },
  });

  if (!variant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = variant.request.requesterId === session.user.id;
  const isPrivileged = canViewAllRequests(session.user.role as Role);
  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: variant.id,
    size: variant.size,
    variant: variant.variant,
    status: variant.status,
    htmlContent: variant.htmlContent,
    storageKey: variant.storageKey,
    durationMs: variant.durationMs,
    error: variant.error,
  });
}

// PATCH /api/banners/variant/[id]
// Body: { status: "APPROVED" | "REJECTED" | "READY" }
// Reviewers mark individual variants during the review phase.
// Only valid when the parent request is IN_REVIEW.
export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canReview(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden: reviewer role required" }, { status: 403 });
  }

  const variant = await db.generatedVariant.findUnique({
    where: { id },
    include: { request: { select: { id: true, status: true } } },
  });

  if (!variant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (variant.request.status !== "IN_REVIEW") {
    return NextResponse.json(
      { error: "Variants can only be marked during IN_REVIEW" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const allowed = ["APPROVED", "REJECTED", "READY"] as const;
  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowed.join(", ")}` },
      { status: 400 }
    );
  }

  const updated = await db.generatedVariant.update({
    where: { id },
    data: { status: body.status },
  });

  await logActivity({
    action: "REVIEW_CHECKLIST_UPDATED", // closest available action
    entityType: "GeneratedVariant",
    entityId: id,
    actorId: session.user.id,
    requestId: variant.request.id,
    metadata: { oldStatus: variant.status, newStatus: body.status },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
