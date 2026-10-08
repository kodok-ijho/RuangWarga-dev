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

    // Client dengan service_role untuk eksekusi backend
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { listingId, isFeatured = false, durationDays = 30 } = body;

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: "Parameter listingId wajib diisi" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Ambil data listing
    const { data: listing, error: listErr } = await adminClient
      .from("public_listings")
      .select("id, tenant_id, posted_by, type, title, status, is_featured")
      .eq("id", listingId)
      .single();

    if (listErr || !listing) {
      return new Response(
        JSON.stringify({ error: "Listing tidak ditemukan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validasi otorisasi user (Pemilik listing, Admin Tenant, atau Platform Admin)
    const { data: isPlatAdmin } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: memberRow } = await adminClient
      .from("tenant_members")
      .select("id, role, status")
      .eq("tenant_id", listing.tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    const isOwner = memberRow && memberRow.id === listing.posted_by;
    const isTenantAdmin = memberRow && memberRow.role === "admin" && memberRow.status === "approved";
    const isAuthorized = Boolean(isPlatAdmin?.user_id) || isOwner || isTenantAdmin;

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Hanya pemilik listing atau admin tenant yang berhak melakukan transaksi pembayaran listing" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validasi status tenant (FR-26: read_only tidak dapat membuat/memperpanjang listing)
    const { data: subscription } = await adminClient
      .from("tenant_subscriptions")
      .select("status")
      .eq("tenant_id", listing.tenant_id)
      .maybeSingle();

    if (subscription && subscription.status === "read_only") {
      return new Response(
        JSON.stringify({ error: "Tenant sedang dalam status read_only. Pembayaran iklan dinonaktifkan." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Tentukan harga dari listing_pricing
    const { data: pricingRows, error: pricingErr } = await adminClient
      .from("listing_pricing")
      .select("id, price")
      .eq("listing_type", listing.type)
      .eq("is_featured", Boolean(isFeatured))
      .eq("duration_days", Number(durationDays));

    if (pricingErr || !pricingRows || pricingRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Konfigurasi tarif listing tidak ditemukan" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalPrice = Number(pricingRows[0].price);

    // 5. Buat record transaksi pending di listing_payments
    const { data: paymentRecord, error: payErr } = await adminClient
      .from("listing_payments")
      .insert({
        listing_id: listing.id,
        amount: finalPrice,
        status: "pending",
        is_featured: Boolean(isFeatured),
        duration_days: Number(durationDays),
        metadata: {
          listing_title: listing.title,
          listing_type: listing.type,
          tenant_id: listing.tenant_id,
          user_id: user.id,
          is_featured: Boolean(isFeatured),
          duration_days: Number(durationDays),
        },
      })
      .select("id")
      .single();

    if (payErr || !paymentRecord) {
      throw new Error("Gagal membuat catatan pembayaran listing: " + payErr?.message);
    }

    // 6. Integrasi Gateway Mayar
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
      paymentUrl = `/t/${listing.tenant_id}/listings?payRef=${gatewayRef}`;
    } else {
      const userPhone = user.user_metadata?.phone || user.phone || null;
      const mayarPayload: Record<string, any> = {
        name: user.user_metadata?.full_name || user.email || "Pemasang Iklan",
        email: user.email,
        amount: finalPrice,
        description: `Iklan RuangWarga: ${listing.title} (${isFeatured ? "Unggulan" : "Standar"}, ${durationDays} Hari)`,
        redirectUrl: `${req.headers.get("origin") || ""}/t/${listing.tenant_id}/listings?paymentId=${paymentRecord.id}`,
        metadata: {
          payment_id: paymentRecord.id,
          listing_id: listing.id,
          tenant_id: listing.tenant_id,
          type: "listing_payment",
        },
      };

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
          console.error("[Mayar API] Create listing payment HTTP error:", mayarRes.status, errText);
          await adminClient
            .from("listing_payments")
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
          console.error("[Mayar API] Create listing payment missing data:", mayarData);
          await adminClient
            .from("listing_payments")
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
          .from("listing_payments")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", paymentRecord.id);

        return new Response(
          JSON.stringify({ error: "Failed to connect to payment gateway" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const fallbackUrl = `/t/${listing.tenant_id}/listings?payRef=${gatewayRef}`;

    // Update listing_payments record dengan ref & url
    await adminClient
      .from("listing_payments")
      .update({
        qris_ref: gatewayRef,
        payment_url: paymentUrl || fallbackUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: paymentRecord.id,
        gatewayRef,
        amount: finalPrice,
        isFeatured: Boolean(isFeatured),
        durationDays: Number(durationDays),
        paymentUrl: paymentUrl || fallbackUrl,
        qrisString,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[create-listing-payment] Unexpected internal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
