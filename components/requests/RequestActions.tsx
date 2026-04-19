"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { RequestStatus } from "@/types";

interface RequestActionsProps {
  requestId: string;
  status: RequestStatus;
  isOwner: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
}

export function RequestActions({
  requestId,
  status,
  isOwner,
  isAdmin,
  isReviewer,
}: RequestActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit is only available on DRAFT — REVISION_REQUESTED uses "Reopen" first.
  const canEdit = isOwner && status === "DRAFT";
  const canSubmit = isOwner && status === "DRAFT";
  const canReopen = isOwner && status === "REVISION_REQUESTED";
  const canCancel =
    (isOwner || isAdmin) && !["APPROVED", "REJECTED", "CANCELLED"].includes(status);
  const canReviewRequest = isReviewer && status === "IN_REVIEW";

  async function doAction(action: "submit" | "cancel" | "reopen") {
    if (busy) return;
    setError(null);

    if (action === "cancel" && !confirm("Cancel this request?")) return;

    setBusy(action);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Action failed — please try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        {canEdit && (
          <Link href={`/requests/${requestId}/edit`}>
            <Button size="sm" variant="outline">Edit</Button>
          </Link>
        )}
        {canSubmit && (
          <Button
            size="sm"
            onClick={() => doAction("submit")}
            disabled={!!busy}
          >
            {busy === "submit" ? "Submitting…" : "Submit for Generation"}
          </Button>
        )}
        {canReopen && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => doAction("reopen")}
            disabled={!!busy}
          >
            {busy === "reopen" ? "Reopening…" : "Reopen for Editing"}
          </Button>
        )}
        {canReviewRequest && (
          <Link href={`/review/${requestId}`}>
            <Button size="sm" variant="primary">Review Banners</Button>
          </Link>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => doAction("cancel")}
            disabled={!!busy}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel"}
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
