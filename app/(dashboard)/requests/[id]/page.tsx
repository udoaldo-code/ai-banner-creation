import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAdmin, canReview } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getRequestActivity } from "@/lib/activity";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BannerGrid } from "@/components/banners/BannerGrid";
import { CommentThread } from "@/components/requests/CommentThread";
import { AttachmentList } from "@/components/requests/AttachmentList";
import { RequestActions } from "@/components/requests/RequestActions";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  DECISION_LABELS,
  DECISION_COLORS,
  type RequestStatus,
  type ReviewDecision,
  type Role,
} from "@/types";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequestDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return null;

  const [request, activity] = await Promise.all([
    db.request.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        template: { select: { id: true, name: true, primaryColor: true, secondaryColor: true } },
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
    }),
    getRequestActivity(id, 20),
  ]);

  if (!request) notFound();

  const isOwner = request.requesterId === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);
  const isReviewer = canReview(session.user.role as Role);
  const isDesigner = session.user.role === "DESIGNER";

  if (!isOwner && !isAdmin && !isReviewer && !isDesigner) {
    notFound();
  }

  const latestRun = request.generationRuns[0] ?? null;
  const latestReview = request.reviews[0] ?? null;

  const canUploadAttachment = isOwner || isAdmin;

  // Map variants to enriched shape BannerGrid expects
  const banners = latestRun?.variants.map((v) => ({
    ...v,
    previewUrl: null as string | null, // presigned URLs fetched client-side in BannerGrid
  })) ?? [];

  return (
    <div>
      <Header
        title={request.title}
        description={`Campaign: ${request.campaignName}`}
        action={
          <RequestActions
            requestId={id}
            status={request.status as RequestStatus}
            isOwner={isOwner}
            isAdmin={isAdmin}
            isReviewer={isReviewer}
          />
        }
      />

      <div className="grid grid-cols-3 gap-6">
        {/* ── Left sidebar: brief + status ────────────────────────────────────── */}
        <div className="col-span-1 space-y-4">
          {/* Status card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Status</h2>
                <Badge className={STATUS_COLORS[request.status as RequestStatus]}>
                  {STATUS_LABELS[request.status as RequestStatus]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Requester">
                {request.requester.name ?? request.requester.email}
              </DetailRow>
              {request.assignedTo && (
                <DetailRow label="Assigned To">
                  {request.assignedTo.name ?? request.assignedTo.email}
                </DetailRow>
              )}
              {request.deadline && (
                <DetailRow label="Deadline">
                  {format(request.deadline, "PPP")}
                </DetailRow>
              )}
              <DetailRow label="Priority">
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLORS[request.priority]}`}>
                  {PRIORITY_LABELS[request.priority]}
                </span>
              </DetailRow>
              {request.priorityReason && (
                <DetailRow label="Priority Reason">
                  <span className="text-xs text-gray-600">{request.priorityReason}</span>
                </DetailRow>
              )}
              <DetailRow label="Runs">
                {request._count.generationRuns}
              </DetailRow>
            </CardContent>
          </Card>

          {/* Brief card */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Brief</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Campaign Objective">
                <span className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed">
                  {request.campaignObjective}
                </span>
              </DetailRow>
              <DetailRow label="Target Audience">
                <span className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed">
                  {request.targetAudience}
                </span>
              </DetailRow>
              <DetailRow label="Offer / Key Message">
                <span className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed">
                  {request.offerMessage}
                </span>
              </DetailRow>
              <DetailRow label="Headline">
                {request.headline}
              </DetailRow>
              {request.subheadline && (
                <DetailRow label="Subheadline">{request.subheadline}</DetailRow>
              )}
              <DetailRow label="CTA">
                {request.ctaText}
                {request.ctaUrl && (
                  <> · <a href={request.ctaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{request.ctaUrl}</a></>
                )}
              </DetailRow>
              {request.copyVariants && (
                <DetailRow label="Copy Variants">
                  <span className="whitespace-pre-wrap text-xs text-gray-600">{request.copyVariants}</span>
                </DetailRow>
              )}
              <DetailRow label="Platforms">
                <div className="flex flex-wrap gap-1">
                  {request.platforms.map((p) => (
                    <span key={p} className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5">{p}</span>
                  ))}
                </div>
              </DetailRow>
              <DetailRow label="Sizes">
                <div className="flex flex-wrap gap-1">
                  {request.sizes.map((s) => (
                    <span key={s} className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-mono">{s}</span>
                  ))}
                </div>
              </DetailRow>
              {request.brandColors.length > 0 && (
                <DetailRow label="Brand Colors">
                  <div className="flex gap-1.5">
                    {request.brandColors.map((c) => (
                      <div key={c} title={c} className="h-5 w-5 rounded-full border border-gray-200" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </DetailRow>
              )}
              {request.template && (
                <DetailRow label="Template">
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-8 rounded overflow-hidden">
                      <div className="flex-1" style={{ backgroundColor: request.template.primaryColor }} />
                      <div className="flex-1" style={{ backgroundColor: request.template.secondaryColor }} />
                    </div>
                    <span className="text-xs text-gray-700">{request.template.name}</span>
                  </div>
                </DetailRow>
              )}
              {request.notes && (
                <DetailRow label="Notes">
                  <span className="whitespace-pre-wrap text-xs text-gray-600">{request.notes}</span>
                </DetailRow>
              )}
            </CardContent>
          </Card>

          {/* Latest review card */}
          {latestReview && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">
                  Review
                  {latestReview.roundNumber > 1 && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">Round {latestReview.roundNumber}</span>
                  )}
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {latestReview.decision && (
                  <DetailRow label="Decision">
                    <Badge className={DECISION_COLORS[latestReview.decision as ReviewDecision]}>
                      {DECISION_LABELS[latestReview.decision as ReviewDecision]}
                    </Badge>
                  </DetailRow>
                )}
                {latestReview.reviewer && (
                  <DetailRow label="Reviewer">
                    {latestReview.reviewer.name ?? latestReview.reviewer.email}
                  </DetailRow>
                )}
                {latestReview.notes && (
                  <DetailRow label="Notes">
                    <span className="whitespace-pre-wrap text-xs text-gray-600">{latestReview.notes}</span>
                  </DetailRow>
                )}
                {latestReview.checklistItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Checklist</p>
                    <ul className="space-y-1">
                      {latestReview.checklistItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className={item.checked ? "text-green-600" : "text-gray-300"}>
                            {item.checked ? "✓" : "○"}
                          </span>
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity log */}
          {activity.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {activity.map((event) => (
                    <li key={event.id} className="flex items-start gap-2 text-xs">
                      <span className="text-gray-400 shrink-0 mt-0.5">
                        {formatDistanceToNow(event.createdAt, { addSuffix: true })}
                      </span>
                      <span className="text-gray-600">
                        <span className="font-medium text-gray-700">
                          {event.actor?.name ?? event.actor?.email ?? "System"}
                        </span>{" "}
                        {formatAction(event.action, event.metadata)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: banners + attachments + comments ──────────────────────────── */}
        <div className="col-span-2 space-y-6">
          {/* Banners */}
          <BannerGrid
            requestId={id}
            banners={banners}
            canGenerate={isOwner || isAdmin || isDesigner}
            requestStatus={request.status as RequestStatus}
          />

          {/* Attachments */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">
                Attachments{" "}
                {request._count.attachments > 0 && (
                  <span className="text-xs text-gray-400 font-normal">({request._count.attachments})</span>
                )}
              </h2>
            </CardHeader>
            <CardContent>
              <AttachmentList
                requestId={id}
                canDelete={canUploadAttachment}
                canUpload={canUploadAttachment}
              />
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">
                Comments{" "}
                {request._count.comments > 0 && (
                  <span className="text-xs text-gray-400 font-normal">({request._count.comments})</span>
                )}
              </h2>
            </CardHeader>
            <CardContent>
              <CommentThread
                requestId={id}
                currentUserId={session.user.id}
                canAdmin={isAdmin}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );
}

function formatAction(action: string, metadata: unknown): string {
  const meta = metadata as Record<string, unknown> | null;
  switch (action) {
    case "REQUEST_CREATED": return "created this request";
    case "REQUEST_SUBMITTED": return "submitted this request";
    case "REQUEST_CANCELLED": return "cancelled this request";
    case "REQUEST_STATUS_CHANGED":
      return `changed status from ${meta?.oldStatus ?? "?"} to ${meta?.newStatus ?? "?"}`;
    case "GENERATION_STARTED": return "started a generation run";
    case "GENERATION_COMPLETED": return "generation completed";
    case "GENERATION_FAILED": return "generation failed";
    case "REVIEW_OPENED": return "opened a review";
    case "REVIEW_DECISION_MADE":
      return `made review decision: ${meta?.decision ?? "?"}`;
    case "COMMENT_ADDED": return "added a comment";
    case "COMMENT_DELETED": return "deleted a comment";
    default: return action.toLowerCase().replace(/_/g, " ");
  }
}

