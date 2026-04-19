/**
 * lib/slack.ts — Slack integration for Banner Gen
 *
 * Design principles:
 *  1. Slack is a companion surface — the web app is always source of truth.
 *  2. Every function guards against missing env vars and returns early silently.
 *     Slack being down or unconfigured must never break the primary workflow.
 *  3. All Slack-originating decisions go through the same DB/audit path as web decisions.
 *  4. Block Kit messages are structured so deep links are always visible.
 *
 * Required env vars (see README for setup instructions):
 *   SLACK_BOT_TOKEN        — Bot token (xoxb-…)
 *   SLACK_SIGNING_SECRET   — Request signing secret for signature verification
 *   SLACK_NOTIFY_CHANNEL   — Channel for request submission alerts  (default: #banner-requests)
 *   SLACK_APPROVER_CHANNEL — Channel for review/approval notifications (default: #banner-approvals)
 *   NEXT_PUBLIC_APP_URL    — Full public URL of the web app (default: http://localhost:3000)
 *
 * Bot OAuth scopes required:
 *   chat:write              — post and update messages
 *   chat:write.public       — post to channels without being a member
 *   im:write                — open DMs (used when attempting direct requester notifications)
 *   users:read              — look up users by ID
 *   users:read.email        — look up users by email for DM delivery (scaffolded)
 *   views:open              — open modals in response to interactive actions
 *
 * Slack app settings:
 *   Interactivity & Shortcuts → Request URL: https://<your-domain>/api/webhooks/slack
 *   Event Subscriptions: not required for this integration
 */

import { WebClient, type Block, type KnownBlock, type ActionsBlockElement } from "@slack/web-api";

// ── Client (lazy, singleton) ──────────────────────────────────────────────────

let _slack: WebClient | null = null;

function getClient(): WebClient | null {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  if (!_slack) _slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  return _slack;
}

export function isSlackConfigured(): boolean {
  return !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET);
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const NOTIFY_CHANNEL = () => process.env.SLACK_NOTIFY_CHANNEL ?? "#banner-requests";
const APPROVER_CHANNEL = () => process.env.SLACK_APPROVER_CHANNEL ?? "#banner-approvals";

// ── Block Kit helpers ─────────────────────────────────────────────────────────

const divider: KnownBlock = { type: "divider" };

function header(text: string): KnownBlock {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

function section(text: string): KnownBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}

function fields(pairs: [string, string][]): KnownBlock {
  return {
    type: "section",
    fields: pairs.map(([label, value]) => ({
      type: "mrkdwn" as const,
      text: `*${label}*\n${value || "—"}`,
    })),
  };
}

function context(elements: string[]): KnownBlock {
  return {
    type: "context",
    elements: elements.map((e) => ({ type: "mrkdwn" as const, text: e })),
  };
}

function linkButton(label: string, url: string, style?: "primary" | "danger"): ActionsBlockElement {
  return {
    type: "button",
    text: { type: "plain_text", text: label },
    url,
    ...(style ? { style } : {}),
  } as ActionsBlockElement;
}

function actionButton(
  label: string,
  actionId: string,
  value: string,
  style?: "primary" | "danger"
): ActionsBlockElement {
  return {
    type: "button",
    text: { type: "plain_text", text: label },
    action_id: actionId,
    value,
    ...(style ? { style } : {}),
  } as ActionsBlockElement;
}

function priorityBadge(priority: string): string {
  if (priority === "URGENT") return "🔴 Urgent";
  if (priority === "HIGH") return "🟠 High";
  return "⚪ Normal";
}

function decisionLabel(decision: string): { emoji: string; label: string } {
  if (decision === "APPROVED") return { emoji: "✅", label: "Approved" };
  if (decision === "REJECTED") return { emoji: "❌", label: "Rejected" };
  return { emoji: "🔄", label: "Revision Requested" };
}

// ── Notification: new request submitted ──────────────────────────────────────

export interface RequestSummary {
  id: string;
  title: string;
  campaignName: string;
  requesterName: string;
  requesterEmail: string;
  platforms: string[];
  sizes: string[];
  priority?: string;
  deadline?: Date | null;
}

export async function notifyNewRequest(req: RequestSummary): Promise<void> {
  const client = getClient();
  if (!client) return;

  const deadlineStr = req.deadline
    ? req.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Not set";

  const blocks: (KnownBlock | Block)[] = [
    header("📋 New Banner Request"),
    context([`Submitted by *${req.requesterName || req.requesterEmail}*`]),
    fields([
      ["Title", req.title],
      ["Campaign", req.campaignName],
      ["Platforms", req.platforms.join(", ") || "—"],
      ["Sizes", req.sizes.join(", ") || "—"],
      ["Priority", priorityBadge(req.priority ?? "NORMAL")],
      ["Deadline", deadlineStr],
    ]),
    divider,
    {
      type: "actions",
      elements: [linkButton("View Request →", `${APP_URL()}/requests/${req.id}`, "primary")],
    },
  ];

  await client.chat.postMessage({
    channel: NOTIFY_CHANNEL(),
    text: `New banner request: ${req.title} — ${req.campaignName}`,
    blocks,
  }).catch((err) => console.error("[slack] notifyNewRequest failed:", err));
}

// ── Notification: banners ready for review ────────────────────────────────────

export interface ReviewNotificationPayload {
  reviewId: string;
  requestId: string;
  requestTitle: string;
  campaignName: string;
  requesterName?: string;
  bannerCount: number;
  roundNumber?: number;
}

/**
 * Posts an interactive approval message to the approver channel.
 * Returns { ts, channel } so the coordinates can be stored for later update.
 * Approve is a direct action; Reject and Revision open a notes modal.
 */
export async function notifyReadyForReview(
  payload: ReviewNotificationPayload
): Promise<{ ts: string; channel: string } | null> {
  const client = getClient();
  if (!client) return null;

  const round = payload.roundNumber ?? 1;
  const roundSuffix = round > 1 ? ` (round ${round})` : "";

  const blocks: (KnownBlock | Block)[] = [
    header("👀 Banners Ready for Review"),
    context([
      `Round ${round} · ${payload.bannerCount} banner${payload.bannerCount !== 1 ? "s" : ""} generated`,
      ...(payload.requesterName ? [`Requested by *${payload.requesterName}*`] : []),
    ]),
    fields([
      ["Request", payload.requestTitle],
      ["Campaign", payload.campaignName],
    ]),
    divider,
    {
      type: "actions",
      elements: [
        actionButton("✅  Approve", "review_approve", payload.reviewId, "primary"),
        // Revision and Reject open a notes modal — action_id prefix tells handler which decision
        actionButton("🔄  Request Revision", "review_revision_modal", payload.reviewId),
        actionButton("❌  Reject", "review_reject_modal", payload.reviewId, "danger"),
        linkButton("Open in App →", `${APP_URL()}/review/${payload.requestId}`),
      ],
    },
  ];

  try {
    const result = await client.chat.postMessage({
      channel: APPROVER_CHANNEL(),
      text: `Banner review needed: ${payload.requestTitle}${roundSuffix}`,
      blocks,
    });

    if (result.ok && result.ts && result.channel) {
      return { ts: result.ts, channel: result.channel };
    }
  } catch (err) {
    console.error("[slack] notifyReadyForReview failed:", err);
  }
  return null;
}

// ── Interactive: open notes modal for reject / revision ───────────────────────

/**
 * Opens a Slack modal prompting the reviewer for notes.
 * Called in response to a block_action with the payload's trigger_id.
 * `decision` is encoded into the modal callback_id so the submission handler
 * knows which decision was intended.
 */
export async function openNotesModal(params: {
  triggerId: string;
  reviewId: string;
  requestTitle: string;
  decision: "REJECTED" | "REVISION_REQUESTED";
}): Promise<void> {
  const client = getClient();
  if (!client) return;

  const isRejection = params.decision === "REJECTED";

  await client.views.open({
    trigger_id: params.triggerId,
    view: {
      type: "modal",
      // Encode reviewId + decision into callback_id so submission handler can read it
      callback_id: `review_notes_modal|${params.decision}|${params.reviewId}`,
      title: {
        type: "plain_text",
        text: isRejection ? "Reject Request" : "Request Revision",
      },
      submit: {
        type: "plain_text",
        text: isRejection ? "Reject" : "Request Revision",
      },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        section(
          isRejection
            ? `You are about to *reject* the banner request:\n*${params.requestTitle}*`
            : `You are about to *request a revision* for:\n*${params.requestTitle}*`
        ),
        {
          type: "input",
          block_id: "notes_block",
          label: {
            type: "plain_text",
            text: isRejection ? "Reason for rejection" : "What needs to change?",
          },
          element: {
            type: "plain_text_input",
            action_id: "notes_input",
            multiline: true,
            min_length: 10,
            placeholder: {
              type: "plain_text",
              text: isRejection
                ? "Explain why this request is being rejected…"
                : "Describe what changes are needed before re-generation…",
            },
          },
        },
      ],
    },
  }).catch((err) => console.error("[slack] openNotesModal failed:", err));
}

// ── Update: replace approval message with decision outcome ────────────────────

/**
 * Replaces the interactive approval buttons with a resolved decision block.
 * Called after a decision is made either from Slack or the web app.
 */
export async function updateReviewMessage(
  channelId: string,
  ts: string,
  decision: string,
  reviewerName: string,
  context?: { requestTitle?: string; notes?: string | null }
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const { emoji, label } = decisionLabel(decision);
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${label}* by ${reviewerName} on ${date}`,
      },
    },
    ...(context?.requestTitle
      ? [
          {
            type: "context" as const,
            elements: [
              { type: "mrkdwn" as const, text: `Request: *${context.requestTitle}*` },
            ],
          },
        ]
      : []),
    ...(context?.notes
      ? [
          {
            type: "section" as const,
            text: { type: "mrkdwn" as const, text: `*Notes:* ${context.notes}` },
          },
        ]
      : []),
  ];

  await client.chat.update({
    channel: channelId,
    ts,
    text: `${emoji} ${label} by ${reviewerName}`,
    blocks,
  }).catch((err) => console.error("[slack] updateReviewMessage failed:", err));
}

// ── Notification: requester notified of decision ──────────────────────────────

/**
 * Notifies the requester of the review outcome.
 *
 * Current implementation: posts to SLACK_NOTIFY_CHANNEL.
 *
 * TODO: Send a DM directly to the requester.
 *   This requires knowing their Slack user ID. Options:
 *   1. Store slackUserId on the User model and populate on first login.
 *   2. Look up by email: slack.users.lookupByEmail({ email }) — requires users:read.email scope.
 *   Scaffolded below; swap the channel for the DM channel once user mapping is available.
 */
export async function notifyRequester(params: {
  requesterEmail: string;
  requestTitle: string;
  requestId: string;
  decision: string;
  comments?: string | null;
}): Promise<void> {
  const client = getClient();
  if (!client) return;

  const { emoji, label } = decisionLabel(params.decision);

  // TODO: Replace NOTIFY_CHANNEL() with a DM channel obtained via:
  //   const user = await client.users.lookupByEmail({ email: params.requesterEmail });
  //   const dm = await client.conversations.open({ users: user.user!.id! });
  //   const channel = dm.channel!.id!;
  const channel = NOTIFY_CHANNEL();

  const blocks: (KnownBlock | Block)[] = [
    header(`${emoji} Decision on Your Request`),
    fields([
      ["Request", params.requestTitle],
      ["Decision", `${emoji} ${label}`],
    ]),
    ...(params.comments
      ? [section(`*Reviewer notes:*\n${params.comments}`)]
      : []),
    divider,
    {
      type: "actions",
      elements: [linkButton("View Request →", `${APP_URL()}/requests/${params.requestId}`)],
    },
  ];

  await client.chat.postMessage({
    channel,
    text: `${emoji} Banner request "${params.requestTitle}" — ${label}`,
    blocks,
  }).catch((err) => console.error("[slack] notifyRequester failed:", err));
}

// ── Utility: test connection ───────────────────────────────────────────────────

/**
 * Calls auth.test to verify the bot token is valid.
 * Returns bot identity info on success, null on failure.
 */
export async function testSlackConnection(): Promise<{
  ok: boolean;
  botName?: string;
  teamName?: string;
  error?: string;
}> {
  const client = getClient();
  if (!client) return { ok: false, error: "SLACK_BOT_TOKEN is not set" };

  try {
    const result = await client.auth.test();
    return {
      ok: true,
      botName: result.user ?? undefined,
      teamName: result.team ?? undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
