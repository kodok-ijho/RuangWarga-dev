/**
 * Modul SNAP DOKU bersama untuk Supabase Edge Functions (Deno / TypeScript).
 * Menggunakan Web Crypto API (crypto.subtle).
 * 
 * Hanya digunakan untuk pembayaran platform (langganan tenant & iklan listing).
 * Menggunakan kredensial DOKU_PLATFORM_* murni.
 */

export interface DokuConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  terminalId: string;
  postalCode: string;
  privateKey: string;
  channelId: string;
  webhookSecret: string;
}

export interface QrisGenerateParams {
  partnerReferenceNo: string;
  amount: number;
  requestId?: string;
}

export interface QrisGenerateResult {
  referenceNo: string;
  qrContent: string;
  raw: any;
}

export interface QrisQueryParams {
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  serviceCode?: string;
}

export interface QrisQueryResult {
  transactionStatus: string;
  raw: any;
}

/**
 * Membaca konfigurasi DOKU platform dari environment variables.
 * Melempar error fail-closed jika ada konfigurasi wajib yang hilang.
 */
export function readDokuConfig(): DokuConfig {
  const baseUrl = Deno.env.get("DOKU_PLATFORM_BASE_URL") || "https://api.doku.com";
  const clientId = Deno.env.get("DOKU_PLATFORM_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("DOKU_PLATFORM_CLIENT_SECRET") || "";
  const merchantId = Deno.env.get("DOKU_PLATFORM_MERCHANT_ID") || "";
  const terminalId = Deno.env.get("DOKU_PLATFORM_TERMINAL_ID") || "";
  const postalCode = Deno.env.get("DOKU_PLATFORM_POSTAL_CODE") || "";
  const privateKey = Deno.env.get("DOKU_PLATFORM_PRIVATE_KEY") || "";
  const channelId = Deno.env.get("DOKU_PLATFORM_CHANNEL_ID") || "H2H";
  const webhookSecret = Deno.env.get("DOKU_PLATFORM_WEBHOOK_SECRET") || "";

  const missing: string[] = [];
  if (!clientId) missing.push("DOKU_PLATFORM_CLIENT_ID");
  if (!clientSecret) missing.push("DOKU_PLATFORM_CLIENT_SECRET");
  if (!merchantId) missing.push("DOKU_PLATFORM_MERCHANT_ID");
  if (!terminalId) missing.push("DOKU_PLATFORM_TERMINAL_ID");
  if (!postalCode) missing.push("DOKU_PLATFORM_POSTAL_CODE");
  if (!privateKey) missing.push("DOKU_PLATFORM_PRIVATE_KEY");
  if (!webhookSecret) missing.push("DOKU_PLATFORM_WEBHOOK_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Konfigurasi DOKU Platform belum lengkap. Variabel env wajib yang hilang: ${missing.join(", ")}`
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    merchantId,
    terminalId,
    postalCode,
    privateKey,
    channelId,
    webhookSecret,
  };
}

/**
 * Format timestamp SNAP DOKU tanpa milidetik: YYYY-MM-DDTHH:mm:ssZ
 */
export function dokuTimestamp(): string {
  return new Date().toISOString().split(".")[0] + "Z";
}

/**
 * Konversi string Base64 ke ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Konversi ArrayBuffer ke string Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Menandatangani data string dengan RSA-SHA256 (RSASSA-PKCS1-v1_5) menggunakan Web Crypto.
 * Hanya menerima format PKCS#8.
 */
export async function signRsaSha256(data: string, pemPrivateKey: string): Promise<string> {
  const normalizedKey = pemPrivateKey.replace(/\\n/g, "\n").trim();

  if (normalizedKey.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error(
      "Format private key DOKU tidak didukung (PKCS#1). Web Crypto hanya mendukung PKCS#8. " +
      "Konversikan private key Anda ke format PKCS#8 terlebih dahulu dengan perintah: " +
      "openssl pkcs8 -topk8 -nocrypt -in <private.pem> -out <private_pkcs8.pem>"
    );
  }

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const startIdx = normalizedKey.indexOf(pemHeader);
  const endIdx = normalizedKey.indexOf(pemFooter);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      "Format private key DOKU tidak valid. Kunci harus memiliki header '-----BEGIN PRIVATE KEY-----' dan footer '-----END PRIVATE KEY-----'."
    );
  }

  const base64Body = normalizedKey
    .substring(startIdx + pemHeader.length, endIdx)
    .replace(/\s+/g, "");

  const binaryKey = base64ToArrayBuffer(base64Body);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(data)
  );

  return arrayBufferToBase64(signatureBuffer);
}

/**
 * Menghasilkan HMAC-SHA512 Base64 menggunakan Web Crypto.
 */
export async function hmacSha512Base64(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-512",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return arrayBufferToBase64(signature);
}

/**
 * Menghasilkan hash SHA-256 dalam bentuk lowercase hex.
 */
export async function sha256HexLower(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
}

/**
 * Tarif MDR QRIS resmi platform (0,75%).
 * Biaya dibebankan kepada tenant / pembayar.
 */
export const QRIS_FEE_RATE = 0.0075;

/**
 * Menghitung MDR QRIS 0,75% (dibulatkan ke atas / Math.ceil).
 */
export function calculateQrisFee(baseAmount: number): { fee: number; total: number } {
  const validBase = Math.max(0, Number(baseAmount) || 0);
  const fee = Math.ceil(validBase * QRIS_FEE_RATE);
  return { fee, total: validBase + fee };
}

/**
 * Perbandingan string konstan untuk mencegah timing attacks pada token webhook.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// In-memory cache token B2B
let cachedTokenState: { token: string; expiresAt: number } | null = null;

/**
 * Memperoleh token akses B2B SNAP DOKU.
 * Menggunakan cache in-memory hingga mendekati waktu kedaluwarsa.
 */
export async function getB2BToken(cfg?: DokuConfig): Promise<string> {
  const config = cfg || readDokuConfig();
  const now = Date.now();

  // Gunakan cache jika masih berlaku (margin safety 60 detik)
  if (cachedTokenState && now < cachedTokenState.expiresAt - 60000) {
    return cachedTokenState.token;
  }

  const ts = dokuTimestamp();
  const stringToSign = `${config.clientId}|${ts}`;
  const signature = await signRsaSha256(stringToSign, config.privateKey);

  const response = await fetch(`${config.baseUrl}/authorization/v1/access-token/b2b`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CLIENT-KEY": config.clientId,
      "X-TIMESTAMP": ts,
      "X-SIGNATURE": signature,
    },
    body: JSON.stringify({ grantType: "client_credentials" }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Jangan pernah mencetak privateKey atau secret ke log
    console.error("[DOKU SNAP] Failed to get B2B token, HTTP status:", response.status, errorText);
    throw new Error(`Gagal memperoleh B2B token dari DOKU: status ${response.status}`);
  }

  const data = await response.json();
  const accessToken = data.accessToken;
  const expiresIn = Number(data.expiresIn) || 900;

  if (!accessToken) {
    throw new Error("Respons B2B token DOKU tidak menyertakan accessToken");
  }

  cachedTokenState = {
    token: accessToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

/**
 * Membuat transaksi QRIS MPM SNAP DOKU.
 */
export async function createQris(
  params: QrisGenerateParams,
  cfg?: DokuConfig
): Promise<QrisGenerateResult> {
  const config = cfg || readDokuConfig();
  const basePath = "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate";

  const payload = {
    partnerReferenceNo: params.partnerReferenceNo,
    amount: {
      value: `${params.amount}.00`,
      currency: "IDR",
    },
    merchantId: config.merchantId,
    terminalId: config.terminalId,
    additionalInfo: {
      postalCode: config.postalCode,
      feeType: "1",
    },
  };

  // Minified JSON wajib persis sama saat hashing
  const bodyString = JSON.stringify(payload);
  const bodyHash = await sha256HexLower(bodyString);
  const ts = dokuTimestamp();
  const token = await getB2BToken(config);

  const stringToSign = `POST:${basePath}:${token}:${bodyHash}:${ts}`;
  const signature = await hmacSha512Base64(stringToSign, config.clientSecret);
  const requestId = params.requestId || `RW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(`${config.baseUrl}${basePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PARTNER-ID": config.clientId,
      "X-EXTERNAL-ID": requestId,
      "X-TIMESTAMP": ts,
      "X-SIGNATURE": signature,
      "CHANNEL-ID": config.channelId,
    },
    body: bodyString,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[DOKU SNAP] QR MPM Generate HTTP error:", response.status, errText);
    throw new Error(`DOKU menolak pembuatan QRIS: status ${response.status}`);
  }

  const resData = await response.json();
  if (resData.responseCode !== "2004700" || !resData.qrContent) {
    console.error("[DOKU SNAP] QR MPM Generate response invalid:", resData);
    throw new Error(
      `Respons DOKU gagal: ${resData.responseMessage || resData.responseCode || "qrContent tidak ada"}`
    );
  }

  return {
    referenceNo: resData.referenceNo || params.partnerReferenceNo,
    qrContent: resData.qrContent,
    raw: resData,
  };
}

/**
 * Pengecekan status transaksi QRIS MPM SNAP DOKU (Inquiry).
 */
export async function queryQrisStatus(
  params: QrisQueryParams,
  cfg?: DokuConfig
): Promise<QrisQueryResult> {
  const config = cfg || readDokuConfig();
  const basePath = "/snap-adapter/b2b/v1.0/qr/qr-mpm-query";

  const payload: Record<string, any> = {
    serviceCode: params.serviceCode || "47",
    merchantId: config.merchantId,
    terminalId: config.terminalId,
  };

  if (params.originalPartnerReferenceNo) {
    payload.originalPartnerReferenceNo = params.originalPartnerReferenceNo;
  }
  if (params.originalReferenceNo) {
    payload.originalReferenceNo = params.originalReferenceNo;
  }

  const bodyString = JSON.stringify(payload);
  const bodyHash = await sha256HexLower(bodyString);
  const ts = dokuTimestamp();
  const token = await getB2BToken(config);

  const stringToSign = `POST:${basePath}:${token}:${bodyHash}:${ts}`;
  const signature = await hmacSha512Base64(stringToSign, config.clientSecret);
  const requestId = `RW-QRY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(`${config.baseUrl}${basePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PARTNER-ID": config.clientId,
      "X-EXTERNAL-ID": requestId,
      "X-TIMESTAMP": ts,
      "X-SIGNATURE": signature,
      "CHANNEL-ID": config.channelId,
    },
    body: bodyString,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[DOKU SNAP] QR MPM Query HTTP error:", response.status, errText);
    throw new Error(`DOKU menolak pengecekan status QRIS: status ${response.status}`);
  }

  const resData = await response.json();
  const status =
    resData.latestTransactionStatus ||
    resData.transactionStatus ||
    resData.status ||
    "UNKNOWN";

  return {
    transactionStatus: status,
    raw: resData,
  };
}
