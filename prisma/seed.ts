/**
 * prisma/seed.ts — development and first-deploy seed data
 *
 * Run:  npm run db:seed
 *
 * What this creates:
 *   • One user per role (ADMIN, CREATIVE_HEAD, DESIGNER, APPROVER, REQUESTER)
 *   • One default brand template
 *
 * Auth note:
 *   The MVP credentials provider logs users in by email only (no password check).
 *   These seed accounts are accessible to anyone who knows the email.
 *   Before opening to real users, add password hashing to lib/auth.ts.
 *
 * Safe to re-run — all upserts use email / name as idempotency key.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱  Seeding database...");

  // ── Users ────────────────────────────────────────────────────────────────────

  const users = [
    { email: "admin@example.com",        name: "Admin User",       role: "ADMIN"         },
    { email: "creative@example.com",     name: "Creative Head",    role: "CREATIVE_HEAD" },
    { email: "designer@example.com",     name: "Designer",         role: "DESIGNER"      },
    { email: "approver@example.com",     name: "Approver",         role: "APPROVER"      },
    { email: "requester@example.com",    name: "Requester",        role: "REQUESTER"     },
  ] as const;

  for (const u of users) {
    const user = await db.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role },
    });
    console.log(`  ✓ ${user.role.padEnd(14)} ${user.email}`);
  }

  // ── Default brand template ───────────────────────────────────────────────────

  const adminUser = await db.user.findUniqueOrThrow({
    where: { email: "admin@example.com" },
  });

  const existing = await db.template.findFirst({ where: { name: "Default Brand" } });

  if (!existing) {
    const template = await db.template.create({
      data: {
        name:           "Default Brand",
        description:    "Base brand template — edit colors and fonts to match your brand identity.",
        isDefault:      true,
        primaryColor:   "#1E40AF",
        secondaryColor: "#FFFFFF",
        accentColor:    "#F59E0B",
        fontStack:      "system-ui, -apple-system, sans-serif",
        layoutStyle:    "balanced",
        tone:           "professional",
        doNotes:        "Use clean layouts with strong visual hierarchy. CTA button must be high contrast.",
        dontNotes:      "Avoid cluttered designs. Do not use more than 3 colors. No decorative fonts.",
        createdById:    adminUser.id,
      },
    });

    // Seed the initial version snapshot
    await db.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        snapshot: {
          name:           template.name,
          primaryColor:   template.primaryColor,
          secondaryColor: template.secondaryColor,
          accentColor:    template.accentColor,
          fontStack:      template.fontStack,
          layoutStyle:    template.layoutStyle,
          tone:           template.tone,
          doNotes:        template.doNotes,
          dontNotes:      template.dontNotes,
        },
      },
    });

    console.log(`  ✓ Template     "${template.name}" (v1)`);
  } else {
    console.log(`  — Template     "Default Brand" already exists, skipped`);
  }

  console.log("\n✅  Seed complete.\n");
  console.log("Login credentials (email only — any password accepted in MVP mode):");
  for (const u of users) {
    console.log(`  ${u.role.padEnd(14)} → ${u.email}`);
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
