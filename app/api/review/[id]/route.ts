import { NextRequest, NextResponse } from "next/server";
import { getSession, canReview } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewDecisionSchema } from "@/lib/validations";
import { updateReviewMessage, notifyRequester } from "@/lib/slack";
import { logStatusChange, logReviewDecision } from "@/lib/activity";
import type { Role, RequestStatus } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

// POST /api/review/[requestId] — submit a review decision on the latest open review
export async function POST(req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canReview(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden: reviewer role required" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.issues }, { status: 422 });
  }

  const { decision, notes } = parsed.data;

  const request = await db.request.findUnique({
    where: { id: requestId },
    include: {
      requester: true,
      reviews: { orderBy: { roundNumber: "desc" }, take: 1 },
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "IN_REVIEW") {
    return NextResponse.json(
      { error: `Request must be IN_REVIEW to submit a decision (current: ${request.status})` },
      { status: 409 }
    );
  }

  const latestReview = request.reviews[0];
  if (!latestReview) {
    return NextResponse.json({ error: "No open review found for this request" }, { status: 404 });
  }

  const newStatus: RequestStatus =
    decision === "APPROVED"
      ? "APPROVED"
      : decision === "REJECTED"
        ? "REJECTED"
        : "REVISION_REQUESTED";

  // Update review + request status in one transaction.
  // On APPROVED: promote all remaining READY variants to APPROVED.
  const txResults = await db.$transaction([
    db.request.update({ where: { id: requestId }, data: { status: newStatus } }),
    db.review.update({
      where: { id: latestReview.id },
      data: {
        reviewerId: session.user.id,
        decision,
        notes: notes ?? null,
        decidedAt: new Date(),
      },
    }),
    ...(decision === "APPROVED"
      ? [
          db.generatedVariant.updateMany({
            where: { requestId, status: "READY" },
            data: { status: "APPROVED" },
          }),
        ]
      : []),
  ]);
  const updatedRequest = txResults[0] as Awaited<ReturnType<typeof db.request.update>>;
  const updatedReview = txResults[1] as Awaited<ReturnType<typeof db.review.update>>;

  await logStatusChange({
    requestId,
    actorId: session.user.id,
    oldStatus: "IN_REVIEW",
    newStatus,
    reason: notes,
  });

  await logReviewDecision({
    reviewId: latestReview.id,
    requestId,
    actorId: session.user.id,
    decision,
    roundNumber: latestReview.roundNumber,
    notes,
  });

  // Update Slack message if it exists
  if (updatedReview.slackMsgTs && updatedReview.slackChannelId) {
    updateReviewMessage(
      updatedReview.slackChannelId,
      updatedReview.slackMsgTs,
      decision,
      session.user.name ?? session.user.email ?? "Reviewer",
      { requestTitle: request.title, notes }
    ).catch(console.error);
  }

  // Notify requester (fire-and-forget)
  notifyRequester({
    requesterEmail: request.requester.email,
    requestTitle: request.title,
    requestId: request.id,
    decision,
    comments: notes,
  }).catch(console.error);

  return NextResponse.json({ request: updatedRequest, review: updatedReview });
}

// PATCH /api/review/[requestId]/checklist?itemId=xxx — toggle a checklist item
export async function PATCH(req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canReview(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const itemId = req.nextUrl.searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const item = await db.reviewChecklistItem.findUnique({
    where: { id: itemId },
    include: { review: { select: { requestId: true } } },
  });

  if (!item || item.review.requestId !== requestId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updated = await db.reviewChecklistItem.update({
    where: { id: itemId },
    data: { checked: typeof body.checked === "boolean" ? body.checked : !item.checked },
  });

  return NextResponse.json(updated);
}
