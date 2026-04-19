"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DECISION_LABELS,
  DECISION_COLORS,
  type RequestStatus,
  type ReviewDecision,
} from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VariantRecord {
  id: string;
  size: string;
  variant: number;
  status: string;
  htmlContent: string | null;
  storageKey: string | null;
  error: string | null;
}

interface ChecklistItem {
  id: string;
  label: string;
  category?: string;
  checked: boolean;
  sortOrder: number;
}

interface ReviewPanelProps {
  requestId: string;
  banners: VariantRecord[];
  checklistItems: ChecklistItem[];
  existingDecision: string | null;
  existingNotes: string | null;
  requestStatus: RequestStatus;
  roundNumber: number;
  /** Compact brief shown above the gallery */
  brief?: {
    headline: string;
    ctaText: string;
    platforms: string[];
    sizes: string[];
  };
}

// ── Variant status helpers ─────────────────────────────────────────────────────

type MarkStatus = "APPROVED" | "REJECTED" | "READY";

const VARIANT_RING: Record<string, string> = {
  APPROVED: "ring-2 ring-green-500",
  REJECTED: "ring-2 ring-red-400",
  READY: "",
  PENDING: "",
  GENERATING: "",
  ERROR: "ring-2 ring-red-300",
};

const VARIANT_OVERLAY: Record<string, string> = {
  APPROVED: "bg-green-500/10",
  REJECTED: "bg-red-500/10",
  READY: "",
  ERROR: "bg-red-500/10",
};

// ── Main component ─────────────────────────────────────────────────────────────

export function ReviewPanel({
  requestId,
  banners,
  checklistItems: initialChecklist,
  existingDecision,
  existingNotes,
  requestStatus,
  roundNumber,
  brief,
}: ReviewPanelProps) {
  const router = useRouter();

  // Variant statuses (optimistic)
  const [variantStatuses, setVariantStatuses] = useState<Record<string, string>>(
    Object.fromEntries(banners.map((b) => [b.id, b.status]))
  );

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initialChecklist);

  // Decision form
  const [decision, setDecision] = useState<ReviewDecision | "">(
    (existingDecision as ReviewDecision) ?? ""
  );
  const [notes, setNotes] = useState(existingNotes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Preview modal
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const isAlreadyDecided = requestStatus !== "IN_REVIEW";
  const needsNotes = ["REJECTED", "REVISION_REQUESTED"].includes(decision);
  const checkedCount = checklist.filter((c) => c.checked).length;

  // Count variant outcomes
  const approvedCount = Object.values(variantStatuses).filter((s) => s === "APPROVED").length;
  const rejectedCount = Object.values(variantStatuses).filter((s) => s === "REJECTED").length;
  const readyCount = Object.values(variantStatuses).filter((s) => s === "READY").length;
  const reviewableBanners = banners.filter((b) =>
    ["READY", "APPROVED", "REJECTED"].includes(b.status)
  );

  // Auto-suggest decision from variant marks
  useEffect(() => {
    if (isAlreadyDecided || decision) return;
    if (approvedCount > 0 && readyCount === 0 && rejectedCount === 0) {
      setDecision("APPROVED");
    } else if (rejectedCount > 0 && approvedCount === 0 && readyCount === 0) {
      setDecision("REJECTED");
    } else if (rejectedCount > 0 || (approvedCount > 0 && readyCount > 0)) {
      setDecision("REVISION_REQUESTED");
    }
  }, [approvedCount, rejectedCount, readyCount, isAlreadyDecided, decision]);

  // ── Variant marking ──────────────────────────────────────────────────────────

  const markVariant = useCallback(
    async (variantId: string, status: MarkStatus) => {
      const prev = variantStatuses[variantId];
      const next = prev === status ? "READY" : status; // toggle off → READY

      setVariantStatuses((s) => ({ ...s, [variantId]: next }));

      try {
        const res = await fetch(`/api/banners/variant/${variantId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setVariantStatuses((s) => ({ ...s, [variantId]: prev }));
      }
    },
    [variantStatuses]
  );

  // ── Checklist toggling ───────────────────────────────────────────────────────

  const toggleChecklist = useCallback(
    async (item: ChecklistItem) => {
      const next = !item.checked;
      setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, checked: next } : c)));
      try {
        await fetch(`/api/review/${requestId}?itemId=${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checked: next }),
        });
      } catch {
        setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, checked: item.checked } : c)));
      }
    },
    [requestId]
  );

  // ── Decision submission ──────────────────────────────────────────────────────

  async function submitDecision() {
    if (!decision || submitting) return;
    if (needsNotes && notes.trim().length < 5) {
      notesRef.current?.focus();
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      });
      if (res.ok) {
        router.push("/review");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "Review submission failed — please try again.");
      }
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Preview modal keyboard shortcuts ────────────────────────────────────────

  const previewBanner = previewIndex !== null ? reviewableBanners[previewIndex] ?? null : null;

  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const prevPreview = useCallback(
    () => setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : i)),
    []
  );
  const nextPreview = useCallback(
    () =>
      setPreviewIndex((i) =>
        i !== null && i < reviewableBanners.length - 1 ? i + 1 : i
      ),
    [reviewableBanners.length]
  );

  useEffect(() => {
    if (previewIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { closePreview(); return; }
      if (e.key === "ArrowLeft") { prevPreview(); return; }
      if (e.key === "ArrowRight") { nextPreview(); return; }
      if (e.key === "a" || e.key === "A") {
        if (previewBanner) markVariant(previewBanner.id, "APPROVED");
      }
      if (e.key === "x" || e.key === "X") {
        if (previewBanner) markVariant(previewBanner.id, "REJECTED");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIndex, previewBanner, closePreview, prevPreview, nextPreview, markVariant]);

  // ── Group banners by size ────────────────────────────────────────────────────

  const grouped = banners.reduce<Record<string, VariantRecord[]>>((acc, b) => {
    if (!acc[b.size]) acc[b.size] = [];
    acc[b.size].push(b);
    return acc;
  }, {});

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 items-start">
      {/* ── Gallery (main column) ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* Brief strip */}
        {brief && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
            <span><span className="font-medium text-gray-800">Headline</span> — {brief.headline}</span>
            <span><span className="font-medium text-gray-800">CTA</span> — {brief.ctaText}</span>
            <span><span className="font-medium text-gray-800">Platforms</span> — {brief.platforms.join(", ")}</span>
          </div>
        )}

        {banners.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-gray-500">
              No banners have been generated for this request yet.
            </CardContent>
          </Card>
        ) : (
          Object.entries(grouped).map(([size, sizeBanners]) => (
            <section key={size}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">
                  {size}
                </span>
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-xs text-gray-400">
                  {sizeBanners.filter((b) => variantStatuses[b.id] === "APPROVED").length}/
                  {sizeBanners.length} approved
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {sizeBanners.map((banner, sizeIdx) => {
                  const status = variantStatuses[banner.id] ?? banner.status;
                  const globalIdx = reviewableBanners.findIndex((b) => b.id === banner.id);
                  const isReviewable = ["READY", "APPROVED", "REJECTED"].includes(status);

                  return (
                    <div key={banner.id} className="group relative">
                      <div
                        className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-all ${
                          VARIANT_RING[status] ?? ""
                        } ${isReviewable ? "cursor-pointer" : ""}`}
                        onClick={() => isReviewable && setPreviewIndex(globalIdx)}
                      >
                        {/* Thumbnail */}
                        <div className={`flex h-36 items-center justify-center overflow-hidden ${VARIANT_OVERLAY[status] ?? ""}`}>
                          {banner.htmlContent ? (
                            <div
                              className="pointer-events-none"
                              style={{ transform: "scale(0.32)", transformOrigin: "top left" }}
                              dangerouslySetInnerHTML={{ __html: banner.htmlContent }}
                            />
                          ) : status === "ERROR" ? (
                            <span className="text-xs text-red-400 px-3 text-center">{banner.error ?? "Error"}</span>
                          ) : (
                            <span className="text-xs text-gray-300">No preview</span>
                          )}
                        </div>

                        {/* Status icon overlay (top-right) */}
                        {status === "APPROVED" && (
                          <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                            ✓
                          </div>
                        )}
                        {status === "REJECTED" && (
                          <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-400 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                            ✕
                          </div>
                        )}
                      </div>

                      {/* Per-variant controls */}
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className="text-xs text-gray-500 font-mono">v{banner.variant}</span>

                        {isReviewable && !isAlreadyDecided && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              title="Approve this variant (A)"
                              onClick={(e) => { e.stopPropagation(); markVariant(banner.id, "APPROVED"); }}
                              className={`h-7 w-7 rounded-md border text-xs font-semibold transition-colors flex items-center justify-center ${
                                status === "APPROVED"
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-gray-200 bg-white text-gray-400 hover:border-green-400 hover:text-green-600"
                              }`}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              title="Flag this variant (X)"
                              onClick={(e) => { e.stopPropagation(); markVariant(banner.id, "REJECTED"); }}
                              className={`h-7 w-7 rounded-md border text-xs font-semibold transition-colors flex items-center justify-center ${
                                status === "REJECTED"
                                  ? "border-red-400 bg-red-400 text-white"
                                  : "border-gray-200 bg-white text-gray-400 hover:border-red-300 hover:text-red-500"
                              }`}
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {isAlreadyDecided && status === "APPROVED" && (
                          <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>
                        )}
                        {isAlreadyDecided && status === "REJECTED" && (
                          <Badge className="bg-red-100 text-red-700 text-xs">Rejected</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* ── Sidebar (fixed width) ──────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 space-y-4 sticky top-6">
        {/* Progress */}
        {!isAlreadyDecided && banners.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Review Progress
              {roundNumber > 1 && (
                <span className="ml-1 font-normal text-gray-400">Round {roundNumber}</span>
              )}
            </p>
            <div className="flex gap-3 text-xs">
              <span className="text-green-600 font-medium">{approvedCount} approved</span>
              {rejectedCount > 0 && <span className="text-red-500 font-medium">{rejectedCount} flagged</span>}
              {readyCount > 0 && <span className="text-gray-400">{readyCount} unmarked</span>}
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
              {approvedCount > 0 && (
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(approvedCount / banners.length) * 100}%` }}
                />
              )}
              {rejectedCount > 0 && (
                <div
                  className="h-full bg-red-400 rounded-full transition-all"
                  style={{ width: `${(rejectedCount / banners.length) * 100}%` }}
                />
              )}
            </div>
          </div>
        )}

        {/* Checklist */}
        {checklist.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Checklist</p>
              <span className="text-xs text-gray-400">{checkedCount}/{checklist.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={isAlreadyDecided}
                  onClick={() => toggleChecklist(item)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    isAlreadyDecided ? "cursor-default" : "hover:bg-gray-50 active:bg-gray-100"
                  }`}
                >
                  <span
                    className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      item.checked
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "border-gray-300"
                    }`}
                  >
                    {item.checked && (
                      <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-xs leading-relaxed ${item.checked ? "text-gray-400 line-through" : "text-gray-700"}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Decision */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Decision</p>
          </div>

          <div className="p-4 space-y-3">
            {isAlreadyDecided ? (
              <div className="space-y-3">
                {existingDecision && (
                  <Badge className={`${DECISION_COLORS[existingDecision as ReviewDecision]} text-sm px-3 py-1`}>
                    {DECISION_LABELS[existingDecision as ReviewDecision]}
                  </Badge>
                )}
                {existingNotes && (
                  <p className="text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-3">
                    {existingNotes}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {([
                    { value: "APPROVED", label: "Approve", desc: "Mark as production-ready", active: "border-green-500 bg-green-50 text-green-800" },
                    { value: "REVISION_REQUESTED", label: "Request Revision", desc: "Send back with notes", active: "border-orange-400 bg-orange-50 text-orange-800" },
                    { value: "REJECTED", label: "Reject", desc: "Permanently decline", active: "border-red-400 bg-red-50 text-red-800" },
                  ] as const).map(({ value, label, desc, active }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDecision(value)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        decision === value
                          ? active
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <p className="text-sm font-medium leading-tight">{label}</p>
                      <p className={`text-xs mt-0.5 ${decision === value ? "opacity-70" : "text-gray-400"}`}>{desc}</p>
                    </button>
                  ))}
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="review-notes"
                    className={`block text-xs font-medium mb-1 ${needsNotes ? "text-gray-800" : "text-gray-500"}`}
                  >
                    Notes{needsNotes ? " (required)" : " (optional)"}
                  </label>
                  <textarea
                    id="review-notes"
                    ref={notesRef}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={needsNotes ? 4 : 2}
                    placeholder={needsNotes ? "Describe what needs to change…" : "Optional feedback for the requester…"}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 resize-none focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {needsNotes && notes.trim().length > 0 && notes.trim().length < 5 && (
                    <p className="text-xs text-red-500 mt-1">At least 5 characters required</p>
                  )}
                </div>

                <Button
                  onClick={submitDecision}
                  disabled={!decision || submitting || (needsNotes && notes.trim().length < 5)}
                  className="w-full"
                >
                  {submitting ? "Submitting…" : "Submit Review"}
                </Button>

                {submitError && (
                  <p className="text-xs text-red-600 text-center">{submitError}</p>
                )}
                {!decision && !submitError && (
                  <p className="text-xs text-center text-gray-400">Select a decision above</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        {!isAlreadyDecided && (
          <p className="text-xs text-gray-400 text-center px-2">
            In preview: <kbd className="bg-gray-100 px-1 rounded">A</kbd> approve ·{" "}
            <kbd className="bg-gray-100 px-1 rounded">X</kbd> flag ·{" "}
            <kbd className="bg-gray-100 px-1 rounded">←</kbd>
            <kbd className="bg-gray-100 px-1 rounded">→</kbd> navigate
          </p>
        )}
      </aside>

      {/* ── Full-screen preview modal ──────────────────────────────────────── */}
      {previewBanner && previewIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={closePreview}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  {previewBanner.size} — Variant {previewBanner.variant}
                </span>
                <span className="text-xs text-gray-400">
                  {previewIndex + 1} / {reviewableBanners.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Variant mark controls in modal */}
                {!isAlreadyDecided && (
                  <div className="flex gap-2 mr-2">
                    <button
                      type="button"
                      title="Approve (A)"
                      onClick={() => markVariant(previewBanner.id, "APPROVED")}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        variantStatuses[previewBanner.id] === "APPROVED"
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-green-400 hover:bg-green-50"
                      }`}
                    >
                      <span>✓</span> Approve
                    </button>
                    <button
                      type="button"
                      title="Flag (X)"
                      onClick={() => markVariant(previewBanner.id, "REJECTED")}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        variantStatuses[previewBanner.id] === "REJECTED"
                          ? "border-red-400 bg-red-400 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:bg-red-50"
                      }`}
                    >
                      <span>✕</span> Flag
                    </button>
                  </div>
                )}

                {previewBanner.htmlContent && (
                  <a
                    href={`data:text/html;charset=utf-8,${encodeURIComponent(previewBanner.htmlContent)}`}
                    download={`banner-${previewBanner.size}-v${previewBanner.variant}.html`}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1.5"
                  >
                    Download
                  </a>
                )}

                <button
                  type="button"
                  onClick={closePreview}
                  className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Banner content */}
            <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center p-6">
              {previewBanner.htmlContent ? (
                <div
                  className="bg-white shadow-lg"
                  dangerouslySetInnerHTML={{ __html: previewBanner.htmlContent }}
                />
              ) : (
                <p className="text-sm text-gray-400">Preview not available</p>
              )}
            </div>

            {/* Prev / Next navigation */}
            {reviewableBanners.length > 1 && (
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between pointer-events-none px-2">
                <button
                  type="button"
                  onClick={prevPreview}
                  disabled={previewIndex === 0}
                  className="pointer-events-auto h-10 w-10 rounded-full bg-white/90 shadow-md flex items-center justify-center text-gray-600 hover:bg-white disabled:opacity-30 transition-all"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={nextPreview}
                  disabled={previewIndex === reviewableBanners.length - 1}
                  className="pointer-events-auto h-10 w-10 rounded-full bg-white/90 shadow-md flex items-center justify-center text-gray-600 hover:bg-white disabled:opacity-30 transition-all"
                >
                  →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
