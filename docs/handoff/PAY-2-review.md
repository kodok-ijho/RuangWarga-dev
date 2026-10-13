# PAY-2 Review (Claude, 2026-10-09)

Commit yang direview: `a473024..0361a61` (6 task + laporan).

## Verifikasi ulang oleh Claude
| Cek | Hasil |
|---|---|
| `npx vitest run` | 34 file / **600 test lulus** (laporan menyebut 597; selisih 3 test dari commit terakhir, tidak masalah) |
| `npm run build` | ok |
| `npm run lint` | exit 0 |
| Nomor rekening hardcode di `client/src` (non-test, non-mock) | bersih |
| 1 task = 1 commit, format pesan | ok |
| RLS `tenants` UPDATE di dev | hanya `is_platform_admin()` / `is_tenant_owner(id)` / `has_permission(id,'manage_settings')`. Warga biasa **tidak bisa** mengganti rekening. ✅ |

## Per task
| Task | Status | Catatan |
|---|---|---|
| PAY-2.1 | ⚠️ perlu perbaikan | Validasi sesuai spesifikasi. Tapi pola simpan bisa **menghapus seluruh settings tenant** (F10). |
| PAY-2.2 | ⚠️ ikut F10 | Kartu & `canEdit` ok. Kirim `tenantSettings` yang awalnya `{}` (lihat F10). |
| PAY-2.3 | ✅ | Rekening tampil, tombol salin berteks, form unggah tidak dirender bila rekening kosong, tombol submit ter-disable. Hardcode Palm Village dihapus. Minor: F13. |
| PAY-2.4 | ✅ | Temuan benar. Keputusan di bawah (F12). |
| PAY-2.5 | ✅ | Test validasi & render ada. Kurang test untuk F10 (ditambah di PAY-2F). |
| PAY-2.6 | ✅ | F8 beres, ada test trial / active-bekas-trial / kosong. |

## Temuan

### F10 — Simpan rekening bisa menghapus semua settings tenant (TINGGI)
`updateTenantProfileAndSettings` **menimpa** kolom `settings` utuh (bukan merge). `saveTenantBankAccount` menyusun `{...baseSettings, bank_account}`:
- `Settings.jsx` mengirim `tenantSettings` yang diinisialisasi `{}`. `{}` itu truthy, jadi fallback fetch di service tidak jalan. Kalau admin menekan simpan sebelum data termuat, atau pemuatan gagal dan `activeTenant` kosong, yang tersimpan hanya `{ bank_account }` → `invite_code`, `due_day`, skema IPL, dll. **hilang**.
- Di service sendiri, bila `fetchTenantDetails` gagal → `baseSettings = {}` → efek sama.
- Settings yang dimuat di awal bisa basi: perubahan admin lain di antara muat dan simpan ikut tertimpa.

### F11 — QRIS semua tenant masuk ke merchant DOKU Palm Village (TINGGI, sudah ada sebelum PAY-2)
`PaymentMatrix.jsx:123` `const canUseQris = true;` dan `NonIplIncomes.jsx` selalu menampilkan opsi QRIS. Keduanya memanggil `dataService.createQrisPayment` / `createNonIplQrisPayment` → proxy `api/n8n.js` → workflow n8n DOKU **milik Palm Village**, tanpa membawa tenant. Artinya warga tenant lain yang memilih QRIS membayar ke rekening Palm Village. Ini melanggar keputusan "uang warga masuk ke rekening tenant sendiri".
PAY-2.3 menghapus kata "Palm Village" dari label QRIS di `NonIplIncomes.jsx`, sehingga sekarang tujuan uangnya malah tidak terlihat sama sekali.
Perbaikan **tanpa menyentuh n8n**: QRIS hanya tampil untuk tenant yang secara eksplisit diizinkan (flag di settings), default mati.

### F12 — `invite_code` terbaca semua anggota (SEDANG) — keputusan Claude
Pilihan (a): pindahkan `invite_code` ke tabel terpisah yang hanya bisa dibaca owner / `manage_members` / platform admin; halaman join tetap memakai RPC `get_invite_details`. Butuh migration + perubahan alur join, jadi **tidak** di PAY-2F; masuk BACKLOG sebagai **SEC-3**. Risiko sementara rendah karena anggota baru tetap butuh approval.

### F13 — `NonIplIncomes.jsx` tetap menampilkan unggah bukti saat rekening kosong (RENDAH)
`PaymentFlowModal` sudah benar, tapi di `NonIplIncomes.jsx` input unggah & submit transfer tetap aktif walau rekening belum diisi. Samakan perilakunya.

### Catatan (tidak dikerjakan sekarang)
- Pemegang `manage_settings` (mis. bendahara) bisa mengganti rekening tujuan. Itu sesuai desain, tapi perubahan rekening sebaiknya tercatat (audit log) dan diberitahukan ke owner. Masuk BACKLOG.

## Hasil
PAY-2 **diterima dengan perbaikan**. F10, F11, F13 dikerjakan di `PAY-2F.md` **sebelum** PAY-1.
SEC-2 migration masih menunggu di-apply ke dev (lihat `SEC-2-review.md`).
