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
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

function buildReminderBody(
  stage: string,
  periodText: string,
  totalFormatted: string
): string {
  switch (stage) {
    case "h-3":
      return `Tagihan ${periodText} ${totalFormatted} jatuh tempo 3 hari lagi`;
    case "h0":
      return `Tagihan ${periodText} ${totalFormatted} jatuh tempo hari ini`;
    case "h+3":
      return `Tagihan ${periodText} ${totalFormatted} terlambat 3 hari`;
    case "h+7":
      return `Tagihan ${periodText} ${totalFormatted} terlambat 7 hari`;
    default:
      return `Tagihan ${periodText} ${totalFormatted} perlu diselesaikan`;
  }
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
          const statusCode = err?.statusCode || err?.status || (err?.response && err.response?.status);
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

    // 6. Tanggal hari ini dalam Waktu Indonesia Barat (WIB, UTC+7)
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // 7. Ambil antrean pengingat pending hari ini yang belum dikirim push
    const { data: reminders, error: remindersErr } = await supabase
      .from("rent_reminders")
      .select(`
        id,
        tenant_id,
        bill_id,
        member_id,
        stage,
        remind_date,
        status,
        push_sent_at,
        tenant:tenants (
          id,
          name,
          owner_id
        ),
        bill:billing_items (
          id,
          amount,
          late_fee,
          period,
          due_date,
          unit_id,
          member_id,
          unit:tenant_units (
            id,
            label
          )
        ),
        member:tenant_members (
          id,
          user_id,
          full_name
        )
      `)
      .eq("remind_date", todayStr)
      .eq("status", "pending")
      .is("push_sent_at", null);

    if (remindersErr) {
      console.error("Gagal mengambil rent_reminders:", remindersErr.message);
      return new Response(
        JSON.stringify({ error: remindersErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 8. Kirim Web Push ke masing-masing penyewa
    for (const rem of reminders || []) {
      try {
        const tenant = single(rem.tenant);
        const bill = single(rem.bill);
        const member = single(rem.member);

        const tenantName = tenant?.name || "Kos";
        const amount = Number(bill?.amount || 0);
        const lateFee = Number(bill?.late_fee || 0);
        const totalAmount = amount + lateFee;
        const totalFormatted = formatRupiah(totalAmount);
        const periodText = formatPeriod(bill?.period);

        const title = `Pengingat sewa ${tenantName}`;
        const body = buildReminderBody(rem.stage, periodText, totalFormatted);
        const url = `/t/${rem.tenant_id}/payment-matrix`;

        // Cari user_id penyewa
        let targetUserId = member?.user_id;
        if (!targetUserId && bill?.member_id) {
          const { data: mData } = await supabase
            .from("tenant_members")
            .select("user_id")
            .eq("id", bill.member_id)
            .maybeSingle();
          targetUserId = mData?.user_id;
        }

        if (targetUserId) {
          await sendPushToUser(targetUserId, { title, body, url });
        }

        // Tandai push_sent_at = now() (meski penyewa tidak punya langganan, agar tidak diulang)
        await supabase
          .from("rent_reminders")
          .update({ push_sent_at: new Date().toISOString() })
          .eq("id", rem.id);
      } catch (itemErr: any) {
        console.error(`Error memproses pengingat ${rem.id}:`, itemErr?.message || itemErr);
        // Tandai push_sent_at agar tidak menyebabkan pengulangan tanpa akhir
        try {
          await supabase
            .from("rent_reminders")
            .update({ push_sent_at: new Date().toISOString() })
            .eq("id", rem.id);
        } catch (_) {}
      }
    }

    // 9. Ringkasan Pemilik:
    // Per tenant yang memiliki pengingat pending hari ini dan belum ada di push_daily_summaries untuk hari ini
    const { data: pendingReminderRows, error: prErr } = await supabase
      .from("rent_reminders")
      .select("tenant_id")
      .eq("remind_date", todayStr)
      .eq("status", "pending");

    if (!prErr && pendingReminderRows) {
      const tenantIds = Array.from(new Set(pendingReminderRows.map((r: any) => r.tenant_id)));

      for (const tenantId of tenantIds) {
        try {
          // Periksa apakah ringkasan untuk tenant ini sudah tercatat hari ini
          const { data: existingSummary } = await supabase
            .from("push_daily_summaries")
            .select("tenant_id")
            .eq("tenant_id", tenantId)
            .eq("summary_date", todayStr)
            .maybeSingle();

          if (existingSummary) {
            continue;
          }

          // Hitung total pengingat pending hari ini untuk tenant ini
          const { count: pendingCount } = await supabase
            .from("rent_reminders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("remind_date", todayStr)
            .eq("status", "pending");

          const reminderCount = pendingCount ?? 0;
          if (reminderCount > 0) {
            // Ambil data tenant untuk mendapatkan owner_id dan nama
            const { data: tenantData } = await supabase
              .from("tenants")
              .select("id, name, owner_id")
              .eq("id", tenantId)
              .maybeSingle();

            if (tenantData?.owner_id) {
              const ownerPayload = {
                title: `Pengingat sewa ${tenantData.name || "Kos"}`,
                body: `${reminderCount} pengingat sewa perlu dikirim hari ini`,
                url: `/t/${tenantId}/reminders`,
              };
              await sendPushToUser(tenantData.owner_id, ownerPayload);
            }

            // Catat pengiriman ringkasan ke push_daily_summaries
            const { error: insErr } = await supabase
              .from("push_daily_summaries")
              .insert({
                tenant_id: tenantId,
                summary_date: todayStr,
                sent_at: new Date().toISOString(),
              });

            if (!insErr) {
              stats.summaries++;
            }
          }
        } catch (ownerErr: any) {
          console.error(`Error memproses ringkasan pemilik untuk tenant ${tenantId}:`, ownerErr?.message || ownerErr);
        }
      }
    }

    // 10. Kembalikan JSON ringkasan hasil pemrosesan
    return new Response(
      JSON.stringify({
        sent: stats.sent,
        failed: stats.failed,
        removed: stats.removed,
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
