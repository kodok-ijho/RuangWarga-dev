import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  MAX_FILE_BYTES,
  MAX_DOCUMENT_BYTES,
  ALLOWED_MIME,
  ALLOWED_IMAGE_MIME,
  ALLOWED_DOCUMENT_MIME,
  detectMime,
  isUuid,
  isValidPath,
  buildPaymentProofPath,
  buildExpenseReceiptPath,
  buildAnnouncementImagePath,
  buildProgramDocumentPath,
} from "../_shared/fileRules.ts";
import { putObject } from "../_shared/r2.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // 1. CORS Preflight & Method Check
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method tidak diizinkan. Gunakan POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // 2. Autentikasi Pengguna
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Header Authorization wajib disertakan." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sesi pengguna tidak valid atau telah kedaluwarsa." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Baca dan Validasi multipart/form-data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "Format request tidak valid. Gunakan multipart/form-data." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const kind = formData.get("kind");
    const tenantId = formData.get("tenantId");
    const billingItemId = formData.get("billingItemId");
    const expenseDate = formData.get("expenseDate");
    const programId = formData.get("programId");
    const file = formData.get("file");

    if (
      !kind ||
      (kind !== "payment_proof" &&
        kind !== "expense_receipt" &&
        kind !== "announcement_image" &&
        kind !== "program_document")
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Parameter kind harus bernilai 'payment_proof', 'expense_receipt', 'announcement_image', atau 'program_document'.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!tenantId || typeof tenantId !== "string" || !isUuid(tenantId)) {
      return new Response(
        JSON.stringify({ error: "Parameter tenantId wajib berupa UUID yang valid." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (kind === "payment_proof") {
      if (!billingItemId || typeof billingItemId !== "string" || !isUuid(billingItemId)) {
        return new Response(
          JSON.stringify({ error: "Parameter billingItemId wajib berupa UUID yang valid untuk bukti pembayaran." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (kind === "expense_receipt") {
      const dateRegex = /^[12][0-9]{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
      if (!expenseDate || typeof expenseDate !== "string" || !dateRegex.test(expenseDate)) {
        return new Response(
          JSON.stringify({ error: "Parameter expenseDate wajib dalam format YYYY-MM-DD untuk nota pengeluaran." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (kind === "program_document") {
      if (!programId || typeof programId !== "string" || !isUuid(programId)) {
        return new Response(
          JSON.stringify({ error: "Parameter programId wajib berupa UUID yang valid untuk dokumen acara." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "File wajib diunggah." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Hak Akses via Database RPC can_upload_tenant_file
    const { data: canUpload, error: rpcError } = await userClient.rpc("can_upload_tenant_file", {
      p_kind: kind,
      p_tenant_id: tenantId,
    });

    if (rpcError) {
      console.error("[storage-upload] RPC can_upload_tenant_file error:", rpcError.message);
      return new Response(
        JSON.stringify({ error: "Gagal menyimpan file." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (canUpload !== true) {
      return new Response(
        JSON.stringify({ error: "Anda tidak memiliki izin untuk mengunggah file pada tenant ini." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Validasi Ukuran & Deteksi Magic Bytes
    const maxBytes = kind === "program_document" ? MAX_DOCUMENT_BYTES : MAX_FILE_BYTES;
    if (file.size > maxBytes) {
      return new Response(
        JSON.stringify({
          error:
            kind === "program_document"
              ? "Ukuran file melebihi batas maksimal 10 MB."
              : "Ukuran file melebihi batas maksimal 5 MB.",
        }),
        {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const detectedMime = detectMime(bytes, file.name);

    if (kind === "program_document") {
      if (!detectedMime || !(ALLOWED_DOCUMENT_MIME as readonly string[]).includes(detectedMime)) {
        return new Response(
          JSON.stringify({
            error:
              "Format file tidak didukung. Dokumen acara hanya mendukung PDF, Word, Excel, PowerPoint, JPG, PNG, dan WebP.",
          }),
          {
            status: 415,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else if (kind === "announcement_image") {
      if (!detectedMime || !ALLOWED_IMAGE_MIME.includes(detectedMime as any)) {
        return new Response(
          JSON.stringify({ error: "Format file tidak didukung. Gambar pengumuman hanya mendukung JPEG, PNG, dan WebP." }),
          {
            status: 415,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      if (!detectedMime || !ALLOWED_MIME.includes(detectedMime as any)) {
        return new Response(
          JSON.stringify({ error: "Format file tidak didukung. Hanya JPEG, PNG, WebP, dan PDF yang diizinkan." }),
          {
            status: 415,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // 6. Susun Canonical Path di Server
    let path: string;
    try {
      if (kind === "payment_proof") {
        path = buildPaymentProofPath(
          tenantId,
          String(billingItemId),
          file.name,
          Date.now(),
          detectedMime
        );
      } else if (kind === "expense_receipt") {
        path = buildExpenseReceiptPath(
          tenantId,
          String(expenseDate),
          file.name,
          undefined,
          detectedMime
        );
      } else if (kind === "announcement_image") {
        const imageUuid = crypto.randomUUID();
        path = buildAnnouncementImagePath(
          tenantId,
          imageUuid,
          detectedMime
        );
      } else if (kind === "program_document") {
        path = buildProgramDocumentPath(
          tenantId,
          String(programId),
          crypto.randomUUID(),
          file.name,
          detectedMime
        );
      } else {
        throw new Error("Jenis file tidak didukung");
      }

      if (!isValidPath(kind, path)) {
        throw new Error("Struktur path tidak valid");
      }
    } catch (pathErr: any) {
      console.error("[storage-upload] Path construction error:", pathErr?.message || "invalid path");
      return new Response(
        JSON.stringify({ error: "Gagal menyusun path penyimpanan file." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Simpan Objek ke Cloudflare R2
    await putObject(path, bytes, detectedMime, {
      "uploaded-by": user.id,
    });

    // 8. Sukses: Kembalikan Path dan Metadata
    return new Response(
      JSON.stringify({
        path,
        contentType: detectedMime,
        size: bytes.byteLength,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[storage-upload] Unexpected internal error:", err?.message || "unknown");
    return new Response(
      JSON.stringify({ error: "Gagal menyimpan file." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
