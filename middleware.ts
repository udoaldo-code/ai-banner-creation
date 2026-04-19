import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@/types";

// Role arrays are duplicated here because middleware runs on the Edge runtime,
// which cannot import Node.js modules. lib/permissions.ts (pure functions) is
// safe to import in principle, but Edge bundling sometimes trips on the
// TypeScript path aliases — keeping these arrays inline is the safest option.
const REVIEWER_ROLES: Role[] = ["ADMIN", "CREATIVE_HEAD", "APPROVER"];
const ADMIN_ROLES: Role[] = ["ADMIN", "CREATIVE_HEAD"];

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role as Role | undefined;

    // /review/* — requires reviewer role
    if (pathname.startsWith("/review")) {
      if (!role || !REVIEWER_ROLES.includes(role)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    // /admin/* — requires admin role
    if (pathname.startsWith("/admin")) {
      if (!role || !ADMIN_ROLES.includes(role)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return false → withAuth redirects to signIn page automatically
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  // Apply to all routes except:
  //  - Next.js internals + static assets
  //  - The login page (to avoid redirect loops)
  //  - API routes with their own auth (webhooks use signature verification)
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon\\.ico|login).*)",
  ],
};
