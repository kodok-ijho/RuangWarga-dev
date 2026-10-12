/**
 * Klien Cloudflare R2 untuk Supabase Edge Functions (Deno / TypeScript).
 * Menggunakan aws4fetch (S3-compatible API).
 *
 * Ref: docs/handoff/STOR-1.md (STOR-1.2), STOR-1-requirement.md, STOR-1-plan.md
 */

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";


export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface HeadObjectResult {
  exists: boolean;
  metadata: Record<string, string>;
  contentType?: string;
}

/**
 * Membaca variabel environment R2.
 * Menolak jika salah satu konfigurasi tidak tersedia.
 * TIDAK mencetak nilai kredensial ke log maupun error.
 */
export function getR2Config(): R2Config {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Konfigurasi R2 belum lengkap");
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * Membuat instance klien AwsClient untuk operasi R2 S3-compatible.
 */
export function createR2Client(config?: R2Config): { client: AwsClient; config: R2Config } {
  const cfg = config || getR2Config();
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  return { client, config: cfg };
}

/**
 * Menyusun URL endpoint objek pada bucket R2.
 */
export function getObjectUrl(accountId: string, bucket: string, path: string): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedPath}`;
}

/**
 * Mengunggah file ke bucket R2 dengan Content-Type dan custom metadata.
 *
 * @param path - Canonical path object
 * @param bytes - Buffer data file
 * @param contentType - MIME type (mis. image/jpeg)
 * @param metadata - Key-value metadata (mis. { 'uploaded-by': user.id })
 */
export async function putObject(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const { client, config } = createR2Client();
  const url = getObjectUrl(config.accountId, config.bucket, path);

  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      headers[`x-amz-meta-${cleanKey}`] = String(value);
    }
  }

  const response = await client.fetch(url, {
    method: "PUT",
    headers,
    body: bytes,
  });

  if (!response.ok) {
    throw new Error(`Gagal menyimpan file ke R2: status ${response.status}`);
  }
}

/**
 * Memeriksa keberadaan objek dan mengambil metadata di R2 bucket.
 * Mengembalikan { exists: false, metadata: {} } jika objek 404 (tidak ditemukan).
 */
export async function headObject(path: string): Promise<HeadObjectResult> {
  const { client, config } = createR2Client();
  const url = getObjectUrl(config.accountId, config.bucket, path);

  const response = await client.fetch(url, {
    method: "HEAD",
  });

  if (response.status === 404) {
    return { exists: false, metadata: {} };
  }

  if (!response.ok) {
    throw new Error(`Gagal memeriksa status file di R2: status ${response.status}`);
  }

  const metadata: Record<string, string> = {};
  response.headers.forEach((value: string, headerKey: string) => {
    const lower = headerKey.toLowerCase();
    if (lower.startsWith("x-amz-meta-")) {
      metadata[lower.replace("x-amz-meta-", "")] = value;
    }
  });

  return {
    exists: true,
    metadata,
    contentType: response.headers.get("content-type") || undefined,
  };
}

/**
 * Menghasilkan Presigned GET URL untuk mengunduh/melihat objek secara privat.
 *
 * @param path - Canonical path object
 * @param expiresInSeconds - Masa berlaku URL dalam detik
 */
export async function presignGet(path: string, expiresInSeconds: number): Promise<string> {
  const { client, config } = createR2Client();
  const url = getObjectUrl(config.accountId, config.bucket, path);

  const expires = Math.max(1, Math.floor(expiresInSeconds));
  const request = new Request(`${url}?X-Amz-Expires=${expires}`, {
    method: "GET",
  });

  const signedRequest = await client.sign(request, {
    aws: { signQuery: true },
  });

  return signedRequest.url;
}
