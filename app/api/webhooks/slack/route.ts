/**
 * POST /api/webhooks/slack
 *
 * Handles all Slack interactive component callbacks:
 *   block_actions  — button clicks (approve → direct; reject/revision → open modal)
 *   view_submission — modal form submitted (notes collected for reject/revision)
 *
 * Security:
 *   - Every request is verified with HMAC-SHA256 against SLACK_SIGNING_SECRET.
 *   - Timestamp replay window: 5 minutes.
 *   - Decisions made here go through the SAME DB transaction as web-app decisions:
 *     request status update, review record update, variant promotion, audit log.
 *   - The web app is always source of truth — Slack never bypasses business rules.
 *
 * Limitation (scaffolded for future):
 *   - We receive a Slack user ID and username but cannot map to an app User without
 *     a slackUserId field on the User model. Currently the reviewerId is left null
 *     for Slack-originated decisions and the Slack username is stored in review notes.
 *     To resolve: add User.slackUserId, populate on OAuth, look up here.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openNotesModal, updateReviewMessage, notifyRequester } from "@/lib/slack";
import { logStatusChange, logReviewDecision } from "@/lib/activity";
import crypto from "crypto";
import type { ReviewDecision, RequestStatus } from "@/types";

// ── Signature verification ────────────────────────────────────────────────────

function verifySlackSignature(req: NextRequest, rawBody: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[slack/webhook] SLACK_SIGNING_SECRET is not set — rejecting all requests");
    return false;
  }

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    console.warn("[slack/webhook] Rejected: timestamp too old");
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBase).digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Decision processing (shared by both block_action and view_submission) ─────

async function applyReviewDecision(params: {
  reviewId: string;
  decision: ReviewDecision;
  notes: string | null;
  slackUserName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { reviewId, decision, notes, slackUserName } = params;

  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: {
      request: {
        include: { requester: { select: { email: true, name: true } } },
      },
    },
  });

  if (!review) return { ok: false, error: "Review not found" };
  if (review.request.status !== "IN_REVIEW") {
    return { ok: false, error: `Request is not IN_REVIEW (current: ${review.request.status})` };
  }

  const newStatus: RequestStatus =
    decision === "APPROVED"
      ? "APPROVED"
      : decision === "REJECTED"
        ? "REJECTED"
        : "REVISION_REQUESTED";

  // Append the Slack username to notes so the audit trail records who acted
  const fullNotes = [
    notes,
    `— via Slack (${slackUserName})`,
  ].filter(Boolean).join(" ");

  // Identical transaction to the web-app review route
  await db.$transaction([
    db.request.update({ where: { id: review.requestId }, data: { status: newStatus } }),
    db.review.update({
      where: { id: reviewId },
      data: {
        // TODO: set reviewerId once User.slackUserId mapping is implemented
        decision,
        notes: fullNotes,
        decidedAt: new Date(),
      },
    }),
    ...(decision === "APPROVED"
      ? [
          db.generatedVariant.updateMany({
            where: { requestId: review.requestId, status: "READY" },
            data: { status: "APPROVED" },
          }),
        ]
      : []),
  ]);

  // Audit trail — actorId is null for Slack-originated actions until user mapping exists
  await logStatusChange({
    requestId: review.requestId,
    actorId: null,
    oldStatus: "IN_REVIEW",
    newStatus,
    reason: fullNotes,
  });

  await logReviewDecision({
    reviewId,
    requestId: review.requestId,
    actorId: null, // no app user mapping for Slack actions yet — see TODO above
    decision,
    roundNumber: review.roundNumber,
    notes: fullNotes,
  });

  // Update the original approval message in Slack
  if (review.slackMsgTs && review.slackChannelId) {
    await updateReviewMessage(
      review.slackChannelId,
      review.slackMsgTs,
      decision,
      slackUserName,
      { requestTitle: review.request.title, notes }
    ).catch(console.error);
  }

  // Notify the requester (fire-and-forget)
  notifyRequester({
    requesterEmail: review.request.requester.email,
    requestTitle: review.request.title,
    requestId: review.requestId,
    decision,
    comments: notes,
  }).catch(console.error);

  return { ok: true };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySlackSignature(req, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) return NextResponse.json({ error: "Missing payload" }, { status: 400 });

  let payload: SlackPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ── Block actions (button clicks) ──────────────────────────────────────────
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (!action) return NextResponse.json({ ok: true });

    const reviewId = action.value as string;
    const actionId = action.action_id as string;
    const slackUserName = payload.user?.name ?? payload.user?.username ?? "Slack user";

    // Direct approve — no modal needed
    if (actionId === "review_approve") {
      const { ok, error } = await applyReviewDecision({
        reviewId,
        decision: "APPROVED",
        notes: null,
        slackUserName,
      });

      if (!ok) {
        console.warn("[slack/webhook] review_approve failed:", error);
      }
      return NextResponse.json({ ok: true });
    }

    // Revision or reject — open a notes modal
    if (actionId === "review_revision_modal" || actionId === "review_reject_modal") {
      const decision: ReviewDecision =
        actionId === "review_reject_modal" ? "REJECTED" : "REVISION_REQUESTED";

      // Fetch the request title for the modal heading
      const review = await db.review.findUnique({
        where: { id: reviewId },
        select: { request: { select: { title: true } } },
      });

      if (review && payload.trigger_id) {
        await openNotesModal({
          triggerId: payload.trigger_id,
          reviewId,
          requestTitle: review.request.title,
          decision,
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Unknown action — acknowledge and ignore
    return NextResponse.json({ ok: true });
  }

  // ── Modal submission (notes collected) ─────────────────────────────────────
  if (payload.type === "view_submission") {
    const callbackId = payload.view?.callback_id ?? "";

    // callback_id format: "review_notes_modal|DECISION|reviewId"
    if (!callbackId.startsWith("review_notes_modal|")) {
      return NextResponse.json({ ok: true });
    }

    const [, decisionStr, reviewId] = callbackId.split("|");
    const decision = decisionStr as ReviewDecision;

    if (!["REJECTED", "REVISION_REQUESTED"].includes(decision) || !reviewId) {
      return NextResponse.json({ response_action: "clear" });
    }

    // Extract notes from the modal's input block
    const notes =
      payload.view?.state?.values?.notes_block?.notes_input?.value?.trim() ?? null;

    const slackUserName = payload.user?.name ?? payload.user?.username ?? "Slack user";

    if (!notes) {
      // Return a validation error to Slack — keeps modal open
      return NextResponse.json({
        response_action: "errors",
        errors: {
          notes_block: "Please provide notes before submitting.",
        },
      });
    }

    const { ok, error } = await applyReviewDecision({
      reviewId,
      decision,
      notes,
      slackUserName,
    });

    if (!ok) {
      console.error("[slack/webhook] view_submission failed:", error);
      return NextResponse.json({
        response_action: "errors",
        errors: { notes_block: error ?? "Something went wrong. Please try again." },
      });
    }

    // Close the modal
    return NextResponse.json({ response_action: "clear" });
  }

  // Acknowledge all other payload types (shortcuts, events, etc.)
  return NextResponse.json({ ok: true });
}

// ── Payload types (minimal) ───────────────────────────────────────────────────

interface SlackUser {
  id: string;
  name?: string;
  username?: string;
}

interface SlackAction {
  action_id: string;
  value?: string;
}

interface SlackViewState {
  values: {
    [blockId: string]: {
      [actionId: string]: {
        value?: string;
        type?: string;
      };
    };
  };
}

interface SlackView {
  callback_id: string;
  state?: SlackViewState;
}

interface SlackPayload {
  type: "block_actions" | "view_submission" | string;
  user?: SlackUser;
  trigger_id?: string;
  actions?: SlackAction[];
  view?: SlackView;
}
