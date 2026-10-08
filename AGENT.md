# AGENT.md — RuangWarga-dev (Portal Warga → Multi-Tenant SaaS)

Panduan kerja untuk AI coding agent (Antigravity CLI) di repo ini.
Baca file ini SEBELUM membuat rencana atau mengubah kode apa pun.

**Sumber tugas utama:**
- `docs/handoff/` — batch aktif terbaru (mis. `SEC-1.md`), rujuk `docs/handoff/README.md` untuk alur kerja lengkap.

---

## 1. Peran

| Peran | Pihak | Tugas |
|---|---|---|
| Orchestrator | Claude | Menulis batch tugas (`docs/handoff/`), review diff, QA, menerapkan migration ke Supabase dev, cek advisor/grant, menerbitkan batch berikutnya |
| Executor | Antigravity | Mengerjakan task di batch aktif: hanya mengubah file di repo, commit, push, dan membuat laporan `<BATCH>-report.md` |
| Owner | User | Memberi arahan, menyetujui perubahan produksi |

## 2. Konteks Proyek (Ringkas)

RuangWarga-dev sedang ditransformasi dari aplikasi tunggal "Portal Warga Palm
Village" (1 Supabase project = 1 kompleks perumahan) menjadi **platform SaaS
multi-tenant** ala model SumoPod: 1 infrastruktur, banyak tenant, 4 vertikal
bisnis yang dilayani:

1. **RT/RW & Koordinator Perumahan**
2. **Kos-kosan/Kontrakan**
3. **Arisan**
4. **Kelas** (iuran kelompok kecil)

Filosofi pembangunan: **"pabrik dulu, baru produk"** — fondasi platform
(tenant, subscription, billing, dua dashboard level) dibangun tuntas sebelum
modul vertikal difinalisasi.

## 3. Tech Stack

| Kategori         | Teknologi                                       |
|------------------|---------------------------------------------------|
| Frontend         | React 18.2 + Vite 5.0                              |
| Styling          | TailwindCSS 3.4 (class custom `.pv-*`, tema Forest/Gold) |
| State/data       | @tanstack/react-query 5.17                         |
| Charts           | Recharts 3.9                                       |
| Backend & Auth   | Supabase (PostgreSQL + Auth + RLS)                 |
| Edge Functions   | Supabase (Deno/TypeScript)                         |
| Payment Gateway  | **Mayar QRIS**                                     |
| Automation       | n8n (akan dipensiunkan/migrasi ke Supabase)        |
| Deployment       | Vercel (frontend) + Supabase Cloud (backend)       |

`legacy-backend/` (Express + MongoDB) tetap **DEPRECATED**, jangan disentuh.

## 4. Alur Kerja Batch & Eksekusi

- Pekerjaan diatur per-batch di `docs/handoff/<BATCH>.md`.
- Setiap task dalam batch dikerjakan berurutan.
- **1 task = 1 commit terpisah** (`<type>: <deskripsi>` Bahasa Indonesia, sebut ID task, mis. `fix(sec): SEC-1.3 hapus aktivasi dari browser`).
- Jangan gabungkan beberapa task berbeda jadi satu commit besar.
- Verifikasi ke kode aktual di repo (`supabase/migrations/`, `client/src/`), bukan asumsi dokumen lama.
- Setelah tiap task: jalankan test dan build di `client/` (`npx vitest run && npm run build`).

## 5. Model Data Multi-Tenant

Skema platform:
- `tenants` — 1 baris per pelanggan (RT/RW/kos/arisan/kelas), punya `type` enum.
- `tenant_subscriptions`, `tenant_subscription_blocks`, `block_pricing`,
  `subscription_periods`, `subscription_payments` — mesin billing platform.
- `tenant_units` (generik: rumah/kamar/slot), `tenant_members` (generik:
  warga/penyewa/peserta/siswa), `billing_items` (generik: IPL/sewa/kontribusi/iuran).
- `payments`, `expenses` — pola lama tetap, tambah kolom `tenant_id`.
- Field yang tidak generik antar vertikal disimpan di `tenant_units.metadata` (JSONB).
- Tabel khusus arisan: `arisan_rounds`, `arisan_participants` — hanya aktif untuk `tenant.type = 'arisan'`.
- Modul Listing Publik: `public_listings`, `listing_pricing`, `listing_payments` — sengaja dapat diakses publik.

## 6. RLS — Prinsip Wajib

- Isolasi tenant ditegakkan di **level database (RLS)**, bukan hanya di
  routing frontend. Setiap tabel operasional baru wajib punya RLS sejak awal
  dibuat, mengikuti pola helper `current_tenant_ids()` / `has_permission()` /
  `tenant_subscription_status()`.
- Pola umum: SELECT selalu boleh untuk anggota tenant terkait (termasuk saat
  `read_only`); INSERT/UPDATE hanya boleh jika status subscription bukan
  `read_only`. Pakai hook `useSubscriptionGate()` untuk logika ini di frontend.
- **Pengecualian yang disengaja**: `public_listings` dan `listing_pricing`
  boleh SELECT publik tanpa login.
- Akses lintas-tenant penuh (mis. Platform Owner Dashboard) hanya untuk
  `is_platform_admin()` — jangan pernah expose data lintas tenant ke Tenant
  Admin manapun.

## 7. Empat Lapisan Routing — Jangan Dicampur

```
/platform/*     → Platform Owner Dashboard — akses khusus Platform Owner
/account/*      → Tenant Owner Dashboard — siapa saja yang punya ≥1 tenant
/t/:tenantId/*  → Dashboard operasional tenant (RT/RW, Kos, Arisan, Kelas)
/listing/*      → Halaman publik Modul Listing — TANPA login, TANPA tenant context
```

Jangan mencampur logika dari satu lapisan ke lapisan lain (misal: jangan
memasukkan `TenantContext` ke halaman `/listing/*` yang memang harus bisa
diakses tanpa tenant context sama sekali).

## 8. Cara Kerja yang Diharapkan

1. **Rencana dulu sebelum eksekusi**, sebutkan task ID dari batch aktif di `docs/handoff/` yang
   sedang dikerjakan (mis. "Mengerjakan SEC-1.1").
2. **Satu task = satu unit kerja (1 commit)**.
3. **Tunjukkan diff sebelum apply** untuk: migration SQL apa pun, RLS policy,
   Edge Functions pembayaran (Mayar QRIS), dan file konteks tenant/auth.
4. **Ikuti konvensi visual existing**: class Tailwind `.pv-*`, warna Forest
   (`forest-800` = `#1a3d2e`) dan Gold (`gold-500` = `#d4af37`), font Inter +
   Playfair Display.
5. Kalau menemukan poin yang tidak jelas atau belum ada keputusan final: **jangan menebak** —
   catat di `docs/handoff/questions.md` dan konfirmasi ke orchestrator/user.

## 9. Keamanan & Credential — Hard Rules

- Jangan pernah menulis Mayar API key/secret, private key, JWT, atau token
  transaksi ke README, source code, `VITE_*`, atau commit ke repo.
- Simpan credential backend server-side (Supabase Edge Function secrets atau n8n Credentials),
  bukan di variable `VITE_*`.
- Edge Function pembayaran subscription (`create-subscription-payment`,
  `verify-subscription-payment`) dan listing (`create-listing-payment`,
  `verify-listing-payment`) menangani uang — perlakukan sebagai kode paling
  sensitif di repo, wajib review cermat sebelum merge.

## 10. Testing (Logika Finansial & Isolasi Data)

1. Gunakan **Vitest** di `client/`.
2. Prioritas testing:
   - Kalkulasi kombinasi blok harga (`calculateOptimalBlocks()`).
   - Logika pengocokan arisan.
   - Kalkulasi billing/tagihan berkala.
   - Test isolasi tenant (SQL matrix / Vitest).
3. Sebelum commit task selesai: `npm run lint` lolos, `npm run build` lolos,
   test relevan lolos (`npx vitest run`).
4. Jangan menulis test yang menyentuh Mayar/Supabase production sungguhan.

## 11. Batasan Tambahan

- Jangan ubah project Supabase **production** existing secara langsung.
- Jangan kembangkan `legacy-backend/`.
- Jangan push langsung ke `main`. Branch kerja mengikuti batch aktif (mis. `claude/eloquent-tesla-f0ddcr`).
- Jangan install package baru tanpa menyebut alasan di ringkasan commit.

## 12. Format Ringkasan Setelah Task Selesai

- Ikuti format laporan di `docs/handoff/<BATCH>-report.md`.
