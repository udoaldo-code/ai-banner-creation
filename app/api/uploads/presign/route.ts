import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  uploadFile,
  guidelinesStorageKey,
  logoStorageKey,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_TYPES,
} from "@/lib/storage";
import { db } from "@/lib/db";
import path from "path";

// POST /api/uploads/presign
// Accepts multipart/form-data: file, context, resourceId
// Returns: { key: string }
// Renamed "presign" kept for backward compatibility — now proxies through server to avoid CORS.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      { error: "File storage is not configured. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const context = formData.get("context") as string | null;
  const resourceId = formData.get("resourceId") as string | null;

  if (!file || !context || !resourceId) {
    return NextResponse.json({ error: "file, context, resourceId are required" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";

  if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_ATTACHMENT_TYPES.join(", ")}` },
      { status: 415 }
    );
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum 20 MB." }, { status: 413 });
  }

  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");

  let key: string;

  if (context === "attachment") {
    const request = await db.request.findUnique({ where: { id: resourceId } });
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    const isOwner = request.requesterId === session.user.id;
    const isAdmin = ["ADMIN", "CREATIVE_HEAD"].includes(session.user.role);
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    key = guidelinesStorageKey(resourceId, safeName);
  } else if (context === "logo") {
    if (!["ADMIN", "CREATIVE_HEAD", "DESIGNER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    key = logoStorageKey(resourceId, safeName);
  } else {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFile(key, buffer, contentType);

  return NextResponse.json({ key });
}
