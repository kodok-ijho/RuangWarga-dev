import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { queryQrisStatus, timingSafeEqual, isQrisPaid } from "../_shared/doku.ts";

// URL notifikasi yang didaftarkan di dashboard DOKU:
// https://<project>.supabase.co/functions/v1/verify-listing-payment?token=<secret>

serve(async (req) => {
  // Webhook adalah endpoint server-to-server: tolak selain POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const webhookSecret = Deno.env.get("DOKU_PLATFORM_WEBHOOK_SECRET");

    // Fail-closed: jika secret belum dikonfigurasi, tolak request demi keamanan
    if (!webhookSecret) {
      console.error("[verify-listing-payment] DOKU_PLATFORM_WEBHOOK_SECRET is not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Auth via query parameter token URL notifikasi (G5)
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!token || !timingSafeEqual(token, webhookSecret)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or missing webhook token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const partnerRef = String(
      payload?.originalPartnerReferenceNo ||
      payload?.partnerReferenceNo ||
      payload?.originalReferenceNo ||
      payload?.referenceNo ||
      payload?.orderId ||
      ""
    ).trim();

    if (!partnerRef) {
      return new Response(
        JSON.stringify({ error: "Missing transaction reference in webhook payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Cari payment record di listing_payments lewat qris_ref (select metadata disertakan - G4)
    const { data: foundPayment, error: findError } = await adminClient
      .from("listing_payments")
      .select("id, amount, status, metadata, qris_ref")
      .eq("qris_ref", partnerRef)
      .maybeSingle();

    if (findError || !foundPayment) {
      console.error("[verify-listing-payment] Record tidak ditemukan untuk referensi:", partnerRef);
      return new Response(
        JSON.stringify({ error: "Record pembayaran listing tidak ditemukan untuk referensi ini" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Idempotency: jika sudah paid, balas sukses tanpa eksekusi ulang
    if (foundPayment.status === "paid") {
      return new Response(
        JSON.stringify({ success: true, message: "Payment already settled" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Anti-Spoofing: Verifikasi status langsung ke API DOKU (queryQrisStatus)
    let qrisStatusRes;
    try {
      qrisStatusRes = await queryQrisStatus({
        originalPartnerReferenceNo: partnerRef,
        originalReferenceNo: payload?.originalReferenceNo || payload?.referenceNo,
      });
    } catch (inqErr: any) {
      console.error("[verify-listing-payment] queryQrisStatus error:", inqErr);
      return new Response(
        JSON.stringify({ error: "Failed to verify transaction with payment gateway" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Evaluasi status lunas murni: responseCode '200...' dan latestTransactionStatus '00' (G6)
    if (!isQrisPaid(qrisStatusRes.raw)) {
      console.warn(`[verify-listing-payment] Transaction ${partnerRef} is not settled:`, qrisStatusRes.raw);
      return new Response(
        JSON.stringify({ message: "Ignored: transaction is not settled" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Validasi nominal pembayaran dari respons query gateway DOKU (G4)
    const rawAmountVal = qrisStatusRes.raw?.amount?.value;
    if (rawAmountVal === undefined || rawAmountVal === null || rawAmountVal === "") {
      console.error("[verify-listing-payment] DOKU query response missing amount.value:", qrisStatusRes.raw);
      return new Response(
        JSON.stringify({ error: "DOKU query response missing amount.value" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const incomingAmount = Math.round(Number(rawAmountVal));
    const feeAmount = Number(foundPayment.metadata?.qris_fee ?? foundPayment.metadata?.qris_fee_amount ?? 0);
    const expectedTotal = Number(foundPayment.amount) + feeAmount;

    if (isNaN(incomingAmount) || incomingAmount <= 0 || incomingAmount !== expectedTotal) {
      console.error(
        `[verify-listing-payment] Amount mismatch: expected ${expectedTotal}, got ${incomingAmount}`
      );
      return new Response(
        JSON.stringify({ error: "Payment amount mismatch" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Panggil database function SECURITY DEFINER: activate_listing_payment
    const { data: result, error: rpcError } = await adminClient.rpc(
      "activate_listing_payment",
      {
        p_payment_id: foundPayment.id,
        p_gateway_ref: partnerRef,
      }
    );

    if (rpcError) {
      console.error("[verify-listing-payment] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: "Failed to activate listing payment" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (result?.success !== true) {
      console.error("[verify-listing-payment] Activation rejected by RPC:", result);
      return new Response(
        JSON.stringify({ error: result?.error || result?.message || "Activation rejected" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Pembayaran iklan berhasil diverifikasi dan masa tayang listing telah aktif",
        listingId: result?.listing_id,
        expiresAt: result?.expires_at,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[verify-listing-payment] Unexpected webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal webhook processing error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
