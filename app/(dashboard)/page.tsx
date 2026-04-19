import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canReview, canViewAllRequests } from "@/lib/permissions";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import {
  getSharedStats,
  getStatusBreakdown,
  getReviewerQueue,
  getTurnaroundStats,
  getRevisionStats,
  getDesignerWorkQueue,
  getRequesterStatusBreakdown,
  getActivityFeed,
  STATUS_BAR_COLORS,
} from "@/lib/dashboard";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_COLORS,
  type RequestStatus,
  type Role,
} from "@/types";
import { formatDistanceToNow } from "date-fns";

interface Props {
  searchParams: Promise<{ days?: string }>;
}

// ── Priority colours (may not yet exist in types/index.ts) ───────────────────
const PRIORITY_BADGE: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  NORMAL: "",
};

export default async function DashboardPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session?.user) return null;

  const role = session.user.role as Role;
  const userId = session.user.id;
  const isReviewer = canReview(role);
  const isDesigner = role === "DESIGNER";
  const activityLimit = 20;

  // ── Parallel data fetch based on role ──────────────────────────────────────
  const [shared, activity] = await Promise.all([
    getSharedStats(userId, role).catch(() => ({ totalRequests: 0, pendingReview: 0, totalVariants: 0 })),
    getActivityFeed({ requesterId: isReviewer ? undefined : userId, limit: activityLimit }).catch(() => []),
  ]);

  // Role-specific extras fetched together
  const reviewerExtras =
    isReviewer
      ? await Promise.all([
          getStatusBreakdown().catch(() => []),
          getReviewerQueue().catch(() => []),
          getTurnaroundStats().catch(() => ({ avgDays: null, sampleSize: 0, fastestDays: null, slowestDays: null })),
          getRevisionStats().catch(() => ({ withRevisions: 0, totalCompleted: 0, avgRounds: null })),
        ])
      : null;

  const designerExtras = isDesigner
    ? await getDesignerWorkQueue().catch(() => ({ needsGeneration: [], inProgress: [] }))
    : null;
  const requesterBreakdown =
    !isReviewer && !isDesigner
      ? await getRequesterStatusBreakdown(userId).catch(() => [])
      : null;

  // Unpack reviewer extras
  const [statusBreakdown, reviewerQueue, turnaround, revisions] = reviewerExtras ?? [
    null,
    null,
    null,
    null,
  ];

  const totalRequests = statusBreakdown
    ? statusBreakdown.reduce((sum, s) => sum + s.count, 0)
    : 0;

  return (
    <div className="space-y-6">
      <Header
        title={`Welcome, ${session.user.name ?? session.user.email}`}
        description={
          isReviewer
            ? "Operational overview — Banner Gen"
            : isDesigner
              ? "Your generation work queue"
              : "AI Banner Generator — your creative requests"
        }
        action={
          <Link href="/requests/new">
            <Button size="sm">New Request</Button>
          </Link>
        }
      />

      {/* ── REVIEWER / ADMIN ──────────────────────────────────────────────── */}
      {isReviewer && statusBreakdown && reviewerQueue && turnaround && revisions && (
        <>
          {/* Stat row */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Pending Review"
              value={shared.pendingReview}
              sub={shared.pendingReview === 0 ? "Queue clear" : "needs attention"}
              color={shared.pendingReview > 0 ? "yellow" : "green"}
              href="/review"
            />
            <StatCard
              label="Avg Turnaround"
              value={turnaround.avgDays != null ? `${turnaround.avgDays}d` : "—"}
              sub={
                turnaround.sampleSize > 0
                  ? `from ${turnaround.sampleSize} completed review${turnaround.sampleSize !== 1 ? "s" : ""}`
                  : "no completed reviews yet"
              }
              color="blue"
            />
            <StatCard
              label="Revision Loops"
              value={revisions.withRevisions}
              sub={
                revisions.totalCompleted > 0
                  ? `of ${revisions.totalCompleted} completed · avg ${revisions.avgRounds ?? "—"} rounds`
                  : "no completed requests"
              }
              color={revisions.withRevisions > 0 ? "purple" : "default"}
            />
            <StatCard
              label="Banners Generated"
              value={shared.totalVariants}
              color="default"
            />
          </div>

          {/* Status breakdown + Review queue */}
          <div className="grid grid-cols-3 gap-6">
            {/* Status breakdown */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">
                  Requests by Status
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {totalRequests} total
                  </span>
                </h2>
              </CardHeader>
              <CardContent className="pt-2 pb-4">
                {/* Segmented progress bar */}
                {totalRequests > 0 && (
                  <div className="flex h-2 rounded-full overflow-hidden mb-4">
                    {statusBreakdown.map((s) => (
                      <div
                        key={s.status}
                        title={`${STATUS_LABELS[s.status]}: ${s.count}`}
                        className={STATUS_BAR_COLORS[s.status]}
                        style={{ width: `${(s.count / totalRequests) * 100}%` }}
                      />
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  {statusBreakdown.map((s) => (
                    <Link
                      key={s.status}
                      href={`/requests?status=${s.status}`}
                      className="flex items-center justify-between group rounded px-2 py-1 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${STATUS_BAR_COLORS[s.status]}`}
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">
                          {STATUS_LABELS[s.status]}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">
                        {s.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Review queue — 2 cols wide */}
            <Card className="col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Review Queue
                    {reviewerQueue.length > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5">
                        {reviewerQueue.length}
                      </span>
                    )}
                  </h2>
                  <Link href="/review" className="text-xs text-blue-600 hover:underline">
                    Open review →
                  </Link>
                </div>
              </CardHeader>
              {reviewerQueue.length === 0 ? (
                <CardContent>
                  <p className="text-sm text-gray-400 text-center py-6">
                    ✓ Queue is clear
                  </p>
                </CardContent>
              ) : (
                <div className="divide-y divide-gray-50">
                  {reviewerQueue.map((item) => {
                    const waitTime = formatDistanceToNow(item.waitingSince, { addSuffix: true });
                    const isUrgent = item.priority === "URGENT";
                    const isHigh = item.priority === "HIGH";

                    return (
                      <Link
                        key={item.id}
                        href={`/review/${item.id}`}
                        className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors"
                      >
                        {/* Priority indicator */}
                        <div
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isUrgent
                              ? "bg-red-500"
                              : isHigh
                                ? "bg-orange-400"
                                : "bg-gray-300"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {item.requester} · {item.campaignName}
                          </p>
                        </div>
                        <div className="shrink-0 text-right space-y-0.5">
                          <p className="text-xs text-gray-400">{waitTime}</p>
                          {item.revisionCount > 1 && (
                            <p className="text-xs text-orange-600 font-medium">
                              Round {item.roundNumber}
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Turnaround detail (only if there's data) */}
          {turnaround.avgDays !== null && (
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Fastest Turnaround"
                value={`${turnaround.fastestDays}d`}
                sub="best recent completion"
                color="green"
              />
              <StatCard
                label="Slowest Turnaround"
                value={`${turnaround.slowestDays}d`}
                sub="worst recent completion"
                color={
                  turnaround.slowestDays !== null && turnaround.slowestDays > 7 ? "red" : "default"
                }
              />
              <StatCard
                label="Avg Revision Rounds"
                value={revisions.avgRounds ?? "—"}
                sub="among decided reviews"
                color={
                  revisions.avgRounds !== null && revisions.avgRounds > 2 ? "yellow" : "default"
                }
              />
            </div>
          )}

          {/* Activity feed */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Latest Activity</h2>
                <span className="text-xs text-gray-400">last {activityLimit} events</span>
              </div>
            </CardHeader>
            <ActivityFeed entries={activity} />
          </Card>
        </>
      )}

      {/* ── DESIGNER ─────────────────────────────────────────────────────── */}
      {isDesigner && designerExtras && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Needs Generation"
              value={designerExtras.needsGeneration.length}
              sub="SUBMITTED or REVISION_REQUESTED"
              color={designerExtras.needsGeneration.length > 0 ? "yellow" : "green"}
            />
            <StatCard
              label="Running Now"
              value={designerExtras.inProgress.length}
              color={designerExtras.inProgress.length > 0 ? "blue" : "default"}
            />
            <StatCard
              label="Banners Generated"
              value={shared.totalVariants}
            />
          </div>

          {/* Work queue */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Work Queue</h2>
                <Link href="/requests?status=SUBMITTED" className="text-xs text-blue-600 hover:underline">
                  All requests →
                </Link>
              </div>
            </CardHeader>
            {designerExtras.needsGeneration.length === 0 &&
            designerExtras.inProgress.length === 0 ? (
              <CardContent>
                <p className="text-sm text-gray-400 text-center py-6">No requests waiting for generation.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-gray-100">
                {[...designerExtras.inProgress, ...designerExtras.needsGeneration].map((req) => (
                  <Link
                    key={req.id}
                    href={`/requests/${req.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{req.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {req.campaignName} · {req.requester.name ?? req.requester.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {req.priority !== "NORMAL" && (
                        <Badge className={PRIORITY_BADGE[req.priority] ?? ""}>
                          {req.priority.toLowerCase()}
                        </Badge>
                      )}
                      <Badge className={STATUS_COLORS[req.status as RequestStatus]}>
                        {STATUS_LABELS[req.status as RequestStatus]}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Activity feed */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </CardHeader>
            <ActivityFeed entries={activity} emptyMessage="No activity yet." />
          </Card>
        </>
      )}

      {/* ── REQUESTER ────────────────────────────────────────────────────── */}
      {!isReviewer && !isDesigner && requesterBreakdown && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="My Requests"
              value={shared.totalRequests}
              href="/requests"
            />
            <StatCard
              label="Awaiting Response"
              value={shared.pendingReview}
              sub={shared.pendingReview > 0 ? "submitted or in review" : "nothing pending"}
              color={shared.pendingReview > 0 ? "yellow" : "green"}
            />
            <StatCard
              label="Banners Generated"
              value={shared.totalVariants}
              color="blue"
            />
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* My status breakdown */}
            {requesterBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-gray-900">My Requests by Status</h2>
                </CardHeader>
                <CardContent className="pt-2 pb-4 space-y-1.5">
                  {requesterBreakdown.map((s) => (
                    <Link
                      key={s.status}
                      href={`/requests?status=${s.status}`}
                      className="flex items-center justify-between group rounded px-2 py-1 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${STATUS_BAR_COLORS[s.status]}`} />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">
                          {STATUS_LABELS[s.status]}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{s.count}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Activity feed — 2 cols */}
            <Card className={requesterBreakdown.length > 0 ? "col-span-2" : "col-span-3"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Activity on My Requests</h2>
                </div>
              </CardHeader>
              <ActivityFeed
                entries={activity}
                emptyMessage="No activity on your requests yet."
              />
            </Card>
          </div>

          {/* Quick action if no requests */}
          {shared.totalRequests === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 text-sm">No requests yet.</p>
                <Link href="/requests/new">
                  <Button className="mt-4">Create your first request</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
