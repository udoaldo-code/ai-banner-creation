import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/health
 *
 * Returns 200 when the app and database are reachable.
 * Returns 503 if the database is unreachable.
 *
 * Used by:
 *   - Uptime monitors (Railway, Vercel, Render, etc.)
 *   - Load-balancer health checks
 *   - Deployment smoke tests
 */
export async function GET() {
  try {
    // Lightweight DB check — single round-trip, no table scan
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "unknown",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[health] Database unreachable:", err);
    return NextResponse.json(
      {
        status: "error",
        message: "Database unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
