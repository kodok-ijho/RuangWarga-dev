import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Daftar event & status sukses dari Mayar webhook gateway (dapat diperbarui sesuai webhook doc)
const SUCCESS_EVENTS = [
  "payment.received",
  "payment.settled",
  "payment.success",
  "payment_received",
  "payment_settled",
  "payment_success",
];
const SUCCESS_STATUSES = ["paid", "settled", "success", "SUCCESS"];

/**
 * Constant-time string comparison untuk menghindari timing attacks pada token webhook
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req) => {
  // Webhook adalah endpoint server-to-server: tolak selain POST (tanpa CORS wildcard)
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const webhookSecret = Deno.env.get("MAYAR_WEBHOOK_SECRET");

    // Fail-closed: jika secret belum dikonfigurasi, tolak request demi keamanan
    if (!webhookSecret) {
      // eslint-disable-next-line no-console
      console.error("[verify-subscription-payment] MAYAR_WEBHOOK_SECRET is not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const incomingToken =
      req.headers.get("x-mayar-token") ||
      req.headers.get("x-mayar-signature") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!incomingToken || !timingSafeEqual(incomingToken, webhookSecret)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or missing webhook token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const event = String(payload?.event || payload?.type || "").trim();
    const data = payload?.data || payload;
    const incomingStatus = String(data?.status || "").trim();

    // Verifikasi event dan status sukses
    const isSuccessEvent = SUCCESS_EVENTS.some((e) => e.toLowerCase() === event.toLowerCase());
    const isSuccessStatus = SUCCESS_STATUSES.some((s) => s.toLowerCase() === incomingStatus.toLowerCase());

    if (!isSuccessEvent && !isSuccessStatus) {
      // Abaikan event non-sukses tanpa error agar gateway tidak terus mencoba ulang
      return new Response(
        JSON.stringify({ message: "Ignored: event/status is not a successful payment" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ambil identifier pembayaran
    const gatewayRef = data?.id || data?.payment_id || data?.payment_gateway_ref;
    const customMetadata = data?.metadata || {};
    const paymentId = customMetadata.payment_id || data?.internal_payment_id;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Cari payment record di subscription_payments
    let targetPaymentId = paymentId;
    let foundPayment = null;

    if (targetPaymentId) {
      const { data: found } = await adminClient
        .from("subscription_payments")
        .select("id, amount, status")
        .eq("id", targetPaymentId)
        .maybeSingle();
      foundPayment = found;
    } else if (gatewayRef) {
      const { data: found } = await adminClient
        .from("subscription_payments")
        .select("id, amount, status")
        .eq("payment_gateway_ref", gatewayRef)
        .maybeSingle();
      foundPayment = found;
      targetPaymentId = found?.id;
    }

    if (!targetPaymentId || !foundPayment) {
      return new Response(
        JSON.stringify({ error: "Record pembayaran tidak ditemukan untuk referensi ini" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validasi nominal pembayaran (amount check)
    const incomingAmount = Number(data?.amount ?? payload?.amount);
    if (!isNaN(incomingAmount) && incomingAmount > 0) {
      const recordAmount = Number(foundPayment.amount);
      if (recordAmount !== incomingAmount) {
        // eslint-disable-next-line no-console
        console.error(
          `[verify-subscription-payment] Amount mismatch: expected ${recordAmount}, got ${incomingAmount}`
        );
        return new Response(
          JSON.stringify({ error: "Payment amount mismatch" }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Panggil fungsi database SECURITY DEFINER: activate_tenant_subscription
    const { data: result, error: rpcError } = await adminClient.rpc(
      "activate_tenant_subscription",
      {
        p_payment_id: targetPaymentId,
        p_gateway_ref: gatewayRef || null,
      }
    );

    if (rpcError) {
      // eslint-disable-next-line no-console
      console.error("[verify-subscription-payment] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: "Failed to activate subscription" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Langganan tenant berhasil diaktifkan",
        activationResult: result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[verify-subscription-payment] Unexpected internal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
