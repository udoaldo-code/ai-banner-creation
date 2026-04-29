import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getPresignedPutUrl,
  guidelinesStorageKey,
  logoStorageKey,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_TYPES,
} from "@/lib/storage";
import { db } from "@/lib/db";
import path from "path";

type UploadContext = "attachment" | "logo";

// POST /api/uploads/presign
// Body: { context: "attachment" | "logo", resourceId: string, filename: string, contentType: string, size: number, category?: string }
// Returns: { uploadUrl: string, key: string }
//
// After the browser finishes the PUT to uploadUrl, it should call:
//   POST /api/requests/[id]/attachments  { storageKey, filename, contentType, sizeBytes, category }  — for attachments
//   PATCH /api/templates/[id] { logoKey: key }                                                         — for logos
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      { error: "File storage is not configured on this server. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in environment variables." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { context, resourceId, filename, contentType, size } = body as {
    context: UploadContext;
    resourceId: string;
    filename: string;
    contentType: string;
    size: number;
  };

  if (!context || !resourceId || !filename || !contentType) {
    return NextResponse.json({ error: "context, resourceId, filename, contentType are required" }, { status: 400 });
  }

  if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_ATTACHMENT_TYPES.join(", ")}` },
      { status: 415 }
    );
  }

  if (size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum 20 MB." }, { status: 413 });
  }

  // Sanitize filename — keep only the basename, strip path traversal
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");

  let key: string;

  if (context === "attachment") {
    // Verify the request belongs to the session user or is accessible to admins
    const request = await db.request.findUnique({ where: { id: resourceId } });
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    const isOwner = request.requesterId === session.user.id;
    const isAdmin = ["ADMIN", "CREATIVE_HEAD"].includes(session.user.role);
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    key = guidelinesStorageKey(resourceId, safeName);
  } else if (context === "logo") {
    // Only CREATIVE_HEAD and ADMIN can upload template logos
    if (!["ADMIN", "CREATIVE_HEAD", "DESIGNER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    key = logoStorageKey(resourceId, safeName);
  } else {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  const uploadUrl = await getPresignedPutUrl(key, contentType);

  return NextResponse.json({ uploadUrl, key });
}
