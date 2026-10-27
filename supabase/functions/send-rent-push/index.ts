import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PushStats {
  sent: number;
  failed: number;
  removed: number;
  summaries: number;
}

function single<T>(item: T | T[] | null | undefined): T | null {
  if (!item) return null;
  if (Array.isArray(item)) return item[0] ?? null;
  return item;
}

function formatPeriod(periodStr?: string): string {
  if (!periodStr) return "bulan ini";
  const parts = periodStr.split("-");
  if (parts.length >= 2) {
    const monthIdx = parseInt(parts[1], 10) - 1;
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ];
    if (monthIdx >= 0 && monthIdx < 12) {
      return months[monthIdx];
    }
  }
  return periodStr;
}

function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

async function getRecipientsForPermissions(
  supabase: any,
  tenantId: string,
  ownerId: string | null | undefined,
  permissionKeys: string[]
): Promise<string[]> {
  const recipientUserIds = new Set<string>();
  if (ownerId) {
    recipientUserIds.add(ownerId);
  }

  try {
    // 1. Ambil seluruh role milik tenant ini
    const { data: roles } = await supabase
      .from("tenant_roles")
      .select("id")
      .eq("tenant_id", tenantId);

    const roleIds = (roles || []).map((r: any) => r.id);
    if (roleIds.length > 0) {
      // 2. Ambil role_id yang memiliki izin yang diminta
      const { data: rolePerms } = await supabase
        .from("tenant_role_permissions")
        .select("tenant_role_id")
        .in("tenant_role_id", roleIds)
        .in("permission_key", permissionKeys);

      const matchedRoleIds = Array.from(
        new Set((rolePerms || []).map((rp: any) => rp.tenant_role_id))
      );

      if (matchedRoleIds.length > 0) {
        // 3. Ambil user_id anggota aktif (status 'approved') yang memiliki peran tersebut
        const { data: members } = await supabase
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("status", "approved")
          .in("tenant_role_id", matchedRoleIds);

        for (const m of members || []) {
          if (m.user_id) {
            recipientUserIds.add(m.user_id);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Gagal mengambil daftar anggota berizin:", err?.message || err);
  }

  return Array.from(recipientUserIds);
}

serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Hanya method POST yang diizinkan
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
    // 3. Autentikasi Pemanggil: wajib header x-cron-secret cocok dengan RENT_PUSH_CRON_SECRET
    const expectedCronSecret = Deno.env.get("RENT_PUSH_CRON_SECRET");
    const incomingCronSecret = req.headers.get("x-cron-secret");

    if (!expectedCronSecret || incomingCronSecret !== expectedCronSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: header x-cron-secret tidak valid." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Inisialisasi Supabase Admin Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server error: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak disetel." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 5. Konfigurasi Web Push VAPID
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ruangwarga.com";
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    let vapidReady = false;
    if (vapidPublicKey && vapidPrivateKey) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        vapidReady = true;
      } catch (vapidErr: any) {
        console.error("Gagal mengonfigurasi VAPID:", vapidErr?.message || vapidErr);
      }
    } else {
      console.warn("VAPID_PUBLIC_KEY atau VAPID_PRIVATE_KEY belum disetel pada Edge Function environment.");
    }

    const stats: PushStats = {
      sent: 0,
      failed: 0,
      removed: 0,
      summaries: 0,
    };

    // Helper untuk mengirim push ke seluruh subscriptions milik user tertentu
    const sendPushToUser = async (
      userId: string,
      payload: { title: string; body: string; url: string }
    ): Promise<void> => {
      if (!vapidReady) {
        stats.failed++;
        return;
      }

      const { data: subs, error: subsErr } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", userId);

      if (subsErr) {
        console.error(`Gagal mengambil subscriptions untuk user ${userId}:`, subsErr.message);
        stats.failed++;
        return;
      }

      if (!subs || subs.length === 0) {
        return;
      }

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify(payload),
            { TTL: 86400 } // TTL 24 jam
          );
          stats.sent++;

          // Perbarui last_success_at
          await supabase
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString() })
            .eq("id", sub.id);
        } catch (err: any) {
          const statusCode =
            err?.statusCode || err?.status || (err?.response && err.response?.status);
          if (statusCode === 404 || statusCode === 410) {
            console.log(`Menghapus langganan tidak valid ${sub.id} (HTTP ${statusCode})`);
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
            stats.removed++;
          } else {
            console.error(`Gagal mengirim push ke subscription ${sub.id}:`, err?.message || err);
            stats.failed++;
          }
        }
      }
    };

    // 6. Baca body JSON (boleh kosong)
    let payloadBody: any = {};
    try {
      const text = await req.text();
      if (text && text.trim() !== "") {
        payloadBody = JSON.parse(text);
      }
    } catch (_) {
      payloadBody = {};
    }

    const eventType = payloadBody?.event;

    // --------------------------------------------------------------------------
    // CABANG A: Event 'payment_submitted'
    // Dipicu segera saat bukti bayar baru diunggah / diajukan
    // --------------------------------------------------------------------------
    if (eventType === "payment_submitted") {
      const paymentId = payloadBody?.payment_id;
      if (!paymentId) {
        return new Response(
          JSON.stringify({ error: "payment_id wajib disertakan untuk event payment_submitted" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Ambil data pembayaran beserta tenant, unit, dan member
      const { data: payment, error: pErr } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          status,
          tenant_id,
          member_id,
          billing_item_id,
          tenant:tenants (
            id,
            name,
            type,
            owner_id
          ),
          member:tenant_members (
            id,
            full_name,
            unit:tenant_units (
              id,
              label
            )
          ),
          billing_item:billing_items (
            id,
            period,
            unit:tenant_units (
              id,
              label
            )
          )
        `)
        .eq("id", paymentId)
        .maybeSingle();

      if (pErr || !payment) {
        console.error("Payment tidak ditemukan:", pErr?.message || paymentId);
        return new Response(
          JSON.stringify({ error: "Payment tidak ditemukan" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const tenant = single(payment.tenant);

      // Hanya bila tenant bertipe 'kos' dan status pembayaran masih 'pending_verification'
      if (tenant?.type !== "kos" || payment.status !== "pending_verification") {
        return new Response(
          JSON.stringify({
            event: "payment_submitted",
            message: "Dilewati: bukan tenant kos atau status pembayaran bukan pending_verification",
            sent: 0,
            failed: 0,
            removed: 0,
            recipients: 0,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const member = single(payment.member);
      const billingItem = single(payment.billing_item);
      const tenantName = tenant.name || "Kos";
      const memberName = member?.full_name || "Penyewa";
      const roomLabel = single(member?.unit)?.label || single(billingItem?.unit)?.label || "Kamar";
      const periodText = formatPeriod(billingItem?.period);
      const amountText = formatRupiah(payment.amount);

      const title = `Bukti bayar baru – ${tenantName}`;
      const body = `${memberName} (${roomLabel}) mengunggah bukti bayar ${periodText} ${amountText}, perlu diverifikasi`;
      const url = `/t/${payment.tenant_id}/payment-verification`;

      // Penerima = tenants.owner_id + anggota approved tenant yang memiliki izin manage_billing_cash atau manage_billing_transfer
      const recipientUserIds = await getRecipientsForPermissions(
        supabase,
        payment.tenant_id,
        tenant.owner_id,
        ["manage_billing_cash", "manage_billing_transfer"]
      );

      for (const userId of recipientUserIds) {
        await sendPushToUser(userId, { title, body, url });
      }

      return new Response(
        JSON.stringify({
          event: "payment_submitted",
          sent: stats.sent,
          failed: stats.failed,
          removed: stats.removed,
          recipients: recipientUserIds.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --------------------------------------------------------------------------
    // CABANG B: Ringkasan Pagi (body kosong atau event 'daily_summary')
    // HANYA ringkasan pagi untuk pemilik dan staf, TIDAK mengirim ke penyewa
    // --------------------------------------------------------------------------
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Ambil daftar tenant_id dari rent_reminders berstatus pending hari ini (WIB)
    const { data: reminderRows, error: remErr } = await supabase
      .from("rent_reminders")
      .select("tenant_id")
      .eq("remind_date", todayStr)
      .eq("status", "pending");

    if (remErr) {
      console.error("Gagal mengambil rent_reminders:", remErr.message);
      return new Response(
        JSON.stringify({ error: remErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const candidateTenantIds = Array.from(
      new Set((reminderRows || []).map((r: any) => r.tenant_id))
    );

    let totalRecipientsCount = 0;

    if (candidateTenantIds.length > 0) {
      // Filter hanya tenant yang bertipe 'kos'
      const { data: kosTenants, error: ktErr } = await supabase
        .from("tenants")
        .select("id, name, type, owner_id")
        .in("id", candidateTenantIds)
        .eq("type", "kos");

      if (ktErr) {
        console.error("Gagal mengambil data tenants:", ktErr.message);
      }

      for (const tenant of kosTenants || []) {
        try {
          // Periksa apakah ringkasan untuk tenant ini sudah tercatat hari ini
          const { data: existingSummary } = await supabase
            .from("push_daily_summaries")
            .select("tenant_id")
            .eq("tenant_id", tenant.id)
            .eq("summary_date", todayStr)
            .maybeSingle();

          if (existingSummary) {
            continue;
          }

          // Hitung total pengingat sewa pending hari ini untuk tenant ini
          const { count: pendingCount } = await supabase
            .from("rent_reminders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .eq("remind_date", todayStr)
            .eq("status", "pending");

          const reminderCount = pendingCount ?? 0;
          if (reminderCount === 0) {
            continue;
          }

          // Hitung total tunggakan:
          // jumlah amount + late_fee tagihan kos unpaid yang due_date < hari ini untuk tenant itu
          const { data: overdueBills, error: billErr } = await supabase
            .from("billing_items")
            .select("amount, late_fee")
            .eq("tenant_id", tenant.id)
            .eq("status", "unpaid")
            .lt("due_date", todayStr);

          if (billErr) {
            console.error(`Gagal mengambil overdue bills tenant ${tenant.id}:`, billErr.message);
          }

          let totalTunggakan = 0;
          for (const b of overdueBills || []) {
            totalTunggakan += Number(b.amount || 0) + Number(b.late_fee || 0);
          }

          const tenantName = tenant.name || "Kos";
          const totalFormatted = formatRupiah(totalTunggakan);

          const title = `Pengingat sewa ${tenantName}`;
          const body = `${reminderCount} pengingat sewa perlu dikirim hari ini, total tunggakan ${totalFormatted}`;
          const url = `/t/${tenant.id}/reminders`;

          // Penerima = owner + anggota approved dengan izin generate_billing
          const recipients = await getRecipientsForPermissions(
            supabase,
            tenant.id,
            tenant.owner_id,
            ["generate_billing"]
          );

          totalRecipientsCount += recipients.length;

          for (const userId of recipients) {
            await sendPushToUser(userId, { title, body, url });
          }

          // Catat ringkasan hari ini ke tabel push_daily_summaries
          const { error: insErr } = await supabase
            .from("push_daily_summaries")
            .insert({
              tenant_id: tenant.id,
              summary_date: todayStr,
              sent_at: new Date().toISOString(),
            });

          if (!insErr) {
            stats.summaries++;
          } else {
            console.error(`Gagal insert push_daily_summaries tenant ${tenant.id}:`, insErr.message);
          }
        } catch (tErr: any) {
          console.error(`Error memproses ringkasan pemilik untuk tenant ${tenant.id}:`, tErr?.message || tErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        event: payloadBody?.event || "daily_summary",
        sent: stats.sent,
        failed: stats.failed,
        removed: stats.removed,
        recipients: totalRecipientsCount,
        summaries: stats.summaries,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("send-rent-push internal error:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
