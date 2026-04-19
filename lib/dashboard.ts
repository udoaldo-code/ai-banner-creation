/**
 * lib/dashboard.ts — data layer for the operational dashboard
 *
 * All DB queries live here so the page stays presentational.
 * Every function is designed to be called once per page render with Promise.all.
 */

import { db } from "@/lib/db";
import { canReview, canViewAllRequests } from "@/lib/permissions";
import type { Role, RequestStatus, ReviewDecision } from "@/types";
import { STATUS_LABELS, DECISION_LABELS } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatRow {
  label: string;
  value: number | string;
  sub?: string;
  color?: "default" | "yellow" | "green" | "red" | "blue" | "purple";
  href?: string;
}

export interface StatusCount {
  status: RequestStatus;
  count: number;
}

export interface QueueItem {
  id: string;
  title: string;
  campaignName: string;
  priority: string;
  requester: string;
  roundNumber: number;
  waitingSince: Date; // when it entered IN_REVIEW (updatedAt proxy)
  revisionCount: number; // total review rounds so far
}

export interface ActivityEntry {
  id: string;
  action: string;
  label: string;
  actor: string | null;
  requestTitle: string | null;
  requestId: string | null;
  createdAt: Date;
}

export interface TurnaroundStats {
  avgDays: number | null;
  sampleSize: number;
  fastestDays: number | null;
  slowestDays: number | null;
}

// ── Shared stats (used by all roles) ─────────────────────────────────────────

export async function getSharedStats(userId: string, role: Role) {
  const isPrivileged = canViewAllRequests(role);

  const [totalRequests, pendingReview, totalVariants] = await Promise.all([
    db.request.count(isPrivileged ? undefined : { where: { requesterId: userId } }),

    canReview(role)
      ? db.request.count({ where: { status: "IN_REVIEW" } })
      : db.request.count({
          where: {
            requesterId: userId,
            status: { in: ["SUBMITTED", "IN_REVIEW", "IN_PROGRESS"] },
          },
        }),

    db.generatedVariant.count(
      isPrivileged ? undefined : { where: { request: { requesterId: userId } } }
    ),
  ]);

  return { totalRequests, pendingReview, totalVariants };
}

// ── Reviewer / Admin data ─────────────────────────────────────────────────────

export async function getStatusBreakdown(): Promise<StatusCount[]> {
  const rows = await db.request.groupBy({
    by: ["status"],
    _count: { status: true },
    orderBy: { status: "asc" },
  });

  // Return in workflow order
  const ORDER: RequestStatus[] = [
    "DRAFT",
    "SUBMITTED",
    "IN_PROGRESS",
    "IN_REVIEW",
    "REVISION_REQUESTED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
  ];

  return ORDER.map((status) => ({
    status,
    count: rows.find((r) => r.status === status)?._count.status ?? 0,
  })).filter((r) => r.count > 0);
}

export async function getReviewerQueue(): Promise<QueueItem[]> {
  const requests = await db.request.findMany({
    where: { status: "IN_REVIEW" },
    orderBy: { updatedAt: "asc" }, // oldest first = most urgent
    take: 12,
    include: {
      requester: { select: { name: true, email: true } },
      reviews: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        select: { roundNumber: true },
      },
      _count: { select: { reviews: true } },
    },
  });

  return requests.map((r) => ({
    id: r.id,
    title: r.title,
    campaignName: r.campaignName,
    priority: r.priority,
    requester: r.requester.name ?? r.requester.email,
    roundNumber: r.reviews[0]?.roundNumber ?? 1,
    waitingSince: r.updatedAt,
    revisionCount: r._count.reviews,
  }));
}

export async function getTurnaroundStats(): Promise<TurnaroundStats> {
  // Use Review.decidedAt vs Request.createdAt for accuracy
  const reviews = await db.review.findMany({
    where: { decidedAt: { not: null } },
    select: {
      decidedAt: true,
      request: { select: { createdAt: true } },
    },
    orderBy: { decidedAt: "desc" },
    take: 100,
  });

  const durations = reviews
    .filter((r) => r.decidedAt && r.request?.createdAt)
    .map((r) => (r.decidedAt!.getTime() - r.request.createdAt.getTime()) / 86_400_000); // ms → days

  if (durations.length === 0) {
    return { avgDays: null, sampleSize: 0, fastestDays: null, slowestDays: null };
  }

  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return {
    avgDays: Math.round(avg * 10) / 10,
    sampleSize: durations.length,
    fastestDays: Math.round(Math.min(...durations) * 10) / 10,
    slowestDays: Math.round(Math.max(...durations) * 10) / 10,
  };
}

export async function getRevisionStats() {
  const [withRevisions, totalCompleted, avgRoundsRaw] = await Promise.all([
    // Requests that went through at least 1 revision cycle
    db.request.count({
      where: { reviews: { some: { roundNumber: { gt: 1 } } } },
    }),
    // Total completed requests (approved + rejected)
    db.request.count({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
    }),
    // Average rounds per completed review (simple count)
    db.review.aggregate({
      _avg: { roundNumber: true },
      where: { decidedAt: { not: null } },
    }),
  ]);

  return {
    withRevisions,
    totalCompleted,
    avgRounds: avgRoundsRaw._avg.roundNumber
      ? Math.round(avgRoundsRaw._avg.roundNumber * 10) / 10
      : null,
  };
}

// ── Designer data ─────────────────────────────────────────────────────────────

export async function getDesignerWorkQueue() {
  const [needsGeneration, inProgress] = await Promise.all([
    db.request.findMany({
      where: { status: { in: ["SUBMITTED", "REVISION_REQUESTED"] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "asc" }],
      take: 10,
      include: { requester: { select: { name: true, email: true } } },
    }),
    db.request.findMany({
      where: { status: "IN_PROGRESS" },
      take: 5,
      include: { requester: { select: { name: true, email: true } } },
    }),
  ]);

  return { needsGeneration, inProgress };
}

// ── Requester data ────────────────────────────────────────────────────────────

export async function getRequesterStatusBreakdown(userId: string) {
  const rows = await db.request.groupBy({
    by: ["status"],
    where: { requesterId: userId },
    _count: { status: true },
  });

  return rows.map((r) => ({
    status: r.status as RequestStatus,
    count: r._count.status,
  }));
}

// ── Activity feed ─────────────────────────────────────────────────────────────

export async function getActivityFeed(
  opts: { requesterId?: string; limit?: number } = {}
): Promise<ActivityEntry[]> {
  const { requesterId, limit = 20 } = opts;

  const logs = await db.activityLog.findMany({
    where: requesterId
      ? { request: { requesterId } }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { name: true, email: true } },
      request: { select: { id: true, title: true } },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    label: formatActivityLabel(log),
    actor: log.actor ? (log.actor.name ?? log.actor.email) : null,
    requestTitle: log.request?.title ?? null,
    requestId: log.request?.id ?? null,
    createdAt: log.createdAt,
  }));
}

// ── Activity label formatter ──────────────────────────────────────────────────

function formatActivityLabel(log: {
  action: string;
  actor: { name: string | null; email: string } | null;
  request: { title: string } | null;
  metadata: unknown;
}): string {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const actor = log.actor ? (log.actor.name ?? log.actor.email) : "System";
  const title = log.request?.title;

  switch (log.action) {
    case "REQUEST_CREATED":
      return `${actor} created "${title ?? "a request"}"`;

    case "REQUEST_SUBMITTED":
      return `${actor} submitted "${title ?? "a request"}"`;

    case "REQUEST_CANCELLED":
      return `${actor} cancelled "${title ?? "a request"}"`;

    case "REQUEST_STATUS_CHANGED": {
      const newStatus = meta.newStatus as RequestStatus | undefined;
      const label = newStatus ? STATUS_LABELS[newStatus] : String(meta.newStatus ?? "unknown");
      return title
        ? `"${title}" → ${label}`
        : `Request status changed to ${label}`;
    }

    case "GENERATION_STARTED":
      return `Generation started${title ? ` for "${title}"` : ""}`;

    case "GENERATION_COMPLETED": {
      const count = typeof meta.successCount === "number" ? meta.successCount : null;
      return `Generation done — ${count != null ? `${count} banner${count !== 1 ? "s" : ""} ready` : "banners ready"}${title ? ` · "${title}"` : ""}`;
    }

    case "GENERATION_FAILED":
      return `Generation failed${title ? ` for "${title}"` : ""}`;

    case "REVIEW_OPENED": {
      const round = typeof meta.roundNumber === "number" ? meta.roundNumber : 1;
      return `Review opened (round ${round})${title ? ` · "${title}"` : ""}`;
    }

    case "REVIEW_DECISION_MADE": {
      const decision = meta.decision as ReviewDecision | undefined;
      const decisionLabel = decision
        ? DECISION_LABELS[decision] ?? String(decision)
        : "a decision";
      return `${actor} ${decisionLabel.toLowerCase()}${title ? ` "${title}"` : ""}`;
    }

    case "REVIEW_CHECKLIST_UPDATED":
      return `Checklist updated${title ? ` · "${title}"` : ""}`;

    case "TEMPLATE_CREATED":
      return `${actor} created a template`;

    case "TEMPLATE_UPDATED":
      return `${actor} updated a template`;

    case "TEMPLATE_VERSION_CREATED":
      return `Template version saved`;

    case "COMMENT_ADDED":
      return `${actor} commented${title ? ` on "${title}"` : ""}`;

    case "COMMENT_DELETED":
      return `${actor} deleted a comment`;

    case "USER_ROLE_CHANGED": {
      const targetName = typeof meta.targetName === "string" ? meta.targetName : "a user";
      const newRole = typeof meta.newRole === "string" ? meta.newRole.replace(/_/g, " ") : "";
      return `${actor} changed ${targetName}'s role${newRole ? ` to ${newRole.toLowerCase()}` : ""}`;
    }

    default:
      return log.action.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
  }
}

// ── Colour helpers used in the UI ─────────────────────────────────────────────

export const STATUS_BAR_COLORS: Record<RequestStatus, string> = {
  DRAFT: "bg-gray-300",
  SUBMITTED: "bg-blue-400",
  IN_PROGRESS: "bg-yellow-400",
  IN_REVIEW: "bg-purple-500",
  REVISION_REQUESTED: "bg-orange-400",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-400",
  CANCELLED: "bg-gray-200",
};

export const ACTION_ICON: Partial<Record<string, string>> = {
  REQUEST_SUBMITTED: "📥",
  REQUEST_CREATED: "📝",
  REQUEST_CANCELLED: "🚫",
  REQUEST_STATUS_CHANGED: "🔄",
  GENERATION_STARTED: "⚙️",
  GENERATION_COMPLETED: "✅",
  GENERATION_FAILED: "❌",
  REVIEW_OPENED: "👀",
  REVIEW_DECISION_MADE: "🏁",
  COMMENT_ADDED: "💬",
  TEMPLATE_CREATED: "🎨",
  USER_ROLE_CHANGED: "👤",
};
