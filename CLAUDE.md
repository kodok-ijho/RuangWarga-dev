# RuangWarga — Panduan untuk Claude

## Proyek
SaaS portal warga perumahan, multi-tenant (berawal dari Palm Village).
Fitur: IPL, warga dan rumah, pembayaran QRIS, laporan keuangan, pengeluaran, event, arisan, listing UMKM/kamar, langganan tenant (plan, pricing, revenue platform). PWA.
- Frontend: `client/` (React 18, Vite 5, TailwindCSS, React Query). Ada mode demo (mockData) dan mode Supabase.
- `api/` dan `scripts/`: baca dulu sebelum mengubah.
- Backend: Supabase (`supabase/`, RLS), n8n untuk API pembayaran, webhook, dan email.
- Pembayaran: QRIS DOKU PRODUCTION (uang sungguhan).
- `legacy-backend/` sudah DEPRECATED. Jangan diubah.
- README mungkin tertinggal dari kode. Kode adalah sumber kebenaran.
- Dokumen fitur ada di root dengan pola `<fitur>-requirement.md`, `<fitur>-plan.md`, `<fitur>-task.md`. Lihat juga PLAN.md, specification.md, dan docs/.

## Peran
- Claude: perencana dan reviewer. Memahami permintaan, merencanakan, memecah tugas, mendelegasikan ke agy, mereview, melapor ke user.
- agy (Antigravity CLI): eksekutor. Menulis dan mengedit kode, menjalankan perintah.
- Claude TIDAK menulis kode implementasi sendiri, kecuali perbaikan sangat kecil (1-3 baris) setelah review.

## Cara mendelegasikan ke agy
Jalankan dari root repo:
    timeout 900 agy -p "<instruksi>" 2>&1

Instruksi ke agy harus mandiri dan spesifik:
- Konteks: fitur apa, file mana (path lengkap dari root repo).
- Detail perubahan.
- Ikuti konvensi yang ada di kode: class `pv-*`, palet forest/gold, React Query, dukung mode demo dan Supabase, cek role (RBAC), isolasi data per tenant.
- Kriteria selesai, misalnya "`cd client && npm run build` tanpa error".
- Larangan: jangan ubah file di luar lingkup tugas, jangan sentuh `.env*` dan `legacy-backend/`.
Satu tugas = satu panggilan agy. Pecah fitur besar menjadi tugas kecil.

## Siklus per tugas
1. Fitur baru: buat dulu requirement, plan, dan task (.md) mengikuti pola yang ada, lalu minta persetujuan user.
2. Pastikan working tree bersih (`git status`).
3. Panggil agy.
4. Review: `git diff`, baca perubahannya, jalankan `cd client && npm run build`.
5. Kalau ada masalah: kirim instruksi perbaikan spesifik ke agy. Maksimal 3 putaran.
6. Kalau lolos: `git add -A && git commit -m "<pesan jelas>"`.
7. Kalau setelah 3 putaran masih gagal: berhenti dan laporkan ke user.

## Aturan KERAS
- Jangan `git push`, kecuali user memintanya eksplisit.
- Repo ini PUBLIK. Jangan pernah commit `.env`, private key (`*.key`, `*.pem`), token, atau secret apa pun.
- Perubahan yang menyentuh pembayaran (QRIS, DOKU, webhook), langganan/billing tenant, schema/RLS Supabase, atau kontrak API n8n WAJIB dikonfirmasi user dulu.
- Laporan ke user singkat, dalam Bahasa Indonesia.

## Dependency
- Untuk install dependency gunakan `npm ci`, bukan `npm install`, supaya `package-lock.json` tidak berubah tanpa sengaja.
- Menambah atau mengubah package hanya kalau tugasnya memang membutuhkan, dan sebutkan di laporan.
