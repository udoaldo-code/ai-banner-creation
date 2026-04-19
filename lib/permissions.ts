/**
 * Centralized permission matrix for Banner Gen.
 *
 * This is the single source of truth for all role-based checks.
 * Import from here — not from lib/auth — so that client components
 * (sidebar, UI guards) can use these pure functions without pulling
 * in server-only NextAuth / Prisma imports.
 *
 * Role hierarchy (most → least privileged):
 *   ADMIN > CREATIVE_HEAD > APPROVER / DESIGNER > REQUESTER
 */

import type { Role } from "@/types";

// ── Review / approval ──────────────────────────────────────────────────────────

/** Can submit review decisions (approve / reject / revision-request) */
export function canReview(role: Role): boolean {
  return role === "ADMIN" || role === "CREATIVE_HEAD" || role === "APPROVER";
}

// ── Admin / platform management ───────────────────────────────────────────────

/** Can access the admin panel, brand templates, and Slack settings */
export function canAdmin(role: Role): boolean {
  return role === "ADMIN" || role === "CREATIVE_HEAD";
}

/** Can create / edit / archive brand templates */
export function canManageTemplates(role: Role): boolean {
  return role === "ADMIN" || role === "CREATIVE_HEAD";
}

/** Can change user roles and deactivate accounts */
export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}

// ── Generation ─────────────────────────────────────────────────────────────────

/** Can trigger AI banner generation runs */
export function canGenerate(role: Role): boolean {
  return role === "ADMIN" || role === "CREATIVE_HEAD" || role === "DESIGNER";
}

// ── Request visibility ─────────────────────────────────────────────────────────

/**
 * Can see ALL requests across the platform, not just their own.
 * Requesters always see only their own requests regardless of this flag.
 */
export function canViewAllRequests(role: Role): boolean {
  return (
    role === "ADMIN" ||
    role === "CREATIVE_HEAD" ||
    role === "APPROVER" ||
    role === "DESIGNER"
  );
}

// ── Composite convenience check ────────────────────────────────────────────────

/** Returns a human-readable summary of what a role can do */
export function roleCapabilities(role: Role): string[] {
  const caps: string[] = ["View own requests", "Create requests", "Comment"];

  if (role === "DESIGNER") caps.push("View all requests", "Generate banners");
  if (canReview(role)) caps.push("Review & approve/reject banners");
  if (canManageTemplates(role)) caps.push("Manage brand templates");
  if (canManageUsers(role)) caps.push("Manage users & roles");

  return caps;
}
