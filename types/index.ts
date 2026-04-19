// ── Enums (mirror Prisma schema exactly) ──────────────────────────────────────

export type Role =
  | "ADMIN"
  | "CREATIVE_HEAD"
  | "DESIGNER"
  | "APPROVER"
  | "REQUESTER";

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

export type RequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "REVISION_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type GenerationStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type VariantStatus =
  | "PENDING"
  | "GENERATING"
  | "READY"
  | "APPROVED"
  | "REJECTED"
  | "ERROR";

// Alias for backward compatibility with existing component code
export type BannerStatus = VariantStatus;

export type ReviewDecision =
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED";

// Alias for backward compatibility
export type Decision = ReviewDecision;

export type ActivityAction =
  | "REQUEST_CREATED"
  | "REQUEST_SUBMITTED"
  | "REQUEST_CANCELLED"
  | "REQUEST_STATUS_CHANGED"
  | "GENERATION_STARTED"
  | "GENERATION_COMPLETED"
  | "GENERATION_FAILED"
  | "REVIEW_OPENED"
  | "REVIEW_DECISION_MADE"
  | "REVIEW_CHECKLIST_UPDATED"
  | "TEMPLATE_CREATED"
  | "TEMPLATE_UPDATED"
  | "TEMPLATE_VERSION_CREATED"
  | "COMMENT_ADDED"
  | "COMMENT_DELETED"
  | "USER_ROLE_CHANGED"
  | "TEAM_MEMBER_ADDED"
  | "TEAM_MEMBER_REMOVED";

export type SlackNotificationType =
  | "REQUEST_SUBMITTED"
  | "GENERATION_COMPLETE"
  | "REVIEW_REQUESTED"
  | "REVIEW_DECISION"
  | "REVISION_REQUESTED";

export type SlackNotificationStatus = "SENT" | "UPDATED" | "FAILED" | "DELETED";

export type CommentEntityType = "REQUEST" | "VARIANT";

// ── Domain constants ───────────────────────────────────────────────────────────

export type Platform = "META" | "GOOGLE" | "TIKTOK" | "PROGRAMMATIC" | "LINKEDIN";

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "META", label: "Meta (FB/IG)" },
  { value: "GOOGLE", label: "Google Display" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "PROGRAMMATIC", label: "Programmatic" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

export const BANNER_SIZES: { value: string; label: string; width: number; height: number }[] = [
  { value: "300x250", label: "Medium Rectangle (300×250)", width: 300, height: 250 },
  { value: "728x90", label: "Leaderboard (728×90)", width: 728, height: 90 },
  { value: "160x600", label: "Wide Skyscraper (160×600)", width: 160, height: 600 },
  { value: "320x50", label: "Mobile Banner (320×50)", width: 320, height: 50 },
  { value: "300x600", label: "Half Page (300×600)", width: 300, height: 600 },
  { value: "970x250", label: "Billboard (970×250)", width: 970, height: 250 },
  { value: "1200x628", label: "Social Feed (1200×628)", width: 1200, height: 628 },
  { value: "1080x1080", label: "Square (1080×1080)", width: 1080, height: 1080 },
  { value: "1080x1920", label: "Story/Reel (1080×1920)", width: 1080, height: 1920 },
];

// ── UI label/color maps ────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  REVISION_REQUESTED: "Revision Needed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const STATUS_COLORS: Record<RequestStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  IN_REVIEW: "bg-purple-100 text-purple-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export const VARIANT_STATUS_COLORS: Record<VariantStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  GENERATING: "bg-yellow-100 text-yellow-700",
  READY: "bg-green-100 text-green-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  ERROR: "bg-red-100 text-red-700",
};

// Backward compat alias
export const BANNER_STATUS_COLORS = VARIANT_STATUS_COLORS;

export const GENERATION_STATUS_COLORS: Record<GenerationStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  RUNNING: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVISION_REQUESTED: "Revision Requested",
};

export const DECISION_COLORS: Record<ReviewDecision, string> = {
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
};

// ── Checklist templates (default items seeded into each new review) ────────────

export const DEFAULT_REVIEW_CHECKLIST: { label: string; category: string; sortOrder: number }[] = [
  { label: "Brand colors, fonts, and logo usage are compliant", category: "brand_compliance", sortOrder: 0 },
  { label: "CTA text is clear, actionable, and URL is correct", category: "cta_clarity", sortOrder: 1 },
  { label: "All text is legible at the banner's actual dimensions", category: "readability", sortOrder: 2 },
  { label: "Visual hierarchy guides the eye to headline then CTA", category: "visual_hierarchy", sortOrder: 3 },
  { label: "Layout and dimensions suit the target platform", category: "platform_suitability", sortOrder: 4 },
];

// ── Role helpers ───────────────────────────────────────────────────────────────

// ── Priority helpers (shared across pages) ─────────────────────────────────────

export const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_COLORS: Record<string, string> = {
  NORMAL: "bg-gray-100 text-gray-600",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  CREATIVE_HEAD: "Creative Head",
  DESIGNER: "Designer",
  APPROVER: "Approver",
  REQUESTER: "Requester",
};

export const ROLE_COLORS: Record<Role, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  CREATIVE_HEAD: "bg-blue-100 text-blue-700",
  APPROVER: "bg-green-100 text-green-700",
  DESIGNER: "bg-yellow-100 text-yellow-700",
  REQUESTER: "bg-gray-100 text-gray-700",
};
