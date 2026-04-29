import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Max attachment size: 20 MB
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/zip",
];

// R2 uses "auto" in their docs but AWS SDK v3 rejects it for hostname/signing.
// When using a custom endpoint (R2), normalise "auto" → "us-east-1" (R2 ignores the value).
const resolvedRegion = (() => {
  const r = (process.env.S3_REGION ?? "us-east-1").trim();
  return r === "auto" || r === "" ? "us-east-1" : r;
})();

const s3 = new S3Client({
  region: resolvedRegion,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
});

const BUCKET = process.env.S3_BUCKET_NAME ?? "banner-generator-assets";

export async function uploadHtmlBanner(
  key: string,
  html: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(html, "utf-8"),
      ContentType: "text/html",
    })
  );
  return key;
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Storage key for a generated variant HTML file.
 * Path: banners/{requestId}/{runNumber}/{size}/variant-{variant}.html
 * runNumber is included so re-generation doesn't overwrite previous run artifacts.
 */
export function variantStorageKey(
  requestId: string,
  runNumber: number,
  size: string,
  variant: number
): string {
  return `banners/${requestId}/run-${runNumber}/${size}/variant-${variant}.html`;
}

/** @deprecated Use variantStorageKey — kept for backward compatibility */
export function bannerStorageKey(requestId: string, size: string, variant: number): string {
  return variantStorageKey(requestId, 1, size, variant);
}

export function attachmentStorageKey(requestId: string, filename: string): string {
  return `attachments/${requestId}/${filename}`;
}

/** @deprecated Use attachmentStorageKey */
export function guidelinesStorageKey(requestId: string, filename: string): string {
  return attachmentStorageKey(requestId, filename);
}

export function logoStorageKey(templateId: string, filename: string): string {
  return `templates/${templateId}/logo/${filename}`;
}

// Issue a presigned PUT URL so the browser can upload directly to S3.
// expiresIn is in seconds (default 5 minutes).
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}
