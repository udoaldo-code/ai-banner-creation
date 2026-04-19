import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewAllRequests } from "@/lib/permissions";
import type { Role } from "@/types";
import { db } from "@/lib/db";

// GET /api/banners/status?requestId=xxx[&runId=yyy]
// Returns lightweight status for the latest (or specified) generation run.
// Used for client-side polling — no heavy includes.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestId = req.nextUrl.searchParams.get("requestId");
  const runId = req.nextUrl.searchParams.get("runId"); // optional — defaults to latest

  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, requesterId: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isPrivileged = canViewAllRequests(session.user.role as Role);
  if (!isOwner && !isPrivileged) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Resolve the run to inspect
  const run = runId
    ? await db.generationRun.findUnique({
        where: { id: runId },
        include: {
          variants: {
            select: { id: true, size: true, variant: true, status: true, error: true },
            orderBy: [{ size: "asc" }, { variant: "asc" }],
          },
        },
      })
    : await db.generationRun.findFirst({
        where: { requestId },
        orderBy: { runNumber: "desc" },
        include: {
          variants: {
            select: { id: true, size: true, variant: true, status: true, error: true },
            orderBy: [{ size: "asc" }, { variant: "asc" }],
          },
        },
      });

  if (!run) {
    return NextResponse.json({
      requestId,
      requestStatus: request.status,
      run: null,
      isTerminal: true,
    });
  }

  return NextResponse.json({
    requestId,
    requestStatus: request.status,
    run: {
      id: run.id,
      runNumber: run.runNumber,
      status: run.status,
      variantCount: run.variantCount,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      error: run.error,
      variants: run.variants,
    },
    // Client stops polling when true
    isTerminal: !["PENDING", "RUNNING"].includes(run.status),
  });
}
