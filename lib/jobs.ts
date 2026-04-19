/**
 * lib/jobs.ts — async generation abstraction layer
 *
 * Swapping job backends requires only changing enqueueBannerGeneration():
 *   ┌─ Current (Node.js long-running) ─── setImmediate
 *   ├─ Vercel (serverless)            ─── import { after } from "next/server"; after(fn)
 *   └─ Production (persistent queue)  ─── pgBoss.send("banner-generate", params)
 *
 * runBannerGeneration() is transport-agnostic and stays unchanged.
 */

import { db } from "@/lib/db";
import { generateAllBannersForRequest } from "@/lib/ai";
import { uploadHtmlBanner, variantStorageKey } from "@/lib/storage";
import { notifyReadyForReview } from "@/lib/slack";
import { logActivity, logStatusChange } from "@/lib/activity";
import { DEFAULT_REVIEW_CHECKLIST } from "@/types";

export interface GenerationParams {
  generationRunId: string;
}

export async function runBannerGeneration(params: GenerationParams): Promise<void> {
  const { generationRunId } = params;

  const run = await db.generationRun.findUnique({
    where: { id: generationRunId },
    include: {
      request: true,
      triggeredBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!run) {
    console.error(`[jobs] GenerationRun ${generationRunId} not found`);
    return;
  }

  const request = run.request;

  // Mark run as RUNNING
  await db.generationRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  await logActivity({
    action: "GENERATION_STARTED",
    entityType: "GenerationRun",
    entityId: run.id,
    actorId: run.triggeredById,
    requestId: request.id,
    metadata: { runNumber: run.runNumber, variantCount: run.variantCount },
  });

  try {
    const promptSnapshot = run.promptSnapshot as {
      sizes: string[];
      variants: number;
      headline: string;
      subheadline?: string | null;
      copyVariants?: string | null;
      ctaText: string;
      ctaUrl?: string | null;
      brandColors: string[];
      campaignName: string;
      campaignObjective?: string | null;
      targetAudience?: string | null;
      offerMessage?: string | null;
      platforms: string[];
      notes?: string | null;
      templateId?: string | null;
      templateVersionId?: string | null;
      templateSnapshot?: {
        primaryColor: string;
        secondaryColor: string;
        accentColor?: string | null;
        fontStack?: string | null;
        layoutStyle?: string | null;
        tone?: string | null;
        doNotes?: string | null;
        dontNotes?: string | null;
      } | null;
    };

    // Use the immutable template snapshot from promptSnapshot — not the live template.
    // This guarantees that re-generations use identical brand rules to the original run.
    const templateHints = promptSnapshot.templateSnapshot ?? null;

    const results = await generateAllBannersForRequest({
      requestId: request.id,
      sizes: promptSnapshot.sizes,
      variants: promptSnapshot.variants,
      headline: promptSnapshot.headline,
      subheadline: promptSnapshot.subheadline,
      copyVariants: promptSnapshot.copyVariants,
      ctaText: promptSnapshot.ctaText,
      ctaUrl: promptSnapshot.ctaUrl,
      brandColors: promptSnapshot.brandColors,
      campaignName: promptSnapshot.campaignName,
      campaignObjective: promptSnapshot.campaignObjective,
      targetAudience: promptSnapshot.targetAudience,
      offerMessage: promptSnapshot.offerMessage,
      platforms: promptSnapshot.platforms,
      notes: promptSnapshot.notes,
      template: templateHints,
    });

    let successCount = 0;
    const errors: string[] = [];

    for (const { size, variant, result, error } of results) {
      const variantRecord = await db.generatedVariant.findUnique({
        where: { generationRunId_size_variant: { generationRunId: run.id, size, variant } },
      });
      if (!variantRecord) continue;

      const startMs = Date.now();

      if (result) {
        const key = variantStorageKey(request.id, run.runNumber, size, variant);
        await uploadHtmlBanner(key, result.htmlContent).catch((err) =>
          console.error(`[jobs] S3 upload failed for ${key}:`, err)
        );

        await db.generatedVariant.update({
          where: { id: variantRecord.id },
          data: {
            status: "READY",
            storageKey: key,
            aiPrompt: result.aiPrompt,
            aiOutput: result.aiOutput as object,
            htmlContent: result.htmlContent,
            durationMs: Date.now() - startMs,
            error: null,
          },
        });
        successCount++;
      } else {
        await db.generatedVariant.update({
          where: { id: variantRecord.id },
          data: {
            status: "ERROR",
            error: error ?? "Generation failed",
            durationMs: Date.now() - startMs,
          },
        });
        errors.push(`${size}/v${variant}: ${error ?? "unknown"}`);
      }
    }

    // Mark run as COMPLETED
    await db.generationRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    // Advance request to IN_REVIEW
    const previousStatus = request.status;
    await db.request.update({ where: { id: request.id }, data: { status: "IN_REVIEW" } });
    await logStatusChange({
      requestId: request.id,
      actorId: null, // system
      oldStatus: previousStatus,
      newStatus: "IN_REVIEW",
    });

    // Create or reset the review record for this round
    const existingReview = await db.review.findFirst({
      where: { requestId: request.id },
      orderBy: { roundNumber: "desc" },
    });
    const nextRound = existingReview ? existingReview.roundNumber + 1 : 1;

    const review = await db.review.create({
      data: {
        requestId: request.id,
        roundNumber: nextRound,
        // Seed default checklist items
        checklistItems: {
          create: DEFAULT_REVIEW_CHECKLIST.map((item) => ({
            label: item.label,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });

    await logActivity({
      action: "REVIEW_OPENED",
      entityType: "Review",
      entityId: review.id,
      actorId: null,
      requestId: request.id,
      metadata: { roundNumber: nextRound, bannerCount: successCount },
    });

    await logActivity({
      action: "GENERATION_COMPLETED",
      entityType: "GenerationRun",
      entityId: run.id,
      actorId: run.triggeredById,
      requestId: request.id,
      metadata: { successCount, errorCount: errors.length, errors },
    });

    // Notify Slack for approval (fire-and-forget)
    notifyReadyForReview({
      reviewId: review.id,
      requestId: request.id,
      requestTitle: request.title,
      campaignName: request.campaignName,
      bannerCount: successCount,
      roundNumber: nextRound,
    })
      .then(async (msg) => {
        if (msg) {
          // Persist Slack message coordinates on the review
          await db.review.update({
            where: { id: review.id },
            data: { slackMsgTs: msg.ts, slackChannelId: msg.channel },
          });
          // Record in SlackNotification table
          await db.slackNotification.create({
            data: {
              type: "REVIEW_REQUESTED",
              entityType: "Review",
              entityId: review.id,
              channelId: msg.channel,
              messageTs: msg.ts,
            },
          });
        }
      })
      .catch(console.error);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[jobs] Banner generation failed:", err);

    await db.generationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date(), error: errorMessage },
    });

    // Roll request back to SUBMITTED so the user can retry
    await db.request
      .update({ where: { id: request.id }, data: { status: "SUBMITTED" } })
      .catch(() => {});

    // Mark all still-GENERATING variants as ERROR
    await db.generatedVariant
      .updateMany({
        where: { generationRunId: run.id, status: "GENERATING" },
        data: { status: "ERROR", error: "Job failed — see server logs" },
      })
      .catch(() => {});

    await logActivity({
      action: "GENERATION_FAILED",
      entityType: "GenerationRun",
      entityId: run.id,
      actorId: run.triggeredById,
      requestId: request.id,
      metadata: { error: errorMessage },
    });
  }
}

/**
 * Enqueue a banner generation job.
 * To switch transports, replace the body of this function only.
 */
export function enqueueBannerGeneration(params: GenerationParams): void {
  setImmediate(() => runBannerGeneration(params));
}
