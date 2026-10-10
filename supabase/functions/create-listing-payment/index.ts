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

    // 2. Validasi otorisasi user (G2: pemasang listing, owner tenant, has_permission 'post_listing', atau platform admin)
    let isPoster = false;
    if (listing.posted_by) {
      const { data: posterMember } = await userClient
        .from("tenant_members")
        .select("id")
        .eq("id", listing.posted_by)
        .eq("user_id", user.id)
        .maybeSingle();
      isPoster = Boolean(posterMember?.id);
    }

    const { data: isOwner } = await userClient.rpc("is_tenant_owner", { p_tenant_id: listing.tenant_id });
    const { data: canPost } = await userClient.rpc("has_permission", {
      p_tenant_id: listing.tenant_id,
      p_permission_key: "post_listing",
    });
    const { data: isPlatformAdmin } = await userClient.rpc("is_platform_admin");

    const isAuthorized = isPoster || Boolean(isOwner) || Boolean(canPost) || Boolean(isPlatformAdmin);

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Hanya pemasang listing, admin/owner tenant, atau platform admin yang berhak melakukan pembayaran listing" }),
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

    // 4. Tentukan harga dari listing_pricing dan MDR QRIS (0.75%)
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

    const basePrice = Number(pricingRows[0].price);
    const { fee: qrisFee, total: totalAmount } = calculateQrisFee(basePrice);

    // 5. Susun metadata awal untuk pesanan & MDR (G4)
    const initialMetadata = {
      listing_title: listing.title,
      listing_type: listing.type,
      tenant_id: listing.tenant_id,
      user_id: user.id,
      is_featured: Boolean(isFeatured),
      duration_days: Number(durationDays),
      base_amount: basePrice,
      qris_fee: qrisFee,
      qris_fee_amount: qrisFee,
      qris_total_amount: totalAmount,
    };

    // 6. Buat record transaksi pending di listing_payments
    // Kolom amount menyimpan harga dasar katalog; fee dan total disimpan di metadata (keputusan user)
    const { data: paymentRecord, error: payErr } = await adminClient
      .from("listing_payments")
      .insert({
        listing_id: listing.id,
        amount: basePrice,
        status: "pending",
        is_featured: Boolean(isFeatured),
        duration_days: Number(durationDays),
        metadata: initialMetadata,
      })
      .select("id")
      .single();

    if (payErr || !paymentRecord) {
      throw new Error("Gagal membuat catatan pembayaran listing: " + payErr?.message);
    }

    // 7. Integrasi Gateway SNAP DOKU Platform
    const partnerReferenceNo = `LST-${paymentRecord.id.replace(/-/g, "").substring(0, 18).toUpperCase()}`;
    let dokuRes;

    try {
      dokuRes = await createQris({
        partnerReferenceNo,
        amount: totalAmount,
      });
    } catch (dokuErr: any) {
      console.error("[DOKU SNAP] Create listing payment error:", dokuErr);
      await adminClient
        .from("listing_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", paymentRecord.id);

      return new Response(
        JSON.stringify({ error: "Payment gateway rejected request" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update listing_payments record dengan ref & gabungkan metadata awal (G4)
    await adminClient
      .from("listing_payments")
      .update({
        qris_ref: partnerReferenceNo,
        payment_url: null,
        metadata: {
          ...initialMetadata,
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
        baseAmount: basePrice,
        qrisFee,
        isFeatured: Boolean(isFeatured),
        durationDays: Number(durationDays),
        paymentUrl: null,
        qrContent: dokuRes.qrContent,
        qrisString: dokuRes.qrContent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[create-listing-payment] Unexpected internal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
