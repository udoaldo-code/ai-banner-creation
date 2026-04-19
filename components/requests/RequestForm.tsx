"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { requestSubmitSchema, requestDraftSchema, type RequestFormValues } from "@/lib/validations";
import { PLATFORMS, BANNER_SIZES } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface Template {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  isDefault: boolean;
}

interface PendingFile {
  file: File;
  category: "BRAND_MATERIAL" | "SAMPLE_BANNER" | "COMPETITOR_REFERENCE" | "OTHER";
  label: string;
}

const ATTACHMENT_CATEGORIES: { value: PendingFile["category"]; label: string }[] = [
  { value: "BRAND_MATERIAL", label: "Brand Material" },
  { value: "SAMPLE_BANNER", label: "Sample Banner" },
  { value: "COMPETITOR_REFERENCE", label: "Competitor Reference" },
  { value: "OTHER", label: "Other" },
];

interface RequestFormProps {
  /** Pre-filled values when editing an existing draft */
  defaultValues?: Partial<RequestFormValues>;
  /** Existing request id — when set, PATCH instead of POST */
  requestId?: string;
}

export function RequestForm({ defaultValues, requestId }: RequestFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorInput, setColorInput] = useState("#");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RequestFormValues>({
    // Use draft schema for client-side validation so all fields are optional until submit
    resolver: zodResolver(requestDraftSchema),
    defaultValues: {
      platforms: [],
      sizes: [],
      brandColors: [],
      priority: "NORMAL",
      ...defaultValues,
    },
  });

  const selectedPlatforms = watch("platforms");
  const selectedSizes = watch("sizes");
  const selectedColors = watch("brandColors");
  const priority = watch("priority");

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: Template[]) => {
        setTemplates(data);
        if (!defaultValues?.templateId) {
          const def = data.find((t) => t.isDefault);
          if (def) setSelectedTemplateId(def.id);
        } else {
          setSelectedTemplateId(defaultValues.templateId ?? null);
        }
      })
      .catch(() => {});
  }, [defaultValues?.templateId]);

  function togglePlatform(value: string) {
    const current = selectedPlatforms ?? [];
    setValue(
      "platforms",
      current.includes(value) ? current.filter((p) => p !== value) : [...current, value],
      { shouldValidate: true }
    );
  }

  function toggleSize(value: string) {
    const current = selectedSizes ?? [];
    setValue(
      "sizes",
      current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
      { shouldValidate: true }
    );
  }

  function addColor() {
    const hex = colorInput.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    const current = selectedColors ?? [];
    if (current.includes(hex) || current.length >= 5) return;
    setValue("brandColors", [...current, hex], { shouldValidate: true });
    setColorInput("#");
  }

  function removeColor(color: string) {
    setValue(
      "brandColors",
      (selectedColors ?? []).filter((c) => c !== color),
      { shouldValidate: true }
    );
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const additions: PendingFile[] = Array.from(files).map((f) => ({
      file: f,
      category: "OTHER",
      label: "",
    }));
    setPendingFiles((prev) => [...prev, ...additions]);
  }

  function updateFileCategory(index: number, category: PendingFile["category"]) {
    setPendingFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, category } : f))
    );
  }

  function updateFileLabel(index: number, label: string) {
    setPendingFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, label } : f))
    );
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const uploadAttachments = useCallback(
    async (reqId: string): Promise<void> => {
      for (let i = 0; i < pendingFiles.length; i++) {
        const { file, category, label } = pendingFiles[i];
        setUploadProgress(`Uploading ${i + 1}/${pendingFiles.length}: ${file.name}`);

        // 1. Get presigned PUT URL
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: "attachment",
            resourceId: reqId,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          }),
        });

        if (!presignRes.ok) {
          const err = await presignRes.json();
          throw new Error(`Presign failed for ${file.name}: ${err.error}`);
        }

        const { uploadUrl, key } = await presignRes.json();

        // 2. Upload directly to S3
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });

        if (!putRes.ok) {
          throw new Error(`Upload to storage failed for ${file.name}`);
        }

        // 3. Register with the API
        await fetch(`/api/requests/${reqId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey: key,
            filename: file.name,
            label: label || null,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            category,
          }),
        });
      }
      setUploadProgress(null);
    },
    [pendingFiles]
  );

  async function persist(values: RequestFormValues, action: "draft" | "submit") {
    const payload = {
      ...values,
      templateId: selectedTemplateId ?? undefined,
      _action: action,
    };

    if (requestId) {
      // Editing existing request
      if (action === "submit") {
        return fetch(`/api/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, templateId: selectedTemplateId ?? undefined, _action: "submit" }),
        });
      }
      return fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, templateId: selectedTemplateId ?? undefined }),
      });
    }

    return fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function handleAction(values: RequestFormValues, action: "draft" | "submit") {
    const isSave = action === "draft";
    isSave ? setSaving(true) : setSubmitting(true);

    try {
      // For submit, validate against full schema client-side
      if (action === "submit") {
        const parsed = requestSubmitSchema.safeParse({
          ...values,
          templateId: selectedTemplateId ?? undefined,
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          alert(`Cannot submit: ${first.path.join(".")} — ${first.message}`);
          return;
        }
      }

      const res = await persist(values, action);

      if (!res.ok) {
        const err = await res.json();
        if (err.issues) {
          const first = err.issues[0];
          alert(`${first.path.join(".")} — ${first.message}`);
        } else {
          alert(err.error ?? "Something went wrong");
        }
        return;
      }

      const saved = await res.json();
      const reqId = requestId ?? saved.id;

      if (pendingFiles.length > 0) {
        try {
          await uploadAttachments(reqId);
        } catch (err) {
          alert((err as Error).message);
          // Navigate anyway — request was saved, uploads can be retried from detail page
        }
      }

      router.push(`/requests/${reqId}`);
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  }

  const onDraft = handleSubmit((v) => handleAction(v, "draft"));
  const onSubmit = handleSubmit((v) => handleAction(v, "submit"));

  const busy = submitting || saving || !!uploadProgress;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Campaign Info ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Campaign Info</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Request Title *</Label>
            <Input
              id="title"
              placeholder="e.g. Q2 Product Launch — Meta Campaign"
              {...register("title")}
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <Label htmlFor="campaignName">Campaign Name *</Label>
            <Input id="campaignName" placeholder="e.g. Summer Sale 2025" {...register("campaignName")} />
            {errors.campaignName && (
              <p className="text-xs text-red-600 mt-1">{errors.campaignName.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="campaignObjective">Campaign Objective *</Label>
            <Textarea
              id="campaignObjective"
              placeholder="What is the goal of this campaign? (e.g. Drive sign-ups for the free trial, increase awareness of the new product line…)"
              rows={3}
              {...register("campaignObjective")}
            />
            {errors.campaignObjective && (
              <p className="text-xs text-red-600 mt-1">{errors.campaignObjective.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="targetAudience">Target Audience *</Label>
            <Textarea
              id="targetAudience"
              placeholder="Who are we targeting? (e.g. Working professionals aged 25–40 interested in productivity tools, located in Southeast Asia…)"
              rows={3}
              {...register("targetAudience")}
            />
            {errors.targetAudience && (
              <p className="text-xs text-red-600 mt-1">{errors.targetAudience.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="offerMessage">Offer / Key Message *</Label>
            <Textarea
              id="offerMessage"
              placeholder="What is the core offer or value proposition? (e.g. Get 3 months free when you upgrade before June 30…)"
              rows={2}
              {...register("offerMessage")}
            />
            {errors.offerMessage && (
              <p className="text-xs text-red-600 mt-1">{errors.offerMessage.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="date" {...register("deadline")} />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                {...register("priority")}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          {(priority === "HIGH" || priority === "URGENT") && (
            <div>
              <Label htmlFor="priorityReason">
                Priority Reason *{" "}
                <span className="text-xs font-normal text-gray-500">
                  (required for {priority.toLowerCase()} priority)
                </span>
              </Label>
              <Textarea
                id="priorityReason"
                placeholder="Explain why this request needs elevated priority…"
                rows={2}
                {...register("priorityReason")}
              />
              {errors.priorityReason && (
                <p className="text-xs text-red-600 mt-1">{errors.priorityReason.message}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Brand Template ─────────────────────────────────────────────────────── */}
      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Brand Template</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Selecting a template passes brand colors, layout, and guidelines to the AI.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedTemplateId(null)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  !selectedTemplateId
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                No template — use manual colors
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedTemplateId === t.id
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-8 rounded overflow-hidden shrink-0">
                      <div className="flex-1" style={{ backgroundColor: t.primaryColor }} />
                      <div className="flex-1" style={{ backgroundColor: t.secondaryColor }} />
                    </div>
                    <span className="truncate">{t.name}</span>
                    {t.isDefault && <span className="text-xs text-blue-500 shrink-0">default</span>}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Platforms ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Platforms *</h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => togglePlatform(value)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedPlatforms?.includes(value)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.platforms && (
            <p className="text-xs text-red-600 mt-2">{errors.platforms.message}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Banner Sizes ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Banner Sizes *</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {BANNER_SIZES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleSize(value)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedSizes?.includes(value)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="font-mono text-xs">{value}</span>
                <span className="text-gray-500 ml-1 text-xs">— {label.split("(")[0].trim()}</span>
              </button>
            ))}
          </div>
          {errors.sizes && (
            <p className="text-xs text-red-600 mt-2">{errors.sizes.message}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Ad Copy ────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Ad Copy</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="headline">Headline *</Label>
            <Input id="headline" placeholder="e.g. Save 40% This Weekend Only" {...register("headline")} />
            {errors.headline && (
              <p className="text-xs text-red-600 mt-1">{errors.headline.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="subheadline">Subheadline</Label>
            <Input
              id="subheadline"
              placeholder="e.g. Shop our biggest sale of the year"
              {...register("subheadline")}
            />
          </div>
          <div>
            <Label htmlFor="ctaText">CTA Button Text *</Label>
            <Input id="ctaText" placeholder="e.g. Shop Now" {...register("ctaText")} />
            {errors.ctaText && (
              <p className="text-xs text-red-600 mt-1">{errors.ctaText.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="ctaUrl">CTA URL</Label>
            <Input id="ctaUrl" type="url" placeholder="https://example.com/sale" {...register("ctaUrl")} />
          </div>
          <div>
            <Label htmlFor="copyVariants">Copy Variants</Label>
            <p className="text-xs text-gray-500 mb-1">
              Optional alternate headlines, subheadlines, or CTA text to test. One variant per line.
            </p>
            <Textarea
              id="copyVariants"
              placeholder={"Variant A: Unlock Your Free Trial\nVariant B: Start Saving Today"}
              rows={4}
              {...register("copyVariants")}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Brand ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Brand</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedTemplateId && (
            <div>
              <Label>Brand Colors (up to 5)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  placeholder="#FF0000"
                  className="font-mono w-36"
                />
                {/^#[0-9A-Fa-f]{6}$/.test(colorInput) && (
                  <div
                    className="h-9 w-9 rounded-lg border border-gray-200 shadow-sm shrink-0"
                    style={{ backgroundColor: colorInput }}
                  />
                )}
                <Button type="button" variant="outline" size="sm" onClick={addColor}>
                  Add
                </Button>
              </div>
              {selectedColors && selectedColors.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedColors.map((color) => (
                    <div key={color} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2 py-1">
                      <div
                        className="h-4 w-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-mono text-gray-700">{color}</span>
                      <button
                        type="button"
                        onClick={() => removeColor(color)}
                        className="text-gray-400 hover:text-gray-600 ml-0.5 leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="notes">Creative Notes</Label>
            <Textarea
              id="notes"
              placeholder="Brand tone, visual preferences, do's and don'ts, anything the AI or designer should know…"
              rows={3}
              {...register("notes")}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Attachments ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Reference Assets</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Brand guidelines, sample banners, competitor references. PDF, PNG, JPEG, WebP, SVG, ZIP. Max 20 MB each.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            Add Files
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.zip"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              {pendingFiles.map((pf, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm text-gray-800 truncate">{pf.file.name}</p>
                    <p className="text-xs text-gray-400">
                      {(pf.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={pf.category}
                        onChange={(e) => updateFileCategory(i, e.target.value as PendingFile["category"])}
                        className="text-xs rounded border border-gray-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {ATTACHMENT_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={pf.label}
                        onChange={(e) => updateFileLabel(i, e.target.value)}
                        placeholder="Label (optional)"
                        className="text-xs flex-1 rounded border border-gray-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-gray-400 hover:text-red-500 shrink-0 mt-1 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadProgress && (
            <p className="text-xs text-blue-600 font-medium">{uploadProgress}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Actions ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 pb-8">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          size="lg"
        >
          {submitting ? "Submitting…" : uploadProgress ?? "Submit Request"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDraft}
          disabled={busy}
          size="lg"
        >
          {saving ? "Saving…" : "Save Draft"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={busy}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
