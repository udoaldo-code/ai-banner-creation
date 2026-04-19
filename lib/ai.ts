import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TemplateHints {
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  fontStack?: string | null;
  layoutStyle?: string | null;
  tone?: string | null;
  doNotes?: string | null;
  dontNotes?: string | null;
}

interface BannerGenerationInput {
  requestId: string;
  size: string; // "300x250"
  variant: number;
  headline: string;
  subheadline?: string | null;
  copyVariants?: string | null;
  ctaText: string;
  ctaUrl?: string | null;
  brandColors: string[];
  campaignName: string;
  campaignObjective?: string | null;
  targetAudience?: string | null;
  offerMessage?: string | null;
  platforms: string[];
  notes?: string | null;
  template?: TemplateHints | null;
}

interface BannerGenerationResult {
  htmlContent: string;
  aiPrompt: string;
  aiOutput: object;
}

const SIZE_GUIDANCE: Record<string, string> = {
  "300x250": "Medium Rectangle — standard IAB unit, headline + sub + CTA, balanced layout",
  "728x90": "Leaderboard — horizontal, short headline left-aligned, CTA on right",
  "160x600": "Wide Skyscraper — vertical scroll, stacked layout, large CTA at bottom",
  "320x50": "Mobile Banner — ultra compact, 1-line headline, small CTA",
  "300x600": "Half Page — premium unit, hero visual area + headline + sub + CTA",
  "970x250": "Billboard — wide panoramic, headline centre, CTA right",
  "1200x628": "Social Feed — full-bleed social ratio, headline overlay on image bg",
  "1080x1080": "Square Social — Instagram-style, centred layout",
  "1080x1920": "Story/Reel — full vertical, headline top-third, CTA bottom",
};

function buildPrompt(input: BannerGenerationInput): string {
  const [width, height] = input.size.split("x").map(Number);
  const sizeNote = SIZE_GUIDANCE[input.size] ?? `${width}x${height} custom size`;

  // Template overrides inline brandColors when available
  const tpl = input.template;
  const primaryColor = tpl?.primaryColor ?? input.brandColors[0] ?? "#1E40AF";
  const secondaryColor = tpl?.secondaryColor ?? input.brandColors[1] ?? "#FFFFFF";
  const accentColor = tpl?.accentColor ?? input.brandColors[2] ?? null;
  const fontStack = tpl?.fontStack ?? "system-ui, -apple-system, sans-serif";
  const layoutStyle = tpl?.layoutStyle ?? "balanced";
  const tone = tpl?.tone ?? null;

  const variantNote =
    input.variant === 1
      ? "primary variant — bold, high contrast"
      : input.variant === 2
        ? "secondary variant — softer, more refined"
        : "tertiary variant — minimal, clean";

  return `You are a professional digital advertising creative director. Generate a complete, self-contained HTML banner advertisement.

## Banner Specifications
- Size: ${input.size} (${width}px × ${height}px)
- Format guidance: ${sizeNote}
- Variant: #${input.variant} — ${variantNote}
- Campaign: ${input.campaignName}
- Platforms: ${input.platforms.join(", ")}

## Creative Brief
${input.campaignObjective ? `- Campaign Objective: ${input.campaignObjective}` : ""}
${input.targetAudience ? `- Target Audience: ${input.targetAudience}` : ""}
${input.offerMessage ? `- Core Offer / Key Message: ${input.offerMessage}` : ""}
- Headline: "${input.headline}"
${input.subheadline ? `- Subheadline: "${input.subheadline}"` : ""}
${input.copyVariants ? `- Copy Variants to consider:\n${input.copyVariants.split("\n").map((l) => `  ${l}`).join("\n")}` : ""}
- CTA Button Text: "${input.ctaText}"
${input.ctaUrl ? `- CTA URL: ${input.ctaUrl}` : ""}

## Brand Identity
- Primary color: ${primaryColor}
- Secondary color: ${secondaryColor}
${accentColor ? `- Accent color: ${accentColor}` : ""}
- Font stack: ${fontStack}
- Layout style: ${layoutStyle}
${tone ? `- Brand tone: ${tone}` : ""}
${tpl?.doNotes ? `\n### Brand Do's\n${tpl.doNotes}` : ""}
${tpl?.dontNotes ? `\n### Brand Don'ts\n${tpl.dontNotes}` : ""}
${input.notes ? `\n### Additional Creative Notes\n${input.notes}` : ""}

## Output Requirements
Return ONLY valid HTML — no markdown, no explanation, no code fences.
The HTML must:
1. Use a <div> root element with inline styles set to exactly ${width}px × ${height}px, overflow: hidden, position: relative
2. Use only inline CSS — no <style> block, no external stylesheets, no Google Fonts (use the specified font stack)
3. Be fully self-contained — all content must render correctly at the specified pixel dimensions
4. Apply the brand colors consistently for backgrounds, text, and CTAs
5. Place the CTA button prominently — high contrast against its background
6. Keep text within safe margins — minimum 8px padding on all sides
7. Use CSS flexbox or grid (inline) for layout alignment
8. The design must reflect the specified layout style and brand tone
9. Do NOT include <html>, <head>, or <body> tags
10. Do NOT include any JavaScript`;
}

export async function generateBannerHtml(
  input: BannerGenerationInput
): Promise<BannerGenerationResult> {
  const prompt = buildPrompt(input);

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in AI response");
  }

  // Strip any accidental markdown fences
  let html = textBlock.text.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
  }

  return {
    htmlContent: html,
    aiPrompt: prompt,
    aiOutput: { model: message.model, usage: message.usage, stopReason: message.stop_reason },
  };
}

export async function generateAllBannersForRequest(params: {
  requestId: string;
  sizes: string[];
  variants: number;
  headline: string;
  subheadline?: string | null;
  copyVariants?: string | null;
  ctaText: string;
  ctaUrl?: string | null;
  brandColors: string[];
  campaignName: string;
  campaignObjective?: string | null;
  targetAudience?: string | null;
  offerMessage?: string | null;
  platforms: string[];
  notes?: string | null;
  template?: TemplateHints | null;
}): Promise<{ size: string; variant: number; result: BannerGenerationResult | null; error?: string }[]> {
  const jobs: { size: string; variant: number }[] = [];

  for (const size of params.sizes) {
    for (let v = 1; v <= params.variants; v++) {
      jobs.push({ size, variant: v });
    }
  }

  const results = await Promise.allSettled(
    jobs.map(({ size, variant }) =>
      generateBannerHtml({
        requestId: params.requestId,
        size,
        variant,
        headline: params.headline,
        subheadline: params.subheadline,
        copyVariants: params.copyVariants,
        ctaText: params.ctaText,
        ctaUrl: params.ctaUrl,
        brandColors: params.brandColors,
        campaignName: params.campaignName,
        campaignObjective: params.campaignObjective,
        targetAudience: params.targetAudience,
        offerMessage: params.offerMessage,
        platforms: params.platforms,
        notes: params.notes,
        template: params.template,
      })
    )
  );

  return jobs.map(({ size, variant }, i) => {
    const result = results[i];
    if (result.status === "fulfilled") {
      return { size, variant, result: result.value };
    }
    return {
      size,
      variant,
      result: null,
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  });
}
