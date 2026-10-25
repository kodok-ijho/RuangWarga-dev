# KOS-2 Review (Claude, 2026-10-25)

Hasil: **frontend diterima; migration BELUM boleh diterapkan.** Ada 1 celah kritis, 1 regresi keamanan, dan 1 risiko tagihan ganda pada data dev yang sudah ada. Semuanya diperbaiki di `KOS-2F.md`. Kedua migration belum terpasang di mana pun, sehingga bisa diperbaiki langsung di filenya.

## Verifikasi
- **Cek otomatis** di HEAD `53c2345`: lint bersih, build sukses, vitest **97 file, 1265/1265 lolos** di `TZ=UTC` dan `TZ=Asia/Jakarta`.
- **Database dev** (hanya-baca):
  - `kos_contracts` belum ada;
  - riwayat migration berakhir di `arisan_transparent_draw`.

## Temuan

| ID | Tingkat | Temuan |
|---|---|---|
| K1 | **KRITIS** | `generate_kos_contract_bills(p_today, p_tenant_id)` (`202610240002` baris 230):<br>• `SECURITY DEFINER` tanpa cek izin apa pun, tetapi di-GRANT ke `authenticated` (baris 649);<br>• akibatnya siapa pun yang login bisa memanggilnya dengan `p_tenant_id` tenant lain, atau NULL untuk semua tenant, dan `p_today` di masa depan (mis. `2030-01-01`);<br>• fungsi lalu menerbitkan tagihan sewa bertahun-tahun ke depan untuk semua kontrak aktif di semua kos.<br>Frontend tidak memanggil fungsi ini langsung. |
| K2 | **TINGGI** (regresi) | Wrapper `auto_generate_kos_billing` (baris 370) membuang cek izin versi lama:<br>• versi lama: `service_role`; `p_tenant_id` NULL hanya untuk platform admin; selain itu wajib `generate_billing`;<br>• versi baru: siapa pun yang login bisa memicu penagihan tenant mana pun;<br>• validasi format `p_period` juga hilang.<br>Frontend memanggil fungsi ini (`billing.js` ±997), jadi GRANT ke `authenticated` tetap perlu. |
| K3 | **TINGGI** | **Tagihan ganda setelah backfill.** Contoh di dev: **INDI KOS, Kamar 01** (unit 73) berstatus `occupied`, `contract_start` 2026-10-01, dan punya tagihan `2026-10` `pending_verification` tanpa `contract_id`.<br>• Backfill 7.1 membuat kontrak aktif mulai 2026-10-01.<br>• Cek idempoten di `generate_kos_contract_bills` (baris 298) hanya melihat `contract_id + service_start`.<br>• Akibatnya run harian berikutnya menerbitkan tagihan Oktober **kedua** untuk kamar yang sama.<br>Berlaku untuk setiap kamar hasil backfill yang sudah punya tagihan model lama. |
| K4 | SEDANG | Blok kos di `run_auto_billing` (baris 618) menulis satu baris `billing_auto_runs` per tenant kos **setiap hari**, termasuk yang 0 tagihan. Riwayat "6 penerbitan terakhir" di Pengaturan akan penuh baris kosong. |
| K5 | SEDANG | `countOccupiedUnits` (`finance.js` ±753) untuk kos hanya memakai daftar kontrak bila array tersedia, termasuk `[]`:<br>• RLS `kos_contracts` hanya mengizinkan penyewa membaca kontraknya sendiri;<br>• pemanggil menelan galat menjadi `[]` (`.catch(() => [])`);<br>• akibatnya bagi penyewa, atau saat fetch gagal, semua kamar lain terhitung kosong.<br>Padahal `tenant_units.status` kini dijamin sinkron dengan kontrak oleh trigger dan terbaca semua anggota. |
| K6 | RENDAH | Guard `trg_guard_kos_room_status_change` hanya `BEFORE UPDATE OF status`. INSERT kamar kos langsung berstatus `occupied` tanpa kontrak masih lolos, misalnya lewat impor/API oleh pemegang `manage_settings`. |
| K7 | RENDAH | `checkout_kos_room` (baris 438): `end_date = LEAST(…, checkout)`. Bila tanggal checkout lebih awal dari `start_date`, `end_date < start_date` melanggar CHECK, sehingga checkout gagal dengan error mentah. |
| K8 | RENDAH | `assignRoomContract` (`billing.js` ±795) di mode non-demo masih menulis `tenant_units.metadata` dan `billing_items` langsung dari browser, tanpa kontrak. Fungsi ini tidak dipakai UI (kode mati), tetapi masih diekspor. |

## Yang sudah baik
- Unique parsial kontrak aktif per kamar dan per penyewa, trigger sinkron kamar, dan guard `occupied`/`vacant`.
- Flag `ruangwarga.kos_contract_sync` tidak bisa disetel klien lewat PostgREST.
- `create_kos_contract` memvalidasi kamar dan anggota milik tenant yang sama, status langganan, dan kamar `inactive`. Update `tenant_members.unit_id` di dalam fungsi lolos guard SEC-5 karena `is_billing_privileged()` (`current_user = postgres`), jadi bendahara yang hanya punya `generate_billing` tetap bisa membuat kontrak.
- Rumus periode dihitung dari `start_date` (tidak berantai), dengan clamp akhir bulan bawaan Postgres.
- RLS baca `kos_contracts`, dan DML dicabut dari `authenticated`.
- Frontend memakai RPC `create_kos_contract` (`CreateBillingModal`), membaca kontrak aktif per kamar, dan mendukung mode demo.

## Catatan, tidak wajib
- Trigger sinkron tidak menangani perubahan `unit_id`/`member_id` pada kontrak yang tetap `active`: kamar lama tidak dikosongkan. Tidak ada RPC yang mengubahnya, dan DML sudah dicabut dari klien.
- `create_kos_contract` tidak memeriksa `tenant_members.status`. Hal ini disengaja, karena alur KOS-2.7 membuat kontrak sebelum approval.
