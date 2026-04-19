import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession, canReview } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  DECISION_COLORS,
  DECISION_LABELS,
  type RequestStatus,
  type ReviewDecision,
  type Role,
} from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return null;
  if (!canReview(session.user.role as Role)) redirect("/");

  const request = await db.request.findUnique({
    where: { id },
    include: {
      requester: { select: { name: true, email: true } },
      generationRuns: {
        orderBy: { runNumber: "desc" },
        take: 1,
        include: {
          variants: {
            orderBy: [{ size: "asc" }, { variant: "asc" }],
            select: {
              id: true,
              size: true,
              variant: true,
              status: true,
              htmlContent: true,
              storageKey: true,
              error: true,
            },
          },
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
      _count: { select: { reviews: true } },
    },
  });

  if (!request) notFound();

  const latestRun = request.generationRuns[0] ?? null;
  const latestReview = request.reviews[0] ?? null;

  const banners = latestRun?.variants.map((v) => ({
    id: v.id,
    size: v.size,
    variant: v.variant,
    status: v.status,
    htmlContent: v.htmlContent,
    storageKey: v.storageKey,
    error: v.error,
  })) ?? [];

  const statusColor = STATUS_COLORS[request.status as RequestStatus] ?? "bg-gray-100 text-gray-700";
  const totalRounds = request._count.reviews;

  return (
    <div>
      <Header
        title={request.title}
        description={`${request.campaignName} · ${request.requester.name ?? request.requester.email}`}
        action={
          <div className="flex items-center gap-3">
            {totalRounds > 0 && (
              <Link
                href={`/review/${id}/history`}
                className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                {totalRounds} round{totalRounds !== 1 ? "s" : ""} · View history
              </Link>
            )}
            {latestReview?.decision && (
              <Badge className={DECISION_COLORS[latestReview.decision as ReviewDecision]}>
                {DECISION_LABELS[latestReview.decision as ReviewDecision]}
              </Badge>
            )}
            <Badge className={statusColor}>
              {STATUS_LABELS[request.status as RequestStatus]}
            </Badge>
          </div>
        }
      />

      <ReviewPanel
        requestId={id}
        banners={banners}
        checklistItems={latestReview?.checklistItems ?? []}
        existingDecision={latestReview?.decision ?? null}
        existingNotes={latestReview?.notes ?? null}
        requestStatus={request.status as RequestStatus}
        roundNumber={latestReview?.roundNumber ?? 1}
        brief={{
          headline: request.headline,
          ctaText: request.ctaText,
          platforms: request.platforms as string[],
          sizes: request.sizes as string[],
        }}
      />
    </div>
  );
}
