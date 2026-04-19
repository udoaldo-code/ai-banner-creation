import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAdmin } from "@/lib/permissions";
import { testSlackConnection, isSlackConfigured } from "@/lib/slack";
import type { Role } from "@/types";

// GET /api/admin/slack — return Slack configuration status
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = isSlackConfigured();
  const channels = {
    notify: process.env.SLACK_NOTIFY_CHANNEL ?? "#banner-requests (default)",
    approver: process.env.SLACK_APPROVER_CHANNEL ?? "#banner-approvals (default)",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000 (default)",
  };

  return NextResponse.json({ configured, channels });
}

// POST /api/admin/slack — test connection
export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await testSlackConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
