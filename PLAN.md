# PLAN.md — Rencana Induk RuangWarga

Titik masuk untuk siapa pun (manusia atau AI agent) yang melanjutkan pekerjaan ini. Baca file ini dulu, lalu ikuti tautannya.

Terakhir diperbarui: 2026-10-23 (Claude, orchestrator).

## 1. Apa itu RuangWarga
- **Bentuk produk:** SaaS multi-tenant untuk mengelola keuangan dan anggota komunitas. Berawal dari aplikasi tunggal "Portal Warga Palm Village", yang kini menjadi tenant pertama.
- **Model bisnis:** tenant membayar ke platform, berupa langganan dan iklan listing.
- **Uang tenant:** uang anggota ke tenant (iuran, sewa, setoran) **tidak pernah lewat platform**. Pembayarannya ke rekening tenant sendiri, dengan bukti dan verifikasi pengurus.

| Vertikal (`tenants.type`) | Untuk | Status |
|---|---|---|
| `rt_rw` | RT/RW, perumahan | Inti selesai: IPL, warga/unit, verifikasi bayar, laporan, pengeluaran, pemasukan, pengumuman, agenda, jabatan |
| `kos` | Kos / kontrakan | Inti selesai: kamar, kontrak, tagihan sewa, checkout, listing kamar publik (KOS-1/1F) |
| `arisan` | Arisan | Inti selesai: slot/peserta, putaran, setoran, kocok transparan final di server, bayar sendiri, jabatan (VERT-2, ARISAN-1) |
| `panitia` | Kepanitiaan / organisasi acara | Inti selesai: acara, RAB, pemasukan/pengeluaran per acara, iuran panitia, dokumen (R2), LPJ, masa aktif per acara (PANITIA-1..HARGA) |
| `kelas` | (lama) | **Digantikan Kepanitiaan.** Kodenya masih ada; dihapus di KELAS-CLEANUP |

## 2. Peta dokumen
| Butuh apa | Lihat |
|---|---|
| Aturan kerja agent | `CLAUDE.md` (Claude), `AGENT.md` = `AGENTS.md` (executor), `GEMINI.md` |
| Alur serah-terima batch | `docs/handoff/README.md` |
| Urutan batch dan **keputusan user yang mengikat** | `docs/handoff/BACKLOG.md` |
| Kebutuhan per vertikal | `docs/handoff/VERTIKAL-requirement.md`, `PANITIA-requirement.md`, `STOR-1-requirement.md`, `AUDIT-RTRW.md`, `AUDIT-VERTIKAL.md` |
| Spesifikasi tiap batch | `docs/handoff/<BATCH>.md`. Laporan executor: `<BATCH>-report.md`. Hasil review: `<BATCH>-review.md` |
| Pertanyaan dan jawaban user | `docs/handoff/questions.md` |
| SQL yang sudah di-dry-run | `docs/handoff/assets/<BATCH>/` |
| Test SQL (matrix RLS/RPC) | `supabase/tests/*.sql`, untuk SQL Editor |
| Skema database | `supabase/migrations/` (urut nama), `supabase/schema.sql` (lama) |

`README.md` di root dan dokumen Portal Warga lain (`docs/*.docx`, `docs/production/`) adalah milik Portal Warga Palm Village. **Abaikan** (keputusan user 2026-10-24: fokus hanya RuangWarga). Urutan sumber kebenaran: kode, lalu `BACKLOG.md`, lalu dokumen batch terbaru.

## 3. Arsitektur dan lingkungan
- **Frontend:** `client/` (React 18, Vite 5, Tailwind dengan class `pv-*`, React Query, PWA). Ada mode demo (`VITE_DEMO_MODE`, store memori) dan mode Supabase. Hosting di Vercel.
- **Backend: Supabase saja.**
  - RLS + RBAC v2 dengan helper `has_permission`, `current_tenant_ids`, `tenant_subscription_status`, `is_billing_privileged`.
  - Edge Function (Deno) di `supabase/functions/`.
- **Supabase dev:** project ref `jqbegedjsylhrqpknwor` (Seoul, PG 17).
  - Belum ada project produksi RuangWarga.
  - Pertimbangkan project baru di Singapore sebelum ada tenant sungguhan.
- **File:** Cloudflare R2 privat, lewat Edge Function `storage-upload` / `storage-sign-url`. Aturan file ada di `supabase/functions/_shared/fileRules.ts`.
- **Pembayaran platform:** DOKU QRIS SNAP dengan merchant **milik platform**. Secret Edge Function berawalan `DOKU_PLATFORM_*`. Modul ada di `supabase/functions/_shared/doku.ts`.
- 🚫 **n8n dilarang disentuh.** Instance itu dipakai Portal Warga live di repo lain. Merchant DOKU di env n8n milik Palm Village dan tidak boleh dipakai untuk pendapatan platform.
- 🚫 **`legacy-backend/` deprecated.**

## 4. Kondisi saat ini (2026-10-23)
- **Git:** branch kerja `claude/ruangwarga-remote-2-disconnect-m4oku0`. `main` = hasil yang sudah direview.
- **Migration di dev:**
  - semua file `supabase/migrations/` sampai `202610220004_arisan_transparent_draw.sql` sudah terpasang. Riwayat ada di `supabase_migrations.schema_migrations`;
  - **belum** terpasang: `202610240001_kos_contracts.sql` dan `202610240002_kos_contract_billing.sql` (KOS-2). Keduanya menunggu review dan dry-run Claude.
- **Edge Function di dev:**
  - ter-deploy: `storage-upload` (v5) dan `storage-sign-url` (v4), keduanya `verify_jwt` aktif;
  - **belum** di-deploy: `create-subscription-payment`, `verify-subscription-payment`, `create-listing-payment`, `verify-listing-payment`, `check-listing-expirations`. (`auto-generate-kos-bills` dihapus 2026-10-25: tagihan kos harian sudah lewat pg_cron `ruangwarga-auto-billing` → `run_auto_billing()`.)
- **Batch terakhir:**
  - PANITIA-ARISAN-1F ✅;
  - **PANITIA-ARISAN-2F** ✅ (`PANITIA-ARISAN-2F-review.md`);
  - **KOS-2 + KOS-2F** ✅ (kontrak sewa master, tagihan per tanggal masuk; `KOS-2F-report.md`). Kedua migration terpasang di dev 2026-10-25 (`20261025084106`, `20261025084111`). Metode siklus "ikut tanggal masuk" disetujui user sebagai default;
  - **KOS-3** ✅ prorata sebagai pilihan per kontrak (`KOS-3.md`), terpasang di dev (`20261025095605`). Pembayaran kos/IPL/arisan tidak lewat QRIS; QRIS hanya untuk langganan aplikasi;
  - **LIST-UI-1** (akses iklan kamar dan katalog kos) menunggu persetujuan user.
- **Dua sesi Claude** pernah berjalan bersamaan: satu untuk Kepanitiaan/Arisan, satu untuk KOS-2/LIST-UI-1. Sebelum menulis BACKLOG atau menerapkan migration, selalu `git fetch` dan cek riwayat terbaru.
- **Merchant DOKU platform sudah disetujui** (user, 2026-10-22). Langkah penyiapan ada di § 7.

## 5. Roadmap berikutnya (urut)
1. Batch PANITIA-ARISAN-2F + KOS-2F + KOS-3 ✅ sudah di `main` (2026-10-25). **LIST-UI-1** dikerjakan setelah disetujui user.
2. **Penyiapan DOKU** (§ 7), dikerjakan user, lalu Claude men-deploy fungsi pembayaran ke dev.
3. **PAY-3** (perlu persetujuan user; menyentuh pembayaran):
   - **satu** URL notifikasi DOKU yang meneruskan berdasarkan awalan referensi: `SUB-` langganan, `LST-` iklan, nanti acara. DOKU umumnya menyimpan satu URL notifikasi QRIS per merchant, sedangkan kode sekarang punya dua penerima terpisah;
   - `SELECT … FOR UPDATE` pada `activate_tenant_subscription` dan `activate_listing_payment` (catatan `PAY-1F-review.md`), supaya notifikasi ganda tidak memperpanjang dua kali.
4. **PANITIA-BAYAR** (perlu persetujuan user):
   - QRIS Rp25.000 per acara per 12 bulan;
   - Edge Function yang memanggil `extend_program_access` setelah DOKU mengonfirmasi lunas;
   - tombol "Aktifkan / Perpanjang" di detail acara diaktifkan.
5. **Uji end-to-end** di sandbox, atau produksi dengan nominal kecil: langganan, iklan, dan acara.
6. **Dashboard Platform:** revenue, tenant, harga. Catatan: `PlatformPricingConfig.jsx` memakai kolom `block_pricing.duration_months` yang tidak ada.
7. **Lainnya dari BACKLOG:**
   - BILL-AUTO-1 (tagihan otomatis pg_cron);
   - LIST-1 (iklan warga + moderasi);
   - NOTIF-1 (email);
   - STOR-2 (hapus bucket lama);
   - KELAS-CLEANUP;
   - AUDIT-VERIFY-1;
   - migrasi data Palm Village (lihat BACKLOG § Catatan operasional).
8. **Ide fitur per vertikal:** `VERTIKAL-requirement.md` (surat pengantar RT, iuran sumbangan, ronda, dll.).

> **EDGE-AUTH-1** di BACKLOG sudah selesai di kode: semua fungsi memakai `getUser(token)`.

## 6. Keputusan yang masih terbuka
- **PANITIA-BAYAR:** apakah biaya QRIS 0,75% dibebankan ke tenant, seperti pada langganan (`questions.md` [PAY-1])?
- **Persetujuan batch:** PAY-3 dan PANITIA-BAYAR belum disetujui.

## 7. Penyiapan DOKU platform (langkah user, jangan kirim nilai ke chat atau repo)
1. Gunakan akun merchant DOKU **platform**, bukan Palm Village.
2. Ambil dari dashboard DOKU:
   - Client ID dan Secret Key;
   - Merchant ID dan Terminal ID untuk QRIS;
   - kode pos.
   Mulai dari sandbox bila tersedia.
3. Siapkan kunci RSA:
   ```
   openssl genrsa -out doku.pem 2048
   openssl rsa -in doku.pem -pubout -out doku-public.pem
   openssl pkcs8 -topk8 -nocrypt -in doku.pem -out doku-pkcs8.pem
   ```
   - Unggah `doku-public.pem` ke DOKU.
   - Private key yang dipakai harus berformat PKCS#8 (`-----BEGIN PRIVATE KEY-----`).
4. Buat token notifikasi: `openssl rand -hex 32`.
5. Isi secret di Supabase (Dashboard → Edge Functions → Secrets):
   - `DOKU_PLATFORM_BASE_URL`: `https://api-sandbox.doku.com` untuk sandbox atau `https://api.doku.com` untuk produksi;
   - `DOKU_PLATFORM_CLIENT_ID`;
   - `DOKU_PLATFORM_CLIENT_SECRET`;
   - `DOKU_PLATFORM_MERCHANT_ID`;
   - `DOKU_PLATFORM_TERMINAL_ID`;
   - `DOKU_PLATFORM_POSTAL_CODE`;
   - `DOKU_PLATFORM_PRIVATE_KEY`;
   - `DOKU_PLATFORM_CHANNEL_ID`: opsional, bawaan `H2H`;
   - `DOKU_PLATFORM_WEBHOOK_SECRET`: token dari langkah 4.
6. Claude men-deploy fungsi pembayaran. Fungsi webhook di-deploy dengan `verify_jwt = false`, karena autentikasinya memakai `?token=` di URL.
7. **Setelah PAY-3**, daftarkan satu URL notifikasi di dashboard DOKU: `https://<ref>.supabase.co/functions/v1/<fungsi-notifikasi>?token=<token>`.

## 8. Playbook orchestrator (Claude)
- **Peran:** Claude merencanakan, mereview, menerapkan migration ke dev, dan men-deploy Edge Function. Executor (Antigravity/agy, dijalankan user) menulis kode. Claude hanya memperbaiki 1–3 baris setelah review.
- **Siklus kerja:**
  1. Fitur baru dimulai dari requirement/plan/batch `.md`, lalu persetujuan user.
  2. Executor mengerjakan dan menulis laporan.
  3. Claude mereview (diff, lint, build, vitest seluruh suite di `TZ=UTC` dan `TZ=Asia/Jakarta`), menulis `<BATCH>-review.md`, dan menerbitkan batch `…F` untuk temuan.
- **Push:**
  - hanya atas perintah eksplisit user;
  - `.claude/settings.json` melarang `git push`. Buka larangan itu sementara di langkah terpisah, push, lalu pulihkan dengan `git checkout -- .claude/settings.json`;
  - selalu fast-forward dan scan secret dulu.
- **Menerapkan migration ke dev lewat MCP `execute_sql`:**
  - Perintah yang mengandung `DELETE FROM` atau `DROP` dibatalkan alat. Pakai `CREATE OR REPLACE …`, atau minta user menjalankannya di SQL Editor.
  - Pola: isi migration + uji penjaga di sub-blok `BEGIN … RAISE EXCEPTION 'X_TEST_OK'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'X_TEST_OK' THEN RAISE; END IF; END;`. Data uji ter-rollback, lalu dicatat dengan `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (to_char(now() AT TIME ZONE 'UTC','YYYYMMDDHH24MISS'), '<nama>')`.
  - Dry-run diakhiri dengan `RAISE EXCEPTION 'LULUS …'`.
- **Fixture test SQL:**
  - insert `auth.users(id,email,aud,role)` dulu;
  - owner member dan jabatan dasar dibuat trigger tenant;
  - `tenant_units.id` bertipe bigint;
  - ganti pengguna dengan `set_config('request.jwt.claims', json_build_object('sub',…,'role','authenticated')::text, true)` + `request.jwt.claim.sub` + `SET LOCAL ROLE authenticated`;
  - trigger kesiapan arisan butuh claims `{"role":"service_role"}`;
  - sinkron status tagihan hanya saat INSERT payment.
- **Deploy Edge Function lewat MCP:**
  - sertakan file `_shared` yang dipakai (nama `functions/<fn>/index.ts`, `functions/_shared/*.ts`);
  - cek dulu `get_edge_function` untuk melihat drift dan `verify_jwt`.
- **Kebiasaan executor yang harus diwaspadai:**
  - laporan sering tidak akurat (nama file/kolom salah, test diklaim lulus);
  - fixture test tidak sesuai bentuk data DB.
  - Selalu verifikasi sendiri, dan minta laporan ditulis dari `git diff` dan output asli.
