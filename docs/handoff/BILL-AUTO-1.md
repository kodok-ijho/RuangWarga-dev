# BILL-AUTO-1: Terbitkan tagihan otomatis

Status: **disetujui user 2026-10-18**. Dikerjakan setelah RTRW-2.6. Menyentuh tagihan dan schema; setiap migration di-dry-run lalu diterapkan ke dev.

## Keputusan user
- RT/RW: tagih **semua rumah berstatus aktif**, termasuk rumah kosong. Rumah nonaktif tidak ditagih.
- Kos/Kontrakan: tagih hanya **kamar terisi** (kontrak masih berjalan). Nominal mengikuti kontrak.
- **Tanggal terbit terpisah dari jatuh tempo.** Contoh: terbit tanggal 1, jatuh tempo tanggal 10 (`due_day` yang sudah ada).
- Tombol terbit manual tetap ada.

## Requirement
1. Di Pengaturan Komunitas (`/t/:id/settings`) ada toggle **"Terbitkan tagihan otomatis"** dan pilihan **tanggal terbit** (1–28), disimpan di `tenants.settings` (`auto_billing_enabled`, `billing_issue_day`).
2. Setiap hari pukul 00:05 WIB, `pg_cron` memanggil fungsi database yang memproses tenant dengan toggle aktif dan `billing_issue_day` sama dengan hari ini (zona Asia/Jakarta), untuk periode bulan berjalan (`YYYY-MM`):
   - `rt_rw`: satu tagihan IPL per unit `status = 'active'`. Nominal = jumlah `ipl_components`, jatuh tempo = tanggal `due_day` bulan itu, `metadata.bill_type = 'ipl'`, `metadata.auto_generated = true`.
   - `kos`: memakai ulang RPC `auto_generate_kos_billing(period, tenant_id)` yang sudah ada.
   - Tipe lain (arisan, kelas): belum, dan dilewati.
3. **Idempoten.** Unit yang sudah punya tagihan periode itu dilewati (index unik `uq_billing_items_ipl_unit_period`). Menjalankan ulang tidak membuat tagihan ganda.
4. Tenant berstatus langganan `read_only` atau `suspended` tidak diproses.
5. **Riwayat** di tabel `billing_auto_runs`: tenant, periode, waktu, jumlah dibuat, jumlah dilewati, dan error. Bisa dibaca pengurus tenant itu (RLS), dan ditampilkan di Pengaturan.
6. Fungsi `SECURITY DEFINER` dengan `search_path` tetap, EXECUTE dicabut dari `anon`/`authenticated`. Hanya `pg_cron`/`service_role` yang memanggil.

## Task
| Task | Isi |
|---|---|
| BILL-AUTO-1.1 ✅ (`f165cd8`, terpasang di dev 2026-10-19 lewat SQL Editor) | Migration: aktifkan `pg_cron`; tabel `billing_auto_runs` + RLS; fungsi `run_auto_billing(p_today date default current_date)` + `generate_auto_bills_for_tenant`; jadwal `cron.schedule` harian 17:05 UTC (00:05 WIB). Test SQL matriks (rumah aktif/nonaktif, idempoten, read_only dilewati, tanggal bukan hari terbit dilewati). |
| BILL-AUTO-1.2 ✅ | UI di Pengaturan Komunitas: toggle, tanggal terbit, keterangan jatuh tempo, dan riwayat 6 penerbitan terakhir. Test. |
