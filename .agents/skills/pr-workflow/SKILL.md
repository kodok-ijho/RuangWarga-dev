---
name: pr-workflow
description: >-
  Panduan workflow pembuatan branch, commit, push, dan Pull Request (PR) per-task
  sesuai standar RuangWarga. Aktifkan skill ini setiap kali menyelesaikan sebuah task
  atau hendak membuat commit dan PR ke repository RuangWarga-dev.
---

# PR & Git Workflow Skill

## Prinsip Utama
- **1 Task = 1 Commit / PR terpisah** agar mudah di-review dan di-revert jika terjadi kendala.
- **Jangan ubah file di luar scope task aktif.**
- **Repository target:** `https://github.com/kodok-ijho/RuangWarga-dev` (remote: `origin` / `dev`).
- **PERINGATAN KERAS:** JANGAN PERNAH push atau buat Pull Request ke `kodok-ijho/PortalWarga`. PortalWarga adalah repository asal yang bersifat read-only.

---

## Format Penamaan Branch

Format: `<type>/T<X.Y>-<deskripsi-singkat>`

Contoh:
- `feat/T1.1-tenant-subscription-tables`
- `feat/T2.1-auth-context-supabase`
- `fix/T5.1-read-only-guard-bypass`
- `docs/T0.1-audit-existing-code`

Tipe branch:
- `feat`: Fitur baru atau modul baru
- `fix`: Perbaikan bug
- `refactor`: Restrukturisasi kode tanpa mengubah fungsionalitas
- `docs`: Pembaruan dokumentasi
- `test`: Penambahan pengujian

---

## Konvensi Commit Message

Format:
```
<type>: <deskripsi singkat imperative>

- <detail perubahan 1>
- <detail perubahan 2>
- Task: T<X.Y> (Ref: requirement.md FR-<N>, specification.md §<M>)
```

Contoh:
```
feat: implementasi skema tabel tenant dan subscription

- Buat migration 202609120001_tenant_foundation.sql
- Tambahkan tabel tenants, tenant_subscriptions, tenant_subscription_blocks
- Pasang RLS dasar isolasi tenant
- Task: T1.1 (Ref: requirement.md FR-1, specification.md §2)
```

---

## Template Deskripsi Pull Request (PR)

Gunakan template ini saat membuat PR via GitHub MCP (`create_pull_request`):

```markdown
## Ringkasan Perubahan
Singkat dan jelas mengenai apa yang dilakukan pada task ini.

## Task ID & Dokumen Terkait
- **Task:** T<X.Y>
- **Requirement:** FR-<N> / NFR-<N>
- **Specification:** §<M>

## Detail Perubahan
- Perubahan 1...
- Perubahan 2...

## Verifikasi & Definition of Done
- [ ] Lulus kriteria DoD Phase <X> untuk task ini
- [ ] RLS diuji (jika ada perubahan skema database)
- [ ] Tidak merusak mode demo (jika menyentuh data layer)
- [ ] Build dan lint lolos tanpa error baru
```

---

## Alur Kerja Langkah demi Langkah

1. **Buat Branch Baru dari main:**
   ```bash
   git checkout main
   git pull dev main
   git checkout -b feat/TX.Y-deskripsi
   ```

2. **Eksekusi Task & Verifikasi:**
   - Jalankan perubahan kode sesuai task di `task.md`.
   - Pastikan pengujian dan linting aman.

3. **Stage & Commit:**
   ```bash
   git add <file-file-yang-diubah>
   git commit -m "<type>: <deskripsi>"
   ```

4. **Push ke Remote Dev:**
   ```bash
   git push dev feat/TX.Y-deskripsi
   ```

5. **Buat Pull Request:**
   - Gunakan GitHub MCP tool `create_pull_request` dengan:
     - `owner: "kodok-ijho"`
     - `repo: "RuangWarga-dev"` (WAJIB `RuangWarga-dev`, jangan pernah `PortalWarga`!)
     - `base: "main"`
     - `head: "feat/TX.Y-deskripsi"`
   - Atau sampaikan ringkasan ke user untuk review.

6. **Tandai Task Selesai di `task.md`:**
   - Ubah `- [ ] **TX.Y**` menjadi `- [x] **TX.Y**`.
