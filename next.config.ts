import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client uses Node.js APIs that must not be bundled by the
  // Next.js edge/server-component bundler. Listing it here prevents
  // "PrismaClient is unable to run in this browser environment" errors
  // when Next.js 15 tries to inline server modules.
  serverExternalPackages: ["@prisma/client", "prisma"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
