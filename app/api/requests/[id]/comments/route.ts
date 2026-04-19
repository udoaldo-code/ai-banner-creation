import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewAllRequests } from "@/lib/permissions";
import { db } from "@/lib/db";
import { commentSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/requests/[id]/comments — list all comments on a request
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
  const isPrivileged = canViewAllRequests(session.user.role as Role);
  if (!isOwner && !isPrivileged) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const comments = await db.comment.findMany({
    where: { requestId, parentId: null }, // top-level only; replies nested below
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
      replies: {
        where: { deletedAt: null },
        include: { author: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(comments);
}

// POST /api/requests/[id]/comments — add a comment
export async function POST(req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { requesterId: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.issues }, { status: 422 });
  }

  const { body: commentBody, parentId, variantId, entityType } = parsed.data;

  const comment = await db.comment.create({
    data: {
      requestId,
      entityType,
      authorId: session.user.id,
      body: commentBody,
      parentId: parentId ?? null,
      variantId: variantId ?? null,
    },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
      replies: { include: { author: { select: { id: true, name: true, email: true, image: true } } } },
    },
  });

  await logActivity({
    action: "COMMENT_ADDED",
    entityType: "Comment",
    entityId: comment.id,
    actorId: session.user.id,
    requestId,
    metadata: { entityType, isReply: !!parentId },
  });

  return NextResponse.json(comment, { status: 201 });
}

// DELETE /api/requests/[id]/comments?commentId=xxx — soft delete
export async function DELETE(req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commentId = req.nextUrl.searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "commentId is required" }, { status: 400 });

  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.requestId !== requestId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (comment.deletedAt) {
    return NextResponse.json({ error: "Already deleted" }, { status: 410 });
  }

  const isAuthor = comment.authorId === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);
  if (!isAuthor && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date(), body: "[deleted]" },
  });

  await logActivity({
    action: "COMMENT_DELETED",
    entityType: "Comment",
    entityId: commentId,
    actorId: session.user.id,
    requestId,
  });

  return new NextResponse(null, { status: 204 });
}
