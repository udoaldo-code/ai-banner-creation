"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BANNER_SIZES } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  supportedSizes: z.array(z.string()).default([]),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("")),
  fontStack: z.string().optional(),
  layoutStyle: z.enum(["bold", "minimal", "editorial", "balanced"]),
  industry: z.string().optional(),
  tone: z.enum(["professional", "playful", "luxury", "urgent", "friendly", ""]).optional(),
  doNotes: z.string().optional(),
  dontNotes: z.string().optional(),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface TemplateData {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  supportedSizes: string[];
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  fontStack?: string | null;
  layoutStyle: string;
  industry?: string | null;
  tone?: string | null;
  doNotes?: string | null;
  dontNotes?: string | null;
  isDefault: boolean;
}

interface TemplateFormProps {
  template?: TemplateData;
}

const LAYOUT_STYLES = ["balanced", "bold", "minimal", "editorial"] as const;
const TONES = ["professional", "playful", "luxury", "urgent", "friendly"] as const;
const CATEGORIES = ["product", "promo", "awareness", "seasonal", "evergreen"] as const;

export function TemplateForm({ template }: TemplateFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!template;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? "",
      category: template?.category ?? "",
      supportedSizes: template?.supportedSizes ?? [],
      primaryColor: template?.primaryColor ?? "#1E40AF",
      secondaryColor: template?.secondaryColor ?? "#FFFFFF",
      accentColor: template?.accentColor ?? "",
      fontStack: template?.fontStack ?? "",
      layoutStyle: (template?.layoutStyle as FormValues["layoutStyle"]) ?? "balanced",
      industry: template?.industry ?? "",
      tone: (template?.tone as FormValues["tone"]) ?? "",
      doNotes: template?.doNotes ?? "",
      dontNotes: template?.dontNotes ?? "",
      isDefault: template?.isDefault ?? false,
    },
  });

  const primaryColor = watch("primaryColor");
  const secondaryColor = watch("secondaryColor");
  const accentColor = watch("accentColor");
  const isDefault = watch("isDefault");
  const layoutStyle = watch("layoutStyle");
  const tone = watch("tone");
  const category = watch("category");
  const supportedSizes = watch("supportedSizes");

  function toggleSize(size: string) {
    const current = supportedSizes ?? [];
    setValue(
      "supportedSizes",
      current.includes(size) ? current.filter((s) => s !== size) : [...current, size]
    );
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/templates/${template!.id}` : "/api/templates";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to save template");
        return;
      }

      router.push("/templates");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      {/* Identity */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Template Identity</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name" required>Template Name</Label>
            <Input id="name" placeholder="e.g. Acme Corp — Primary Brand" {...register("name")} />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="Optional context about when to use this template…"
              {...register("description")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("category", category === c ? "" : c)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      category === c
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <input
                  id="isDefault"
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setValue("isDefault", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <Label htmlFor="isDefault" className="mb-0 cursor-pointer text-sm">
                  Set as default template
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supported Sizes */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Supported Sizes</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Leave all unchecked to allow any size. Tick specific sizes to signal where this template looks best.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {BANNER_SIZES.map((s) => {
              const checked = (supportedSizes ?? []).includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleSize(s.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    checked
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                      checked ? "bg-blue-500 border-blue-500" : "border-gray-300"
                    }`}
                  >
                    {checked && (
                      <svg className="h-2 w-2 text-white" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>
                    <span className="font-medium">{s.value}</span>
                    <span className="text-gray-400 ml-1">— {s.label.split("(")[0].trim()}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Brand Colors</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: "primaryColor" as const, label: "Primary", required: true },
              { key: "secondaryColor" as const, label: "Secondary", required: true },
              { key: "accentColor" as const, label: "Accent", required: false },
            ].map(({ key, label, required }) => (
              <div key={key}>
                <Label htmlFor={key} required={required}>{label}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id={key}
                    className="font-mono text-sm"
                    placeholder="#000000"
                    {...register(key)}
                  />
                  {watch(key) && /^#[0-9A-Fa-f]{6}$/.test(watch(key) ?? "") && (
                    <div
                      className="h-8 w-8 shrink-0 rounded-lg border border-gray-200"
                      style={{ backgroundColor: watch(key)! }}
                    />
                  )}
                </div>
                {errors[key] && (
                  <p className="text-xs text-red-600 mt-1">{errors[key]?.message}</p>
                )}
              </div>
            ))}
          </div>

          {/* Live preview strip */}
          <div className="mt-2 h-6 rounded-lg overflow-hidden flex">
            <div className="flex-1" style={{ backgroundColor: primaryColor || "#1E40AF" }} />
            <div className="flex-1" style={{ backgroundColor: secondaryColor || "#FFFFFF" }} />
            {accentColor && /^#[0-9A-Fa-f]{6}$/.test(accentColor) && (
              <div className="flex-1" style={{ backgroundColor: accentColor }} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Typography & Layout */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Typography & Layout</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="fontStack">Font Stack (CSS)</Label>
            <Input
              id="fontStack"
              className="font-mono text-sm"
              placeholder="Inter, system-ui, -apple-system, sans-serif"
              {...register("fontStack")}
            />
          </div>
          <div>
            <Label>Layout Style</Label>
            <div className="flex gap-2 mt-1">
              {LAYOUT_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setValue("layoutStyle", style)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    layoutStyle === style
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" placeholder="e.g. fintech, ecommerce, saas" {...register("industry")} />
            </div>
            <div>
              <Label>Brand Tone</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue("tone", tone === t ? "" : t)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      tone === t
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI guidance */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">AI Brand Guidelines</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            These notes are injected verbatim into the generation prompt.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="doNotes">Do&apos;s — brand rules to follow</Label>
            <Textarea
              id="doNotes"
              rows={3}
              placeholder="Always include the product benefit in the headline. Use rounded corners for CTA buttons…"
              {...register("doNotes")}
            />
          </div>
          <div>
            <Label htmlFor="dontNotes">Don&apos;ts — things to avoid</Label>
            <Textarea
              id="dontNotes"
              rows={3}
              placeholder="Never use red — it conflicts with our error states. Avoid stock photo clichés…"
              {...register("dontNotes")}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" loading={submitting} size="lg">
          {isEdit ? "Save Changes" : "Create Template"}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
