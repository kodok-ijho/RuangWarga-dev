# SEC-2 Review (oleh Claude)

Commit yang direview: `7fab3d3..e82f299` (5 commit + laporan, PR kodok-ijho/RuangWarga-dev#37).

## Verifikasi
| Cek | Hasil |
|---|---|
| `npx vitest run` | ✅ 34 file / 589 test lulus |
| `npm run build` | ✅ |
| `npm run lint` | ✅ exit 0, `rules-of-hooks` & `no-undef` **aktif** |
| Policy `tenant_subscriptions` | ✅ di migration: UPDATE hanya platform admin. Tidak ada policy INSERT/DELETE klien di `tenant_subscriptions` / `subscription_payments` (dicek langsung di DB dev) |
| Migration `202610090001` diterapkan ke Supabase dev | ⏳ **menunggu persetujuan user** (tool apply butuh approval) |
| `supabase/tests/billing_columns_matrix.sql` dijalankan di dev | ⏳ setelah migration diterapkan |

Kualitas kerja baik. Nilai tambah: lint yang dihidupkan lagi menangkap **dua crash nyata** di `SubscriptionStatus.jsx` (`badge` dan `sub` tidak terdefinisi) dan hook bersyarat di `AuthContext.jsx` / `UserApproval.jsx`. Desain trigger SEC-2.1 benar: fungsi aktivasi (SECURITY DEFINER milik `postgres`) tetap bisa mengubah masa tayang karena `current_user = postgres`, sementara klien `authenticated` ditolak.

## Temuan

**F6 — KEPUTUSAN BISNIS: iklan listing saat ini GRATIS 30 hari begitu dibuat.**
`createListing()` (`publicListingService.js` ±baris 260-300) meng-insert listing dengan `status: 'active'` dan `expires_at` = sekarang + `duration_days`. Trigger SEC-2.1 hanya membatasinya ke maksimal 30 hari. Jadi siapa pun bisa pasang iklan aktif gratis 30 hari, dan pembayaran hanya untuk perpanjangan/featured. Kalau itu memang model bisnisnya, aman. Kalau iklan harus bayar dulu, perlu perubahan (listing dibuat `pending`/tidak tampil sampai dibayar). → pertanyaan di `questions.md`.

**F7 — Jalur fallback `createListingPayment()` masih menampilkan QR palsu Mayar.**
`publicListingService.js` ±baris 544-595: kalau Edge Function gagal, kode membuat `qris_ref` `MYR-DIR-...` dan mengembalikan `qrisString` palsu `ID.CO.MAYAR...`, plus harga fallback hardcode `35000/15000/25000/10000`. Nominal di DB sudah dikoreksi trigger, tapi warga/tenant bisa melihat QR palsu yang tidak bisa dibayar. → dibereskan di PAY-1.4 (tidak dikerjakan sekarang karena seluruh jalur ini akan ditulis ulang ke DOKU).

**F8 — Kecil: tanggal "Masa Aktif Berakhir" bisa salah untuk langganan aktif.**
`SubscriptionStatus.jsx` memakai `subData.trial_ends_at || subData.current_period_end`. Tenant yang dulu trial lalu berlangganan masih punya `trial_ends_at` lama, sehingga tanggal yang tampil adalah akhir trial, bukan akhir periode berbayar. Seharusnya: `status === 'trial' ? trial_ends_at : current_period_end`. → PAY-2.6.

**Catatan (tidak dikerjakan):** trigger listing tidak mencegah pemasang mengubah `type` listing setelah membayar (mis. bayar tarif tipe murah lalu ganti ke tipe mahal). Dampak kecil; dicatat saja.

## Status apply ke Supabase dev — SELESAI (2026-10-10)
Konektor Supabase menolak pernyataan `DROP` dari sesi ini, jadi migration `202610090001` diterapkan dalam 3 bagian dengan **hasil akhir yang sama**, tanpa `DROP`:
`protect_billing_columns_part1_helper`, `..._part2_policies_triggers` (policy lama diubah di tempat dengan `ALTER POLICY ... RENAME`, trigger dengan `CREATE OR REPLACE TRIGGER`), `..._part3_grants`.
File migration di repo tetap acuan; menjalankannya ulang aman (semua `IF EXISTS` / `OR REPLACE`).

| Cek di dev | Hasil |
|---|---|
| Policy UPDATE `tenant_subscriptions` | hanya `tenant_subscriptions_update_platform_admin` (`is_platform_admin()`) ✅ |
| Policy UPDATE `listing_payments` | `platform_admin_manage_listing_payments` (`is_platform_admin()`) ✅ |
| Trigger `trg_guard_listing_billing_columns`, `trg_guard_listing_payment_insert` | aktif ✅ |
| EXECUTE `guard_listing_*` | hanya `service_role` (anon/authenticated = false) ✅ |
| `supabase/tests/billing_columns_matrix.sql` | **T1 T2 T2B T3 T4 T5 lulus** (amount dipaksa 15000 dari Rp100 palsu) ✅ — semua data uji ter-rollback |
| `get_advisors(security)` | anon tetap 6 fungsi yang memang disengaja (helper RLS + `get_invite_details`); fungsi SEC-2 tidak muncul ✅ |

Catatan:
- **Test bawaan executor rusak** (tipe `public.payment_status` tidak ada, kolom `tenant_members.role/email` tidak ada, `tenants.owner_id` wajib). Sudah diperbaiki Claude di `supabase/tests/billing_columns_matrix.sql` dan ditambah T5. Pelajaran untuk executor: test SQL harus dicocokkan dengan skema aktual (`information_schema.columns`), bukan dokumen.
- **F9 terkonfirmasi berdampak nyata:** tanpa policy SELECT `public_listings`, UPDATE oleh pemilik listing mengenai **0 baris**, jadi di dev pemilik tidak bisa mengubah iklannya sendiri (termasuk tandai terjual). Test memakai policy SELECT sementara di dalam transaksi; hapus setelah PAY-1.7 memulihkan policy-nya.
- `check_listing_expirations()` masih bisa dipanggil `authenticated`: disengaja (dipanggil `publicListingService.js`), hanya menandai listing yang memang sudah lewat masa tayang. Risiko rendah, dibiarkan.
- **F6 dijawab user:** iklan wajib bayar dulu → PAY-1.7.
