import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createQris, calculateQrisFee } from "../_shared/doku.ts";

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

    // Client terautentikasi untuk memverifikasi identitas pemanggil
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized user session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client dengan service_role untuk eksekusi query backend
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { tenantId, blocks10 = 0, blocks5 = 0, durationMonths = 12 } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "Parameter tenantId wajib diisi" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validasi hak akses user terhadap tenant (Owner, Admin, atau Platform Admin)
    const { data: isPlatAdmin } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: memberRow } = await adminClient
      .from("tenant_members")
      .select("role, status")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isAuthorized =
      Boolean(isPlatAdmin?.user_id) ||
      (memberRow && ["admin", "bendahara"].includes(memberRow.role));

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Hanya Admin atau Bendahara tenant yang berhak melakukan transaksi langganan" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Ambil data tenant & subscription aktif
    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants")
      .select("id, name, type")
      .eq("id", tenantId)
      .single();

    if (tenantErr || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant tidak ditemukan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: subscription, error: subErr } = await adminClient
      .from("tenant_subscriptions")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .single();

    if (subErr || !subscription) {
      return new Response(
        JSON.stringify({ error: "Subscription tenant tidak ditemukan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Ambil tarif resmi dari database (block_pricing & subscription_periods)
    const { data: pricingRows, error: pErr } = await adminClient
      .from("block_pricing")
      .select("id, block_size, price_per_block")
      .eq("tenant_type", tenant.type)
      .eq("is_active", true);

    if (pErr || !pricingRows || pricingRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Konfigurasi tarif untuk tipe tenant ini tidak tersedia" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const b10 = Math.max(0, parseInt(blocks10, 10) || 0);
    const b5 = Math.max(0, parseInt(blocks5, 10) || 0);
    const totalCapacity = (b10 * 10) + (b5 * 5);

    if (totalCapacity < 5) {
      return new Response(
        JSON.stringify({ error: "Kapasitas langganan minimal adalah 5 unit" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const price10Row = pricingRows.find((p) => p.block_size === 10);
    const price5Row = pricingRows.find((p) => p.block_size === 5);

    if (b10 > 0 && !price10Row) {
      return new Response(
        JSON.stringify({ error: "Konfigurasi tarif untuk blok 10 unit tidak ditemukan" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (b5 > 0 && !price5Row) {
      return new Response(
        JSON.stringify({ error: "Konfigurasi tarif untuk blok 5 unit tidak ditemukan" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const price10 = price10Row ? Number(price10Row.price_per_block) : 0;
    const price5 = price5Row ? Number(price5Row.price_per_block) : 0;

    const { data: periodRow, error: periodErr } = await adminClient
      .from("subscription_periods")
      .select("id, duration_months, discount_percent")
      .eq("duration_months", Number(durationMonths))
      .eq("is_active", true)
      .single();

    if (periodErr || !periodRow) {
      return new Response(
        JSON.stringify({ error: "Durasi periode yang dipilih tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Hitung nominal dasar dan MDR QRIS (0.7%)
    const monthlyBase = (b10 * price10) + (b5 * price5);
    const rawTotal = monthlyBase * periodRow.duration_months;
    const discountAmount = Math.round(rawTotal * (Number(periodRow.discount_percent) / 100));
    const baseAmount = rawTotal - discountAmount;
    const { fee: qrisFee, total: totalAmount } = calculateQrisFee(baseAmount);

    // 5. Simpan record pembayaran pending ke subscription_payments
    const { data: paymentRecord, error: payErr } = await adminClient
      .from("subscription_payments")
      .insert({
        subscription_id: subscription.id,
        period_id: periodRow.id,
        amount: totalAmount,
        status: "pending",
        payment_method: "doku_qris",
        metadata: {
          blocks10: b10,
          blocks5: b5,
          total_capacity: totalCapacity,
          duration_months: periodRow.duration_months,
          discount_percent: periodRow.discount_percent,
          tenant_name: tenant.name,
          tenant_type: tenant.type,
          user_id: user.id,
          base_amount: baseAmount,
          qris_fee: qrisFee,
        },
      })
      .select("id")
      .single();

    if (payErr || !paymentRecord) {
      throw new Error("Gagal membuat catatan pembayaran: " + payErr?.message);
    }

    // 6. Simpan / perbarui blok yang dibeli di tenant_subscription_blocks
    await adminClient
      .from("tenant_subscription_blocks")
      .delete()
      .eq("subscription_id", subscription.id);

    const blocksToInsert = [];
    if (b10 > 0 && price10Row) {
      blocksToInsert.push({
        subscription_id: subscription.id,
        pricing_id: price10Row.id,
        block_count: b10,
      });
    }
    if (b5 > 0 && price5Row) {
      blocksToInsert.push({
        subscription_id: subscription.id,
        pricing_id: price5Row.id,
        block_count: b5,
      });
    }

    if (blocksToInsert.length > 0) {
      await adminClient.from("tenant_subscription_blocks").insert(blocksToInsert);
    }

    // 7. Integrasi Gateway SNAP DOKU Platform
    const partnerReferenceNo = `SUB-${paymentRecord.id.replace(/-/g, "").substring(0, 18).toUpperCase()}`;
    let dokuRes;

    try {
      dokuRes = await createQris({
        partnerReferenceNo,
        amount: totalAmount,
      });
    } catch (dokuErr: any) {
      console.error("[DOKU SNAP] Create subscription payment error:", dokuErr);
      await adminClient
        .from("subscription_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", paymentRecord.id);

      return new Response(
        JSON.stringify({ error: "Payment gateway rejected request" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update payment record dengan ref & metadata
    await adminClient
      .from("subscription_payments")
      .update({
        payment_gateway_ref: partnerReferenceNo,
        payment_url: null,
        metadata: {
          blocks10: b10,
          blocks5: b5,
          total_capacity: totalCapacity,
          duration_months: periodRow.duration_months,
          discount_percent: periodRow.discount_percent,
          tenant_name: tenant.name,
          tenant_type: tenant.type,
          user_id: user.id,
          base_amount: baseAmount,
          qris_fee: qrisFee,
          doku_reference_no: dokuRes.referenceNo,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: paymentRecord.id,
        gatewayRef: partnerReferenceNo,
        amount: totalAmount,
        baseAmount,
        qrisFee,
        totalCapacity,
        durationMonths: periodRow.duration_months,
        paymentUrl: null,
        qrContent: dokuRes.qrContent,
        qrisString: dokuRes.qrContent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[create-subscription-payment] Unexpected internal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
