import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { isValidPath, clampExpiresIn } from "../_shared/fileRules.ts";
import { headObject, presignGet } from "../_shared/r2.ts";

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

    // 3. Baca dan Validasi Body JSON
    let body: any;
    try {
      body = await req.json();
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "Format request body tidak valid. Gunakan JSON." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ error: "Request body harus berupa JSON object." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { kind, path, expiresIn } = body;

    if (
      kind !== "payment_proof" &&
      kind !== "expense_receipt" &&
      kind !== "announcement_image" &&
      kind !== "program_document"
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

    if (!path || typeof path !== "string" || !isValidPath(kind, path)) {
      return new Response(
        JSON.stringify({ error: "Path tidak valid untuk jenis file yang diminta." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let finalExpiresIn: number;
    try {
      finalExpiresIn = clampExpiresIn(expiresIn);
    } catch (_err) {
      return new Response(
        JSON.stringify({ error: "Parameter expiresIn harus berupa angka jika disertakan." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Hak Akses via Database RPC can_read_tenant_file
    const { data: canRead, error: rpcError } = await userClient.rpc("can_read_tenant_file", {
      p_kind: kind,
      p_path: path,
    });

    if (rpcError) {
      console.error("[storage-sign-url] RPC can_read_tenant_file error:", rpcError.message);
      return new Response(
        JSON.stringify({ error: "Gagal membuat tautan file." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Evaluasi Izin dan Keberadaan Objek
    if (canRead === true) {
      const head = await headObject(path);
      if (!head.exists) {
        return new Response(
          JSON.stringify({ error: "File tidak ditemukan." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      if (
        kind === "expense_receipt" ||
        kind === "announcement_image" ||
        kind === "program_document"
      ) {
        return new Response(
          JSON.stringify({ error: "Anda tidak memiliki izin untuk melihat file ini." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // kind === "payment_proof": file tidak ada dijawab 403 agar keberadaan file tidak bocor
      const head = await headObject(path);
      if (!head.exists) {
        return new Response(
          JSON.stringify({ error: "Anda tidak memiliki izin untuk melihat file ini." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (head.metadata["uploaded-by"] !== user.id) {
        return new Response(
          JSON.stringify({ error: "Anda tidak memiliki izin untuk melihat file ini." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // 6. Buat Presigned URL untuk Akses Aman
    const url = await presignGet(path, finalExpiresIn);

    return new Response(
      JSON.stringify({
        url,
        expiresIn: finalExpiresIn,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[storage-sign-url] Unexpected internal error:", err?.message || "unknown");
    return new Response(
      JSON.stringify({ error: "Gagal membuat tautan file." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
