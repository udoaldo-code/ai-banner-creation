import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, canReview } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  DECISION_LABELS,
  DECISION_COLORS,
  type RequestStatus,
  type ReviewDecision,
  type Role,
} from "@/types";
import { formatDistanceToNow } from "date-fns";

export default async function ReviewQueuePage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canReview(session.user.role as Role)) redirect("/");

  const [pendingReviews, completedReviews] = await Promise.all([
    db.request.findMany({
      where: { status: "IN_REVIEW" },
      orderBy: { updatedAt: "asc" },
      include: {
        requester: { select: { name: true, email: true } },
        _count: { select: { generationRuns: true } },
        reviews: {
          orderBy: { roundNumber: "desc" },
          take: 1,
          include: { reviewer: { select: { name: true } } },
        },
      },
    }).catch(() => []),
    db.request.findMany({
      where: { status: { in: ["APPROVED", "REJECTED", "REVISION_REQUESTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        requester: { select: { name: true, email: true } },
        reviews: {
          orderBy: { roundNumber: "desc" },
          take: 1,
          include: { reviewer: { select: { name: true } } },
        },
      },
    }).catch(() => []),
  ]);

  return (
    <div>
      <Header
        title="Review Queue"
        description={`${pendingReviews.length} pending`}
      />

      <div className="space-y-6">
        {/* Pending */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Awaiting Review ({pendingReviews.length})
          </h2>
          {pendingReviews.length === 0 ? (
            <Card>
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                No banners awaiting review. You&apos;re all caught up!
              </div>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-gray-100">
                {pendingReviews.map((req) => {
                  const review = req.reviews[0];
                  return (
                    <Link
                      key={req.id}
                      href={`/review/${req.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{req.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {req.campaignName}
                          {" · "}
                          {req.requester.name ?? req.requester.email}
                          {" · "}
                          {req._count.generationRuns} run{req._count.generationRuns !== 1 ? "s" : ""}
                          {review?.reviewer?.name && ` · assigned to ${review.reviewer.name}`}
                          {" · "}
                          {formatDistanceToNow(req.updatedAt, { addSuffix: true })}
                        </p>
                        {review && (
                          <p className="text-xs text-blue-600 mt-0.5">
                            Round {review.roundNumber}
                          </p>
                        )}
                      </div>
                      <Badge className={STATUS_COLORS[req.status as RequestStatus]}>
                        {STATUS_LABELS[req.status as RequestStatus]}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </section>

        {/* Recent decisions */}
        {completedReviews.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Recent Decisions
            </h2>
            <Card>
              <div className="divide-y divide-gray-100">
                {completedReviews.map((req) => {
                  const review = req.reviews[0];
                  return (
                    <Link
                      key={req.id}
                      href={`/requests/${req.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{req.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {req.requester.name ?? req.requester.email}
                          {review?.reviewer?.name && ` · reviewed by ${review.reviewer.name}`}
                          {" · "}
                          {formatDistanceToNow(req.updatedAt, { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {review?.decision && (
                          <Badge className={DECISION_COLORS[review.decision as ReviewDecision]}>
                            {DECISION_LABELS[review.decision as ReviewDecision]}
                          </Badge>
                        )}
                        <Badge className={STATUS_COLORS[req.status as RequestStatus]}>
                          {STATUS_LABELS[req.status as RequestStatus]}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
