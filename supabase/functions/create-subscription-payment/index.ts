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

    // 4. Hitung nominal final
    const monthlyBase = (b10 * price10) + (b5 * price5);
    const rawTotal = monthlyBase * periodRow.duration_months;
    const discountAmount = Math.round(rawTotal * (Number(periodRow.discount_percent) / 100));
    const finalAmount = rawTotal - discountAmount;

    // 5. Simpan record pembayaran pending ke subscription_payments
    const { data: paymentRecord, error: payErr } = await adminClient
      .from("subscription_payments")
      .insert({
        subscription_id: subscription.id,
        period_id: periodRow.id,
        amount: finalAmount,
        status: "pending",
        payment_method: "mayar_qris",
        metadata: {
          blocks10: b10,
          blocks5: b5,
          total_capacity: totalCapacity,
          duration_months: periodRow.duration_months,
          discount_percent: periodRow.discount_percent,
          tenant_name: tenant.name,
          tenant_type: tenant.type,
          user_id: user.id,
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

    // 7. Integrasi Gateway Mayar
    const mayarApiKey = Deno.env.get("MAYAR_API_KEY");
    const allowSimulated = Deno.env.get("ALLOW_SIMULATED_PAYMENTS") === "true";
    let gatewayRef = "";
    let paymentUrl = "";
    let qrisString = "";

    if (!mayarApiKey) {
      if (!allowSimulated) {
        return new Response(
          JSON.stringify({ error: "Payment gateway not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      gatewayRef = `MYR-SIM-${paymentRecord.id.substring(0, 8).toUpperCase()}`;
      paymentUrl = `/account/subscription/qris?ref=${gatewayRef}`;
    } else {
      const userPhone = user.user_metadata?.phone || user.phone || null;
      const mayarPayload: Record<string, any> = {
        name: user.user_metadata?.full_name || user.email || "Tenant Admin",
        email: user.email,
        amount: finalAmount,
        description: `Langganan RuangWarga: ${tenant.name} (${periodRow.duration_months} Bulan, ${totalCapacity} Unit)`,
        redirectUrl: `${req.headers.get("origin") || ""}/account/subscription/status?paymentId=${paymentRecord.id}`,
        metadata: {
          payment_id: paymentRecord.id,
          tenant_id: tenant.id,
        },
      };

      // Hanya kirim nomor telepon jika user benar-benar memilikinya (jangan nomor palsu)
      if (userPhone) {
        mayarPayload.mobile = userPhone;
      }

      try {
        const mayarRes = await fetch("https://api.mayar.id/hl/v1/payment/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mayarApiKey}`,
          },
          body: JSON.stringify(mayarPayload),
        });

        if (!mayarRes.ok) {
          const errText = await mayarRes.text();
          // eslint-disable-next-line no-console
          console.error("[Mayar API] Create payment HTTP error:", mayarRes.status, errText);
          await adminClient
            .from("subscription_payments")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", paymentRecord.id);

          return new Response(
            JSON.stringify({ error: "Payment gateway rejected request" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const mayarData = await mayarRes.json();
        if (!mayarData?.data) {
          // eslint-disable-next-line no-console
          console.error("[Mayar API] Create payment response missing data:", mayarData);
          await adminClient
            .from("subscription_payments")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", paymentRecord.id);

          return new Response(
            JSON.stringify({ error: "Invalid payment response from provider" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        gatewayRef = mayarData.data.id || `MYR-${paymentRecord.id.substring(0, 8).toUpperCase()}`;
        paymentUrl = mayarData.data.link || "";
        qrisString = mayarData.data.qrCodeString || "";
      } catch (fetchErr: any) {
        // eslint-disable-next-line no-console
        console.error("[Mayar API] Request failed with network/runtime error:", fetchErr);
        await adminClient
          .from("subscription_payments")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", paymentRecord.id);

        return new Response(
          JSON.stringify({ error: "Failed to connect to payment gateway" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update payment record dengan ref & url
    await adminClient
      .from("subscription_payments")
      .update({
        payment_gateway_ref: gatewayRef,
        payment_url: paymentUrl || `/account/subscription/qris?ref=${gatewayRef}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: paymentRecord.id,
        gatewayRef,
        amount: finalAmount,
        totalCapacity,
        durationMonths: periodRow.duration_months,
        paymentUrl: paymentUrl || `/account/subscription/qris?ref=${gatewayRef}`,
        qrisString,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[create-subscription-payment] Unexpected internal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
