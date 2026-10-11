# SEC-4 Review (Claude, 2026-10-11)

Commit yang direview: `3874569..44d4b7e` (2 commit task + 1 laporan). Hash di laporan cocok ✅. Tidak ada perubahan frontend, `api/`, `supabase/functions`, atau `legacy-backend/`.

| Cek | Hasil |
|---|---|
| Migration `202610120001_protect_builtin_roles.sql` | Sesuai spesifikasi: `ALTER POLICY` untuk insert/update `tenant_roles` dan `tenant_role_permissions_modify`; `REVOKE UPDATE` + `GRANT UPDATE (name)`; blok ROLLBACK lengkap; tanpa `DROP` ✅ |
| Test `builtin_roles_matrix.sql` | 9 kasus sesuai tabel, tanpa kata `DELETE` ✅ — **ada 1 salah sintaks, lihat P1** |
| Laporan | Akurat: tidak mengklaim test SQL sudah dijalankan; vitest 692 lulus (tidak ada perubahan frontend). |

## Temuan
- **P1 — Salah sintaks di T4b (diperbaiki Claude).** Blok `BEGIN … EXCEPTION … ` ditutup `END IF;`, seharusnya `END;`, sehingga seluruh file gagal dikompilasi. Satu baris diperbaiki di repo (commit terpisah). Executor tidak bisa menjalankan SQL, jadi salah ketik seperti ini hanya tertangkap saat Claude menjalankan test.

## Penerapan ke Supabase dev (Claude)
1. **Sebelum migration**, potongan T1 dijalankan: `TEST 1 GAGAL: Manager bisa mengubah nama role Admin (row_count = 1)`. Celah N3 terbukti nyata. Semua di-rollback.
2. Migration diterapkan sebagai `protect_builtin_roles` (isi identik dengan file repo, tanpa `BEGIN/COMMIT` karena `apply_migration` sudah transaksional).
3. **Sesudah migration**, `builtin_roles_matrix.sql` lengkap → **`SEC-4 PASSED`** (T1–T9).
   - Termasuk T9: tenant baru yang dibuat user biasa tetap mendapat 2 role bawaan, dan role Admin mendapat 10 izin. Trigger `handle_new_tenant` tidak terganggu.
4. Diverifikasi:
   - policy tersimpan sesuai;
   - hak UPDATE kolom `tenant_roles`: `authenticated` hanya `name`, `anon` tidak ada, `service_role` tetap penuh.
5. Advisor keamanan: sama dengan sebelumnya, yaitu helper RLS + `get_invite_details` (disengaja) dan fungsi klien yang sudah dijaga `has_permission` sejak SEC-1. **Tidak ada temuan baru.**

## Catatan
- Keputusan sementara tetap berlaku: pemilik tenant juga tidak bisa mengubah role bawaan; hanya Platform Owner. Bisa dibuka kemudian (mis. izin `post_listing` untuk role Warga) lewat migration baru bila user memintanya.
- Belum dicakup dan tidak mendesak: pemegang `manage_tenant_users` masih bisa menugaskan dirinya ke role Admin lewat `tenant_members`. Ini sesuai desain sekarang (izin itu memang setara admin anggota), tetapi perlu dicatat saat audit vertikal.

## Hasil
SEC-4 **diterima dan sudah aktif di dev**. Batch keamanan & utang teknis fase A selesai. Batch berikutnya menunggu keputusan user tentang urutan fase B.
