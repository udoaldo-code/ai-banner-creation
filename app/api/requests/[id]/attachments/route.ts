import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewAllRequests, canAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/requests/[id]/attachments
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

  const attachments = await db.requestAttachment.findMany({
    where: { requestId },
    include: { uploadedBy: { select: { name: true, email: true } } },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(attachments);
}

// POST /api/requests/[id]/attachments — register an attachment after presigned PUT upload
// Body: { storageKey, filename, label, contentType, sizeBytes, category }
export async function POST(req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { requesterId: true, status: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.storageKey || !body?.filename || !body?.contentType) {
    return NextResponse.json(
      { error: "storageKey, filename, and contentType are required" },
      { status: 400 }
    );
  }

  const attachment = await db.requestAttachment.create({
    data: {
      requestId,
      storageKey: body.storageKey,
      filename: body.filename,
      label: body.label ?? null,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes ?? 0,
      category: body.category ?? "OTHER",
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return NextResponse.json(attachment, { status: 201 });
}

// DELETE /api/requests/[id]/attachments?attachmentId=xxx
export async function DELETE(req: NextRequest, { params }: Context) {
  const { id: requestId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId) return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });

  const attachment = await db.requestAttachment.findUnique({
    where: { id: attachmentId },
    include: { request: { select: { requesterId: true } } },
  });
  if (!attachment || attachment.requestId !== requestId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = attachment.request.requesterId === session.user.id;
  const isUploader = attachment.uploadedById === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);
  if (!isOwner && !isUploader && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteObject(attachment.storageKey).catch(console.error);
  await db.requestAttachment.delete({ where: { id: attachmentId } });

  return new NextResponse(null, { status: 204 });
}
