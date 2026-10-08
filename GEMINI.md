# RuangWarga Development Rules

## Project Identity
- **Nama project:** RuangWarga (sebelumnya PortalWarga)
- **Repository pengembangan:** https://github.com/kodok-ijho/RuangWarga-dev
- **Repository asal (read-only):** https://github.com/kodok-ijho/PortalWarga
- **Misi:** Transformasi PortalWarga (single-tenant) → RuangWarga (multi-tenant SaaS platform)

## Dokumen Perencanaan & Sumber Tugas
- Sumber tugas aktif berada di `docs/handoff/` (lihat file batch aktif seperti `SEC-1.md` dan panduan di `docs/handoff/README.md`)
- Backlog tugas lanjutan tercatat di `docs/handoff/BACKLOG.md`

## Pembagian Peran
- **Orchestrator:** Claude (menulis batch tugas, review, QA, apply migration ke Supabase dev)
- **Executor:** Antigravity (mengerjakan task di repo, commit, push, tulis laporan)

## Architecture (Target — Supabase-First)
- **Frontend:** React 18 + Vite 5 + TailwindCSS (SPA, PWA)
- **Auth:** Supabase Auth (Google OAuth)
- **Database:** Supabase PostgreSQL + Row Level Security (RLS)
- **Server-side logic:** Supabase Edge Functions (Deno/TypeScript)
- **Background jobs:** n8n (notifikasi, scheduled tasks, automation — bertahap dimigrasi)
- **Payment:** Mayar QRIS
- **Hosting:** Vercel
- **Demo mode:** `VITE_DEMO_MODE=true` dengan `mockData.js`

## Architecture (Current — Sedang Dimigrasi)
- Auth via n8n (custom App JWT) — akan dimigrasi ke Supabase Auth
- API via `api/n8n.js` proxy → n8n webhooks — akan dimigrasi ke akses langsung Supabase
- RLS ada di schema tapi di-bypass oleh n8n service role key

## Konvensi Koding
- **Bahasa komunikasi:** Bahasa Indonesia
- **Commit message:** Bahasa Indonesia, format: `<type>: <deskripsi>` (sebut ID task)
- **Setiap task = 1 commit terpisah** agar mudah di-review
- **Jangan ubah kode yang bukan bagian dari task aktif**
- **Pertahankan semua comment dan docstring** yang tidak terkait perubahan

## Prinsip Utama
1. **Platform-first:** Fondasi multi-tenant harus selesai sebelum modul vertikal
2. **Ikuti kode actual:** Bila ada perbedaan antara dokumentasi dan kode existing, ikuti kode actual
3. **RLS sebagai keamanan utama:** Isolasi tenant di-enforce di level database, bukan di application code
4. **Backward compatible:** Perubahan skema harus punya migration path, jangan break data existing

## Tenant Types
- `rt_rw` — Kompleks perumahan / RT/RW
- `kos` — Kos-kosan / kontrakan
- `arisan` — Grup arisan
- `kelas` — Kelas / les / sekolah

## Roles (per tenant)
- `admin` — Pemilik/ketua tenant
- `bendahara` — Keuangan tenant
- `pengurus` — Pengurus tenant
- `anggota` — Warga/penghuni/peserta/siswa

## Environment
- Agent berjalan di **proot-distro Ubuntu** di atas **Termux** di **Android**
- Path project: `/root/project/ruangwarga`
- Push ke GitHub menggunakan credential store (sudah dikonfigurasi)
- MCP tersedia: GitHub, Supabase, Sequential Thinking, Memory, Context7, Graphify

## File Penting di Codebase
- `client/src/App.jsx` — Route definitions, RoleGuard
- `client/src/context/AuthContext.jsx` — Auth system
- `client/src/services/dataService.js` — Unified data layer
- `client/src/services/dataHelpers.js` — RBAC functions
- `client/src/services/apiClient.js` — API client
- `supabase/migrations/` — Database schema & migrations
- `api/n8n.js` — Vercel serverless proxy ke n8n
