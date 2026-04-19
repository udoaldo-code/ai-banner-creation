import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { Role } from "@/types";

interface Context {
  params: Promise<{ id: string }>;
}

const VALID_ROLES: Role[] = ["ADMIN", "CREATIVE_HEAD", "DESIGNER", "APPROVER", "REQUESTER"];

// PATCH /api/admin/users/[userId] — change a user's role
export async function PATCH(req: NextRequest, { params }: Context) {
  const { id: targetUserId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden: only ADMIN can change user roles" }, { status: 403 });
  }

  // Prevent admins from changing their own role (accidental lockout)
  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const newRole = body?.role as Role | undefined;
  if (!newRole || !VALID_ROLES.includes(newRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 422 }
    );
  }

  const existing = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const updated = await db.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: { id: true, name: true, email: true, role: true },
  });

  await logActivity({
    action: "USER_ROLE_CHANGED",
    entityType: "User",
    entityId: targetUserId,
    actorId: session.user.id,
    requestId: null,
    metadata: {
      targetUserId,
      oldRole: existing.role,
      newRole,
      targetName: existing.name ?? existing.email,
    },
  }).catch(console.error);

  return NextResponse.json(updated);
}
