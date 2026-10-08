# Handoff — Alur Kerja Orchestrator ↔ Executor

Folder ini adalah satu-satunya jalur serah-terima tugas di repo ini.

| Peran | Siapa | Tugas |
|---|---|---|
| Orchestrator | Claude | Menulis batch tugas, review diff, QA, menerapkan migration ke Supabase **dev**, cek advisor/grant, menerbitkan batch berikutnya. **Tidak mengubah n8n.** |
| Executor | Antigravity | Mengerjakan task di batch aktif: hanya mengubah file di repo, commit, push |
| Owner | User | Memberi perintah ke masing-masing agent, menyetujui perubahan production |

## Siklus

1. Claude menulis `docs/handoff/<BATCH>.md` (mis. `SEC-1.md`) lalu push.
2. User → Antigravity: **"Kerjakan docs/handoff/<BATCH>.md, ikuti docs/handoff/README.md dan AGENT.md"**.
3. Antigravity:
   - mengerjakan task **berurutan**, **1 task = 1 commit** (`<type>: <deskripsi>` Bahasa Indonesia, sebut ID task, mis. `fix(sec): SEC-1.3 hapus aktivasi dari browser`);
   - setelah tiap task: `cd client && npx vitest run && npm run build` (dan `npm run lint` jika sudah ada);
   - menulis `docs/handoff/<BATCH>-report.md` (format di bawah) lalu push.
4. User → Claude: **"Review <BATCH>"**.
5. Claude review → hasilnya: batch berikutnya (`<BATCH+1>.md`) berisi perbaikan temuan + task baru.

## Aturan untuk Executor

- Kerja di branch `claude/eloquent-tesla-f0ddcr`. Jangan push ke `main`.
- **Jangan** menjalankan migration ke Supabase, Vercel, atau secret apa pun. Cukup tulis file migration/kode; penerapan & verifikasi live dilakukan Claude.
- 🚫 **n8n dilarang disentuh, oleh siapa pun.** Instance n8n dan workflow-nya masih dipakai Portal Warga yang sudah LIVE di repo lain. Membaca definisi workflow sebagai referensi boleh; mengubah, menonaktifkan, atau menyentuh kredensial/path webhook-nya tidak boleh. `api/n8n.js` di repo ini juga jangan diubah tanpa persetujuan eksplisit user.
- Jangan mengubah hal di luar task. Jangan install package kecuali task memintanya (sebut alasan di commit).
- Jangan menulis secret/API key/token ke kode, `VITE_*`, atau commit.
- Jika ada keputusan yang tidak jelas: **jangan menebak**. Tulis di `questions.md`, lewati bagian itu, lanjutkan task lain.
- Ikuti konvensi kode yang ada (lihat file sekitar). Kode aktual > dokumen.

## Format `<BATCH>-report.md`

```md
# <BATCH> Report
| Task | Commit | Status | Catatan |
|---|---|---|---|
| SEC-1.1 | abc1234 | done / partial / skipped | ... |

## Output verifikasi
- vitest: <ringkasan, mis. 34 files / 590 tests passed>
- build: ok / gagal (tempel error)
- lint: ok / belum ada / gagal

## Perubahan sensitif (perlu review ekstra)
- migration / RLS / grant / Edge Function pembayaran: <daftar file>

## Asumsi yang diambil
- ...
```

## File di folder ini

- `<BATCH>.md` — batch tugas (aktif: lihat paling baru).
- `<BATCH>-report.md` — laporan executor.
- `BACKLOG.md` — rencana batch berikutnya (belum untuk dikerjakan).
- `questions.md` — pertanyaan terbuka dari executor untuk orchestrator/user.
