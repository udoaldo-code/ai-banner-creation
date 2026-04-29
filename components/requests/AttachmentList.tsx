"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Attachment {
  id: string;
  filename: string;
  label: string | null;
  contentType: string;
  sizeBytes: number;
  category: "BRAND_MATERIAL" | "SAMPLE_BANNER" | "COMPETITOR_REFERENCE" | "OTHER";
  storageKey: string;
  createdAt: string;
  uploadedBy: { name: string | null; email: string };
}

const CATEGORY_LABELS: Record<Attachment["category"], string> = {
  BRAND_MATERIAL: "Brand Material",
  SAMPLE_BANNER: "Sample Banner",
  COMPETITOR_REFERENCE: "Competitor Reference",
  OTHER: "Other",
};

const CATEGORY_ORDER: Attachment["category"][] = [
  "BRAND_MATERIAL",
  "SAMPLE_BANNER",
  "COMPETITOR_REFERENCE",
  "OTHER",
];

interface AttachmentListProps {
  requestId: string;
  /** Whether the current user can delete attachments */
  canDelete?: boolean;
  /** Show upload controls */
  canUpload?: boolean;
}

function FileIcon({ contentType }: { contentType: string }) {
  const ext = contentType.includes("pdf")
    ? "PDF"
    : contentType.startsWith("image/")
    ? "IMG"
    : contentType.includes("zip")
    ? "ZIP"
    : "FILE";
  return (
    <div className="h-8 w-8 rounded bg-gray-100 text-gray-500 text-xs font-mono font-semibold flex items-center justify-center shrink-0">
      {ext}
    </div>
  );
}

export function AttachmentList({ requestId, canDelete = false, canUpload = false }: AttachmentListProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/attachments`);
      if (res.ok) setAttachments(await res.json());
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(attachment: Attachment) {
    if (!confirm(`Delete "${attachment.filename}"?`)) return;
    setDeletingId(attachment.id);
    try {
      await fetch(
        `/api/requests/${requestId}/attachments?attachmentId=${attachment.id}`,
        { method: "DELETE" }
      );
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const arr = Array.from(files);

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      setUploadProgress(`Uploading ${i + 1}/${arr.length}: ${file.name}`);

      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("context", "attachment");
        fd.append("resourceId", requestId);

        const uploadRes = await fetch("/api/uploads/presign", {
          method: "POST",
          body: fd,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          alert(`Upload failed for ${file.name} [${uploadRes.status}]: ${err.error ?? "unknown error"}`);
          continue;
        }

        const { key } = await uploadRes.json();

        const regRes = await fetch(`/api/requests/${requestId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey: key,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            category: "OTHER",
          }),
        });

        if (regRes.ok) {
          const created: Attachment = await regRes.json();
          setAttachments((prev) => [...prev, created]);
        }
      } catch (err) {
        alert(`Upload failed for ${file.name}: ${(err as Error).message}`);
      }
    }

    setUploadProgress(null);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Group by category in canonical order
  const grouped = CATEGORY_ORDER.reduce<Record<string, Attachment[]>>((acc, cat) => {
    const items = attachments.filter((a) => a.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const isEmpty = attachments.length === 0;

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-gray-400">Loading attachments…</p>
      ) : isEmpty ? (
        <p className="text-sm text-gray-400">No attachments yet.</p>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              {CATEGORY_LABELS[cat as Attachment["category"]]}
            </p>
            <div className="space-y-1.5">
              {items.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <FileIcon contentType={att.contentType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{att.label ?? att.filename}</p>
                    {att.label && (
                      <p className="text-xs text-gray-400 truncate">{att.filename}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {(att.sizeBytes / 1024 / 1024).toFixed(1)} MB ·{" "}
                      {att.uploadedBy.name ?? att.uploadedBy.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(att)}
                        disabled={deletingId === att.id}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                      >
                        {deletingId === att.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {canUpload && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            {uploadProgress ?? "+ Add Attachment"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.zip"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      )}
    </div>
  );
}
