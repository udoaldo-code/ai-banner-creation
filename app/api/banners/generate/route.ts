import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canGenerate } from "@/lib/permissions";
import { db } from "@/lib/db";
import { enqueueBannerGeneration } from "@/lib/jobs";
import { logActivity, logStatusChange } from "@/lib/activity";
import type { Role } from "@/types";

// POST /api/banners/generate
// Body: { requestId: string, variants?: number }
// - Creates a GenerationRun record and PENDING GeneratedVariant records
// - Hands off to the jobs layer; returns immediately
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const request = await db.request.findUnique({
    where: { id: body.requestId },
    include: {
      template: true,
      templateVersion: true, // already-pinned version (re-generation)
    },
  });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const isOwner = request.requesterId === session.user.id;
  const isGenerator = canGenerate(session.user.role as Role);
  if (!isOwner && !isGenerator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["SUBMITTED", "REVISION_REQUESTED"].includes(request.status)) {
    return NextResponse.json(
      { error: `Cannot generate banners for a request with status: ${request.status}` },
      { status: 409 }
    );
  }

  const variants = Math.min(Number(body.variants ?? 2), 3);
  const sizes = request.sizes;

  // Determine run number
  const lastRun = await db.generationRun.findFirst({
    where: { requestId: request.id },
    orderBy: { runNumber: "desc" },
    select: { runNumber: true },
  });
  const runNumber = (lastRun?.runNumber ?? 0) + 1;

  // Pin the latest template version to the request on first generation,
  // or reuse the already-pinned version for re-generations.
  let pinnedVersionId = request.templateVersionId ?? null;
  if (request.templateId && !pinnedVersionId) {
    const latestVersion = await db.templateVersion.findFirst({
      where: { templateId: request.templateId },
      orderBy: { version: "desc" },
    });
    if (latestVersion) {
      pinnedVersionId = latestVersion.id;
      await db.request.update({
        where: { id: request.id },
        data: { templateVersionId: latestVersion.id },
      });
    }
  }

  // Build templateSnapshot from the pinned version snapshot (immutable) or
  // the live template as a fallback when no version exists yet.
  const tpl = request.template;
  const versionSnap = request.templateVersion?.snapshot as Record<string, unknown> | null ?? null;
  const templateSnapshot = tpl
    ? {
        name: (versionSnap?.name ?? tpl.name) as string,
        primaryColor: (versionSnap?.primaryColor ?? tpl.primaryColor) as string,
        secondaryColor: (versionSnap?.secondaryColor ?? tpl.secondaryColor) as string,
        accentColor: (versionSnap?.accentColor ?? tpl.accentColor) as string | null,
        fontStack: (versionSnap?.fontStack ?? tpl.fontStack) as string | null,
        layoutStyle: (versionSnap?.layoutStyle ?? tpl.layoutStyle) as string,
        tone: (versionSnap?.tone ?? tpl.tone) as string | null,
        doNotes: (versionSnap?.doNotes ?? tpl.doNotes) as string | null,
        dontNotes: (versionSnap?.dontNotes ?? tpl.dontNotes) as string | null,
      }
    : null;

  // Build prompt snapshot (immutable record of what was sent to AI)
  const promptSnapshot = {
    sizes,
    variants,
    headline: request.headline,
    subheadline: request.subheadline,
    copyVariants: request.copyVariants ?? null,
    ctaText: request.ctaText,
    ctaUrl: request.ctaUrl,
    brandColors: request.brandColors,
    campaignName: request.campaignName,
    campaignObjective: request.campaignObjective ?? null,
    targetAudience: request.targetAudience ?? null,
    offerMessage: request.offerMessage ?? null,
    platforms: request.platforms,
    notes: request.notes,
    templateId: request.templateId ?? null,
    templateVersionId: pinnedVersionId,
    // Full snapshot — jobs.ts reads this directly; live template is never touched
    templateSnapshot,
  };

  const previousStatus = request.status;

  // Create GenerationRun + all variant records in one transaction
  const run = await db.generationRun.create({
    data: {
      requestId: request.id,
      runNumber,
      status: "PENDING",
      variantCount: sizes.length * variants,
      promptSnapshot,
      triggeredById: session.user.id,
      variants: {
        create: sizes.flatMap((size) =>
          Array.from({ length: variants }, (_, i) => ({
            requestId: request.id,
            size,
            variant: i + 1,
            status: "PENDING" as const,
          }))
        ),
      },
    },
  });

  // Advance request to IN_PROGRESS
  await db.request.update({ where: { id: request.id }, data: { status: "IN_PROGRESS" } });
  await logStatusChange({
    requestId: request.id,
    actorId: session.user.id,
    oldStatus: previousStatus,
    newStatus: "IN_PROGRESS",
  });

  await logActivity({
    action: "GENERATION_STARTED",
    entityType: "GenerationRun",
    entityId: run.id,
    actorId: session.user.id,
    requestId: request.id,
    metadata: { runNumber, variantCount: run.variantCount },
  });

  // Hand off to the jobs layer (swap transport in lib/jobs.ts as needed)
  enqueueBannerGeneration({ generationRunId: run.id });

  return NextResponse.json({
    message: "Generation started",
    requestId: request.id,
    generationRunId: run.id,
    runNumber,
    variantCount: run.variantCount,
  });
}
