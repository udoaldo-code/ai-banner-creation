import { z } from "zod";

// ── Shared primitives ─────────────────────────────────────────────────────────

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (#RRGGBB)");

// ── Request intake ────────────────────────────────────────────────────────────

/**
 * Full schema — all required fields present.
 * Used for SUBMIT validation.
 */
export const requestSubmitSchema = z.object({
  // ── Identity
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title too long (max 120 chars)"),

  // ── Campaign
  campaignName: z
    .string()
    .min(2, "Campaign name is required")
    .max(120, "Campaign name too long (max 120 chars)"),
  campaignObjective: z
    .string()
    .min(10, "Describe the campaign objective (min 10 chars)")
    .max(800, "Objective too long (max 800 chars)"),
  targetAudience: z
    .string()
    .min(10, "Describe the target audience (min 10 chars)")
    .max(600, "Target audience too long (max 600 chars)"),

  // ── Creative brief
  offerMessage: z
    .string()
    .min(5, "Describe the core offer or key message (min 5 chars)")
    .max(500, "Offer message too long (max 500 chars)"),
  headline: z
    .string()
    .min(2, "Headline is required")
    .max(80, "Headline too long (max 80 chars)"),
  subheadline: z
    .string()
    .max(120, "Subheadline too long (max 120 chars)")
    .optional()
    .or(z.literal("")),
  copyVariants: z
    .string()
    .max(2000, "Copy variants too long (max 2000 chars)")
    .optional()
    .or(z.literal("")),

  // ── CTA
  ctaText: z
    .string()
    .min(2, "CTA text is required")
    .max(30, "CTA text too long (max 30 chars)"),
  ctaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),

  // ── Platform & sizes
  platforms: z.array(z.string()).min(1, "Select at least one platform"),
  sizes: z.array(z.string()).min(1, "Select at least one banner size"),

  // ── Priority
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  priorityReason: z
    .string()
    .max(500, "Priority reason too long (max 500 chars)")
    .optional()
    .or(z.literal("")),

  // ── Brand
  brandColors: z
    .array(hexColor)
    .max(5, "Maximum 5 brand colors")
    .default([]),
  templateId: z.string().optional().or(z.literal("")),

  // ── Scheduling
  deadline: z.string().optional().or(z.literal("")),

  // ── Notes
  notes: z
    .string()
    .max(2000, "Notes too long (max 2000 chars)")
    .optional()
    .or(z.literal("")),
}).refine(
  (data) => {
    // HIGH and URGENT requests must explain why
    if (["HIGH", "URGENT"].includes(data.priority)) {
      return !!data.priorityReason && data.priorityReason.trim().length >= 10;
    }
    return true;
  },
  {
    message: "Provide a reason for the elevated priority (min 10 chars)",
    path: ["priorityReason"],
  }
);

/**
 * Draft schema — only title is required. Everything else is optional.
 * Used when the user clicks "Save Draft".
 */
export const requestDraftSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required to save a draft")
    .max(120, "Title too long (max 120 chars)"),
  campaignName: z.string().max(120).optional().or(z.literal("")),
  campaignObjective: z.string().max(800).optional().or(z.literal("")),
  targetAudience: z.string().max(600).optional().or(z.literal("")),
  offerMessage: z.string().max(500).optional().or(z.literal("")),
  headline: z.string().max(80).optional().or(z.literal("")),
  subheadline: z.string().max(120).optional().or(z.literal("")),
  copyVariants: z.string().max(2000).optional().or(z.literal("")),
  ctaText: z.string().max(30).optional().or(z.literal("")),
  ctaUrl: z.string().optional().or(z.literal("")),
  platforms: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  priorityReason: z.string().max(500).optional().or(z.literal("")),
  brandColors: z.array(hexColor).max(5).default([]),
  templateId: z.string().optional().or(z.literal("")),
  deadline: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type RequestSubmitValues = z.infer<typeof requestSubmitSchema>;
export type RequestDraftValues = z.infer<typeof requestDraftSchema>;

// Union type used by form components
export type RequestFormValues = RequestSubmitValues;

// ── Review ────────────────────────────────────────────────────────────────────

export const reviewDecisionSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED", "REVISION_REQUESTED"]),
    notes: z.string().max(3000).optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (["REJECTED", "REVISION_REQUESTED"].includes(data.decision)) {
        return !!data.notes && data.notes.trim().length >= 5;
      }
      return true;
    },
    {
      message: "Notes are required when rejecting or requesting revisions (min 5 chars)",
      path: ["notes"],
    }
  );

export type ReviewDecisionValues = z.infer<typeof reviewDecisionSchema>;

// ── Comment ───────────────────────────────────────────────────────────────────

export const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(3000, "Comment too long (max 3000 chars)"),
  parentId: z.string().optional(),
  variantId: z.string().optional(),
  entityType: z.enum(["REQUEST", "VARIANT"]).default("REQUEST"),
});

export type CommentValues = z.infer<typeof commentSchema>;
