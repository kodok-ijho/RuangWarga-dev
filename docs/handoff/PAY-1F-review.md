# PAY-1F Review (Claude, 2026-10-10)

Commit yang direview: `5ee8da2..2d9009b`. Hash di laporan **cocok** dengan branch ✅.

## Verifikasi ulang
| Cek | Hasil |
|---|---|
| `npx vitest run` | **626 test lulus** |
| `npm run build` / `npm run lint` | ok / exit 0 |
| n8n (`api/n8n.js`, `dataService.js`) | tidak berubah ✅ |
| `memberRow.role` / `tenant_subscription_blocks` di `supabase/functions` | kosong ✅ |

## Per temuan PAY-1
| Temuan | Status | Catatan |
|---|---|---|
| G1 skema langganan | ✅ | Kolom `period_id`, `payment_gateway_ref`, `payment_method`; CHECK izinkan `settled`. |
| G2 hak akses | ✅ | Lewat RPC dengan JWT pemanggil: langganan = owner/platform admin; iklan = pemasang/owner/`post_listing`/platform admin. |
| G3 blok sebelum bayar | ✅ | Pesanan blok di `metadata`, diterapkan di `activate_tenant_subscription` setelah lunas, kolom benar. |
| G4 nominal | ✅ | Nominal dari respons query DOKU (wajib ada) = `amount + metadata.qris_fee`; metadata digabung, tidak ditimpa. |
| G5 auth webhook | ✅ | Token `?token=` di URL notifikasi, `timingSafeEqual`. |
| G6 status lunas | ✅ | `isQrisPaid`: `responseCode` `200…` **dan** `latestTransactionStatus === '00'`. |
| G7 `expires_at` | ✅ | `DROP NOT NULL` di migration 002. |
| G8 kecil | ✅ | `DOKU_PLATFORM_BASE_URL` wajib; `checkListingExpirations` frontend dihapus. |

## Apply ke Supabase dev
| Migration | Status |
|---|---|
| `202610100001_listing_status_pending_payment` | ✅ diterapkan Claude |
| `202610100002_listing_pay_first` | ✅ diterapkan Claude (2 `DROP POLICY IF EXISTS` dilewati — kedua policy tidak ada di dev, hasil sama). Dicek: default `pending_payment`, `expires_at` nullable, policy `public_listings_select` ada (F9 beres), `activate_listing_payment` hanya service_role. |
| `202610100003_align_subscription_payments` | ✅ kolom + index + CHECK `settled` diterapkan Claude; fungsi `activate_tenant_subscription` dijalankan user di SQL Editor (konektor memblokir `DELETE`). Dicek: fungsi baru aktif, hanya service_role. |

### Test database (`billing_columns_matrix.sql`) di dev, 2026-10-10
- **T1–T9 lulus**, plus 2 cek tambahan Claude: T8B (tipe listing `pending_payment` masih boleh diubah) dan T9B (anon melihat listing `active` yang belum kedaluwarsa). Semua data uji ter-rollback.
- Bug di test: T8 memakai `listing_type` `'house_sale'` yang tidak ada (enum hanya `room_vacancy, umkm`) — diperbaiki Claude jadi `'umkm'`.
- **T10 lulus** + T10A (payment tanpa `period_id` ditolak) + T10B (panggil ulang idempotent, masa aktif tidak bertambah) + blok trial terganti (bukan bertumpuk). Bug test: insert `subscription_periods(name, ...)` — kolom `name` tidak ada; diperbaiki Claude.
- `get_advisors(security)`: tidak ada temuan baru.

## Catatan untuk batch berikutnya (tidak memblokir)
- **Kunci baris saat aktivasi:** `activate_tenant_subscription` dan `activate_listing_payment` membaca payment tanpa `FOR UPDATE`. Dua notifikasi DOKU bersamaan untuk payment yang sama bisa lolos cek `pending` berdua dan memperpanjang dua kali. Tambahkan `SELECT ... FOR UPDATE` (migration baru).

## Hasil
PAY-1F **diterima**. PAY-1 **selesai dan terpasang di dev** (semua migration + T1–T10 lulus). Deploy Edge Function & uji sandbox tetap menunggu akun DOKU platform.
