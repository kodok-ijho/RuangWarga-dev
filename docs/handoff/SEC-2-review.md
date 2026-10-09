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
