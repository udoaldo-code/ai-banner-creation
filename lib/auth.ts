import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { Role } from "@/types";

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

export const authOptions: NextAuthOptions = {
  // @ts-expect-error — PrismaAdapter type mismatch between auth.js and next-auth v4 packages
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        // ── Dev bypass ───────────────────────────────────────────────────────
        // Skips password check in development. Still looks up the real DB user
        // so that foreign keys (requesterId, etc.) resolve correctly.
        // Enable by setting NEXTAUTH_DEV_BYPASS=true in .env.local.
        if (
          process.env.NODE_ENV !== "production" &&
          process.env.NEXTAUTH_DEV_BYPASS === "true"
        ) {
          const user = await db.user.findUnique({ where: { email: credentials.email } });
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
        }
        // ── End dev bypass ───────────────────────────────────────────────────

        // MVP: look up user by email only. Add bcrypt password check when ready.
        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role as Role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

export const getSession = () => getServerSession(authOptions);

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

// Re-exported from lib/permissions — single source of truth for role checks.
// Import directly from "@/lib/permissions" in new code; these re-exports exist
// for backward compatibility with existing imports from "@/lib/auth".
export { canReview, canAdmin } from "@/lib/permissions";
