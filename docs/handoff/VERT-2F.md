# VERT-2F — Perbaikan test SQL VERT-2

Dasar: review `VERT-2-review.md`. Ketiga migration VERT-2 **benar dan tidak diubah**. Yang salah hanya dua file test SQL, yang akan gagal sejak langkah persiapan data bila dijalankan.

- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah tiap commit.
- Hanya mengubah dua file di bawah. Jangan mengubah migration mana pun, `client/`, `api/`, `legacy-backend/`, `.env*`.
- Jangan menjalankan SQL ke Supabase mana pun. Contoh pola yang benar: `supabase/tests/tenant_events_matrix.sql` (±78-90: insert `auth.users`; ±141-144: konteks JWT).

## VERT-2F.1 — `supabase/tests/arisan_auto_enroll_matrix.sql`
1. `tenants.owner_id` dan `tenant_members.user_id` punya FK ke `auth.users`. Sebelum insert tenant, masukkan keempat user uji (`v_owner_arisan`, `v_member_1`, `v_member_2`, `v_member_rtrw`) ke `auth.users (id, email, aud, role)` dengan email `...@test.invalid`, seperti `tenant_events_matrix.sql` ±78.
2. `SELECT unit_slot_id INTO v_participant.unit_slot_id` (TEST 1 dan TEST 3) memakai field dari RECORD yang belum terisi, sehingga error. Tambahkan variabel `v_slot BIGINT`, lalu `SELECT unit_slot_id INTO v_slot ...` dan bandingkan `v_slot`. TEST 6 (`SELECT unit_slot_id, has_won INTO v_participant`) sudah benar, biarkan.
- Commit: `test(arisan): VERT-2F.1 perbaiki fixture auth.users dan variabel di test auto-enroll`

## VERT-2F.2 — `supabase/tests/arisan_operator_matrix.sql`
1. Masukkan `v_owner_user_id` dan `v_peserta_user_id` ke `auth.users` sebelum insert tenant.
2. Insert ke `tenants` otomatis membuat baris `tenant_members` untuk owner (trigger), jadi insert owner manual (langkah 2) melanggar `uq_tenant_members_tenant_user`. Hapus insert itu; ambil ID-nya: `SELECT id INTO v_owner_member_id FROM public.tenant_members WHERE tenant_id = v_tenant_id AND user_id = v_owner_user_id;` (hapus nilai default `gen_random_uuid()` dari deklarasinya).
3. `billing_items` **tidak punya kolom `title`**. Hapus kolom itu dari insert (langkah 5).
4. Trigger `trg_billing_items_arisan_readiness` memanggil `check_arisan_round_readiness`, yang menolak (`42501`) bila tidak ada konteks auth. Sebelum fixture (langkah 1), set `PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);`. Konteks owner di TEST 1 tetap seperti sekarang.
5. Insert manual ke `arisan_participants` (langkah 3) boleh tetap ada (`ON CONFLICT ... DO UPDATE`), karena peserta juga dibuat otomatis oleh trigger VERT-2.2.
- Commit: `test(arisan): VERT-2F.2 perbaiki fixture test operator kocok`

## Penutup
- Perbarui `docs/handoff/VERT-2-report.md`: tambah baris VERT-2F.1 dan VERT-2F.2 beserta hash commit-nya.
- Di ringkasan akhir, sebutkan bahwa test SQL belum dijalankan (tidak ada akses database dari perangkat ini).
