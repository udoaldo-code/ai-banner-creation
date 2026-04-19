"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  templateId: string;
  isArchived: boolean;
}

export function ArchiveToggle({ templateId, isArchived }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const res = await fetch(`/api/templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: !isArchived }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={isPending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50 shrink-0"
      >
        {isPending ? "…" : isArchived ? "Restore" : "Archive"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
