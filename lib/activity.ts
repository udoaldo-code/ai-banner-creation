/**
 * lib/activity.ts — audit log helper
 *
 * Usage:
 *   import { logActivity } from "@/lib/activity";
 *
 *   await logActivity({
 *     action: "REQUEST_SUBMITTED",
 *     entityType: "Request",
 *     entityId: request.id,
 *     actorId: session.user.id,
 *     requestId: request.id,
 *     metadata: { status: "SUBMITTED", sizes: request.sizes },
 *   });
 *
 * Errors are caught and logged to stderr — activity logging must never
 * block or break the primary operation.
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ActivityAction } from "@/types";

interface LogActivityParams {
  action: ActivityAction;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId ?? null,
        requestId: params.requestId ?? null,
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    // Activity logging must never crash the caller
    console.error("[activity] Failed to write activity log:", err);
  }
}

/**
 * Convenience wrapper — logs a request status transition.
 */
export async function logStatusChange(params: {
  requestId: string;
  actorId: string | null;
  oldStatus: string;
  newStatus: string;
  reason?: string;
}): Promise<void> {
  await logActivity({
    action: "REQUEST_STATUS_CHANGED",
    entityType: "Request",
    entityId: params.requestId,
    actorId: params.actorId,
    requestId: params.requestId,
    metadata: {
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      ...(params.reason ? { reason: params.reason } : {}),
    },
  });
}

/**
 * Convenience wrapper — logs a review decision.
 */
export async function logReviewDecision(params: {
  reviewId: string;
  requestId: string;
  actorId: string | null; // null for external/system actions (e.g., Slack)
  decision: string;
  roundNumber: number;
  notes?: string | null;
}): Promise<void> {
  await logActivity({
    action: "REVIEW_DECISION_MADE",
    entityType: "Review",
    entityId: params.reviewId,
    actorId: params.actorId,
    requestId: params.requestId,
    metadata: {
      decision: params.decision,
      roundNumber: params.roundNumber,
      hasNotes: !!params.notes,
    },
  });
}

/**
 * Fetch recent activity for a request, newest first.
 */
export async function getRequestActivity(
  requestId: string,
  limit = 50
): Promise<
  {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: Date;
    actor: { id: string; name: string | null; email: string } | null;
  }[]
> {
  return db.activityLog.findMany({
    where: { requestId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}
