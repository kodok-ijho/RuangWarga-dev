# PAY-2F Review (Claude, 2026-10-10)

Commit yang direview: `f34cb2d..44408d1`.

## Verifikasi ulang oleh Claude
| Cek | Hasil |
|---|---|
| `npx vitest run` | 35 file / **611 test lulus** |
| `npm run build` / `npm run lint` | ok / exit 0 |
| `grep "canUseQris = true" client/src` | kosong |
| `api/n8n.js`, `dataService.js` | tidak berubah ✅ |

## Per task
| Task | Status | Catatan |
|---|---|---|
| PAY-2F.1 (F10) | ✅ | Settings selalu di-fetch ulang tepat sebelum simpan; fetch gagal / `settings` bukan objek → error, update tidak dipanggil. Tombol simpan ter-disable sebelum data termuat. Ada test. |
| PAY-2F.2 (F11) | ✅ | `isLegacyQrisEnabled()` default `false`. Semua jalur QRIS warga ter-gate: `ResidentPayModal`, `PaymentFlowModal` (default dari tenant aktif, bukan `true` lagi), `ManualPaymentModal` (tombol QRIS + tombol pembuka disabled bila `!canWrite && !canUseQris`), `NonIplIncomes` (opsi, blok, validasi submit). Langganan/iklan tidak tersentuh. |
| PAY-2F.3 (F13) | ✅ | Unggah bukti disembunyikan + submit disabled bila rekening kosong; `cash` staf tetap jalan. Ada test. |

## Data dev
- Supabase dev saat ini **belum punya tenant sama sekali** (`select count(*) from tenants` = 0), jadi belum ada yang perlu diberi flag.
- Saat Palm Village dimigrasikan lewat `migrate_legacy_portal_warga` (settings berisi `legacy_migrated: true`), flag QRIS **wajib** dipasang sesudahnya, kalau tidak QRIS warga Palm Village hilang:
  ```sql
  UPDATE public.tenants
     SET settings = settings || '{"legacy_qris_enabled": true}'::jsonb
   WHERE settings->>'legacy_migrated' = 'true';
  ```
  Dicatat juga di BACKLOG.

## Hasil
PAY-2F **diterima**. Batch berikutnya: **PAY-1** (`docs/handoff/PAY-1.md`).
