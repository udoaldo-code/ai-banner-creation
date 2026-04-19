import { NextRequest, NextResponse } from "next/server";
import { getSession, canReview } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/review/[requestId]/history
// Returns all review rounds for a request, ordered oldest-first, for the audit trail.
// Accessible to the request owner + all reviewer/admin roles.
export async function GET(_req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { requesterId: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isPrivileged = canReview(session.user.role as Role);
  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rounds = await db.review.findMany({
    where: { requestId },
    orderBy: { roundNumber: "asc" },
    include: {
      reviewer: { select: { id: true, name: true, email: true } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  // Attach generation run data alongside each review round for context
  const runs = await db.generationRun.findMany({
    where: { requestId },
    orderBy: { runNumber: "asc" },
    select: {
      id: true,
      runNumber: true,
      status: true,
      variantCount: true,
      startedAt: true,
      completedAt: true,
      triggeredBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({
    requestId,
    rounds: rounds.map((r) => ({
      ...r,
      run: runs.find((run) => run.runNumber === r.roundNumber) ?? null,
    })),
  });
}
