import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession, canReview } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DECISION_LABELS,
  DECISION_COLORS,
  type ReviewDecision,
  type Role,
} from "@/types";
import { format } from "date-fns";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewHistoryPage({ params }: Props) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return null;

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      title: true,
      campaignName: true,
      status: true,
      requesterId: true,
    },
  });
  if (!request) notFound();

  const isOwner = request.requesterId === session.user.id;
  const isPrivileged = canReview(session.user.role as Role);
  if (!isOwner && !isPrivileged) redirect("/");

  const [rounds, runs] = await Promise.all([
    db.review.findMany({
      where: { requestId },
      orderBy: { roundNumber: "asc" },
      include: {
        reviewer: { select: { name: true, email: true } },
        checklistItems: { orderBy: { sortOrder: "asc" } },
      },
    }),
    db.generationRun.findMany({
      where: { requestId },
      orderBy: { runNumber: "asc" },
      include: {
        triggeredBy: { select: { name: true, email: true } },
        _count: { select: { variants: true } },
      },
    }),
  ]);

  return (
    <div>
      <Header
        title="Review History"
        description={`${request.title} — ${request.campaignName}`}
        action={
          <Link
            href={`/review/${requestId}`}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Back to Review
          </Link>
        }
      />

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-500">
            No review rounds yet for this request.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {rounds.map((round) => {
            const run = runs.find((r) => r.runNumber === round.roundNumber);
            const checkedCount = round.checklistItems.filter((c) => c.checked).length;

            return (
              <Card key={round.id}>
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">
                      Round {round.roundNumber}
                    </span>
                    {round.decision ? (
                      <Badge className={DECISION_COLORS[round.decision as ReviewDecision]}>
                        {DECISION_LABELS[round.decision as ReviewDecision]}
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700">In Review</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {round.decidedAt
                      ? format(round.decidedAt, "PPP 'at' p")
                      : round.createdAt
                        ? `Opened ${format(round.createdAt, "PPP")}`
                        : null}
                  </div>
                </div>

                <CardContent className="pt-4 grid grid-cols-3 gap-6">
                  {/* Review decision */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Reviewer
                    </p>
                    {round.reviewer ? (
                      <p className="text-sm text-gray-800">
                        {round.reviewer.name ?? round.reviewer.email}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Not yet assigned</p>
                    )}

                    {round.notes && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Notes
                        </p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                          {round.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Checklist */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Checklist ({checkedCount}/{round.checklistItems.length})
                    </p>
                    <ul className="space-y-1.5">
                      {round.checklistItems.map((item) => (
                        <li key={item.id} className="flex items-start gap-2 text-xs">
                          <span
                            className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              item.checked
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "border-gray-300"
                            }`}
                          >
                            {item.checked && (
                              <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className={item.checked ? "text-gray-500" : "text-gray-700"}>
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Generation run context */}
                  {run && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Generation Run
                      </p>
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>Run #{run.runNumber}</p>
                        <p>{run._count.variants} variant{run._count.variants !== 1 ? "s" : ""}</p>
                        {run.triggeredBy && (
                          <p>
                            Triggered by {run.triggeredBy.name ?? run.triggeredBy.email}
                          </p>
                        )}
                        {run.completedAt && (
                          <p>Completed {format(run.completedAt, "PPp")}</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
