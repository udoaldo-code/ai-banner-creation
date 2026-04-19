"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VARIANT_STATUS_COLORS, type VariantStatus, type RequestStatus } from "@/types";

interface VariantRecord {
  id: string;
  size: string;
  variant: number;
  status: string;
  htmlContent: string | null;
  storageKey: string | null;
  error: string | null;
}

interface RunStatus {
  id: string;
  runNumber: number;
  status: string;
  variantCount: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  variants: Omit<VariantRecord, "htmlContent">[];
}

interface BannerGridProps {
  requestId: string;
  /** Initial variants from the server render (latest run only) */
  banners: VariantRecord[];
  canGenerate: boolean;
  requestStatus: RequestStatus;
}

const POLL_INTERVAL_MS = 3000;

export function BannerGrid({ requestId, banners: initialBanners, canGenerate, requestStatus }: BannerGridProps) {
  const [variants, setVariants] = useState<VariantRecord[]>(initialBanners);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [variantCount, setVariantCount] = useState(2);
  const [previewBanner, setPreviewBanner] = useState<VariantRecord | null>(null);
  const [currentRequestStatus, setCurrentRequestStatus] = useState<RequestStatus>(requestStatus);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch full variant HTML for display (lightweight status poll only returns ids/statuses)
  const fetchVariantHtml = useCallback(async (variantId: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/banners/variant/${variantId}`);
      if (res.ok) {
        const data = await res.json();
        return data.htmlContent ?? null;
      }
    } catch {}
    return null;
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/banners/status?requestId=${requestId}`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.requestStatus) {
        setCurrentRequestStatus(data.requestStatus as RequestStatus);
      }

      if (data.run) {
        setRunStatus(data.run);

        // Merge status updates into local variant state
        setVariants((prev) => {
          const byId = new Map(prev.map((v) => [v.id, v]));
          for (const sv of data.run.variants) {
            const existing = byId.get(sv.id);
            if (existing) {
              byId.set(sv.id, { ...existing, status: sv.status, error: sv.error ?? null });
            } else {
              // New variant (e.g. first poll after trigger)
              byId.set(sv.id, {
                id: sv.id,
                size: sv.size,
                variant: sv.variant,
                status: sv.status,
                error: sv.error ?? null,
                htmlContent: null,
                storageKey: null,
              });
            }
          }
          return Array.from(byId.values());
        });

        if (data.isTerminal) {
          setIsPolling(false);
          // Fetch HTML content for READY variants that don't have it yet
          setVariants((prev) =>
            prev.map((v) => {
              if (v.status === "READY" && !v.htmlContent) {
                fetchVariantHtml(v.id).then((html) => {
                  if (html) {
                    setVariants((cur) =>
                      cur.map((c) => (c.id === v.id ? { ...c, htmlContent: html } : c))
                    );
                  }
                });
              }
              return v;
            })
          );
        } else {
          // Schedule next poll
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } else if (data.isTerminal) {
        setIsPolling(false);
      } else {
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch {
      // Keep polling on transient errors
      if (isPolling) {
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
  }, [requestId, fetchVariantHtml, isPolling]);

  // Start polling when isPolling becomes true
  useEffect(() => {
    if (isPolling) {
      pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [isPolling, poll]);

  // If there's an active run on mount, start polling
  useEffect(() => {
    if (["IN_PROGRESS"].includes(requestStatus)) {
      setIsPolling(true);
    }
  }, [requestStatus]);

  async function handleGenerate() {
    setTriggering(true);
    try {
      const res = await fetch("/api/banners/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, variants: variantCount }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Generation failed to start");
        return;
      }

      const data = await res.json();
      // Seed placeholder variant rows immediately
      const sizes = variants.length > 0
        ? [...new Set(variants.map((v) => v.size))]
        : [];

      // We don't know sizes here (they come from the request) — clear old and wait for poll
      setVariants([]);
      setRunStatus(null);
      setCurrentRequestStatus("IN_PROGRESS");
      setIsPolling(true);

      // First poll sooner
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = setTimeout(poll, 800);
    } finally {
      setTriggering(false);
    }
  }

  const canTriggerGeneration =
    canGenerate &&
    ["SUBMITTED", "REVISION_REQUESTED", "IN_PROGRESS"].includes(currentRequestStatus) &&
    !isPolling;

  const isGenerating = isPolling || currentRequestStatus === "IN_PROGRESS";

  const grouped = variants.reduce<Record<string, VariantRecord[]>>((acc, v) => {
    if (!acc[v.size]) acc[v.size] = [];
    acc[v.size].push(v);
    return acc;
  }, {});

  const readyCount = variants.filter((v) => v.status === "READY" || v.status === "APPROVED").length;
  const errorCount = variants.filter((v) => v.status === "ERROR").length;
  const pendingCount = variants.filter((v) => ["PENDING", "GENERATING"].includes(v.status)).length;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Generated Banners{" "}
            {variants.length > 0 && (
              <span className="text-sm text-gray-400 font-normal">({variants.length})</span>
            )}
          </h2>
          {isGenerating && runStatus && (
            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1.5">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generating… {readyCount}/{runStatus.variantCount} done
              {errorCount > 0 && `, ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
            </p>
          )}
          {runStatus?.status === "COMPLETED" && (
            <p className="text-xs text-green-600 mt-0.5">
              Run #{runStatus.runNumber} — {readyCount} ready{errorCount > 0 ? `, ${errorCount} errors` : ""}
            </p>
          )}
          {runStatus?.status === "FAILED" && (
            <p className="text-xs text-red-600 mt-0.5">Run failed: {runStatus.error ?? "unknown error"}</p>
          )}
        </div>

        {canTriggerGeneration && (
          <div className="flex items-center gap-2">
            <select
              value={variantCount}
              onChange={(e) => setVariantCount(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value={1}>1 variant</option>
              <option value={2}>2 variants</option>
              <option value={3}>3 variants</option>
            </select>
            <Button size="sm" onClick={handleGenerate} disabled={triggering}>
              {triggering ? "Starting…" : variants.length > 0 ? "Regenerate" : "Generate Banners"}
            </Button>
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Generating…
          </div>
        )}
      </div>

      {/* Empty states */}
      {variants.length === 0 && !isGenerating && !canTriggerGeneration && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            Banners will appear here once generation is triggered.
          </CardContent>
        </Card>
      )}

      {variants.length === 0 && !isGenerating && canTriggerGeneration && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-gray-500 mb-4">No banners yet. Select variant count and click Generate.</p>
          </CardContent>
        </Card>
      )}

      {variants.length === 0 && isGenerating && (
        <Card>
          <CardContent className="py-10 text-center">
            <div className="flex flex-col items-center gap-3 text-gray-500">
              <svg className="h-8 w-8 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm">Claude is generating your banners…</p>
              <p className="text-xs text-gray-400">This usually takes 30–90 seconds per banner.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banner grid */}
      {Object.entries(grouped).map(([size, sizeVariants]) => (
        <div key={size} className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-mono">
            {size}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {sizeVariants.map((v) => (
              <BannerCard
                key={v.id}
                banner={v}
                onPreview={() => setPreviewBanner(v)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Preview modal */}
      {previewBanner && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewBanner(null)}
        >
          <div
            className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-900">
                {previewBanner.size} — Variant {previewBanner.variant}
              </p>
              <div className="flex items-center gap-2">
                {previewBanner.htmlContent && (
                  <a
                    href={`data:text/html;charset=utf-8,${encodeURIComponent(previewBanner.htmlContent)}`}
                    download={`banner-${previewBanner.size}-v${previewBanner.variant}.html`}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Download HTML
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={() => setPreviewBanner(null)}>
                  Close ×
                </Button>
              </div>
            </div>
            {previewBanner.htmlContent ? (
              <div className="border border-gray-200 rounded-lg overflow-auto bg-white">
                <div
                  className="m-auto"
                  dangerouslySetInnerHTML={{ __html: previewBanner.htmlContent }}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">Preview not available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BannerCard({ banner, onPreview }: { banner: VariantRecord; onPreview: () => void }) {
  const hasPreview = !!(banner.htmlContent);
  const isGenerating = ["PENDING", "GENERATING"].includes(banner.status);

  return (
    <Card className="overflow-hidden">
      <div
        className={`bg-gray-50 flex items-center justify-center min-h-28 relative ${hasPreview ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
        onClick={hasPreview ? onPreview : undefined}
      >
        {banner.htmlContent ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden p-1">
            <div
              className="pointer-events-none"
              style={{ transform: "scale(0.4)", transformOrigin: "top left" }}
              dangerouslySetInnerHTML={{ __html: banner.htmlContent }}
            />
          </div>
        ) : isGenerating ? (
          <div className="flex flex-col items-center gap-2 text-gray-400 py-6">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-xs">Generating…</span>
          </div>
        ) : banner.status === "ERROR" ? (
          <div className="py-6 px-3 text-center">
            <span className="text-xs text-red-500">{banner.error ?? "Error"}</span>
          </div>
        ) : (
          <div className="py-6 text-gray-300 text-xs">Pending</div>
        )}
      </div>
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">v{banner.variant}</span>
          <Badge className={VARIANT_STATUS_COLORS[banner.status as VariantStatus]}>
            {banner.status}
          </Badge>
        </div>
        {hasPreview && (
          <Button variant="ghost" size="sm" onClick={onPreview} className="text-xs">
            Preview
          </Button>
        )}
      </div>
    </Card>
  );
}
