import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: { period?: string; tenantId?: string; tenant_id?: string } = {};
    if (req.method === "POST") {
      try {
        payload = await req.json();
      } catch {
        payload = {};
      }
    } else {
      const url = new URL(req.url);
      payload = {
        period: url.searchParams.get("period") || undefined,
        tenantId: url.searchParams.get("tenantId") || url.searchParams.get("tenant_id") || undefined,
      };
    }

    const tenantId = payload.tenantId || payload.tenant_id || null;
    const period = payload.period || new Date().toISOString().slice(0, 7);

    if (period && !/^\d{4}-\d{2}$/.test(period)) {
      return new Response(
        JSON.stringify({ error: "Format parameter period harus YYYY-MM" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Periksa apakah panggilan menggunakan service role key langsung
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = token === supabaseServiceKey;

    let adminClient;
    if (isServiceRole) {
      adminClient = createClient(supabaseUrl, supabaseServiceKey);
    } else {
      // Validasi sesi pengguna
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser(token);

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized caller" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      adminClient = createClient(supabaseUrl, supabaseServiceKey);

      // Cek apakah platform admin
      const { data: isPlatAdmin } = await adminClient
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!isPlatAdmin) {
        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "Tenant ID wajib ditentukan untuk pengurus/admin tenant" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Cek apakah admin/pengurus tenant
        const { data: member } = await adminClient
          .from("tenant_members")
          .select("role, status")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .eq("status", "approved")
          .in("role", ["admin", "bendahara", "pengurus"])
          .maybeSingle();

        if (!member) {
          return new Response(
            JSON.stringify({ error: "Akses ditolak: Hanya admin atau pengurus tenant yang berhak" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Jalankan RPC auto_generate_kos_billing
    const { data: result, error: rpcError } = await adminClient.rpc(
      "auto_generate_kos_billing",
      {
        p_period: period,
        p_tenant_id: tenantId,
      }
    );

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
