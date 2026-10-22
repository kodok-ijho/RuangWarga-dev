-- Test Suite: Program Documents Matrix (PANITIA-3.1)
-- Date: 2026-10-22
-- Ref: docs/handoff/PANITIA-3.md § PANITIA-3.1
--
-- File ini memvalidasi:
-- E1. is_valid_program_document_path: path {tenant}/programs/{acara}/{uuid}_nama.pdf valid; .. ditolak; segmen selain programs ditolak.
-- E2. Sekretaris (manage_programs) boleh can_upload_tenant_file('program_document', T); anggota biasa tidak.
-- E3.
--     - Anggota T boleh can_read_tenant_file('program_document', path) dan melihat 1 baris dokumen;
--     - anggota tenant lain tidak boleh membaca dan melihat 0 baris;
--     - path tidak valid ditolak.
-- E4. Sekretaris menyimpan baris dokumen. Path dengan tenant lain ditolak check_violation. Anggota biasa ditolak insufficient_privilege.
-- E5 (regresi).
--     - anggota tetap boleh unggah payment_proof;
--     - anggota tetap tidak boleh unggah expense_receipt;
--     - jenis tidak dikenal ditolak.
-- E6. Sekretaris menghapus baris dokumen dan berhasil. Anggota biasa menghapus, dan 0 baris terhapus.

BEGIN;

DO $$
DECLARE
  -- Auth User IDs
  v_user_owner_t   UUID := gen_random_uuid();
  v_user_sekretaris UUID := gen_random_uuid();
  v_user_m         UUID := gen_random_uuid();
  v_user_owner_t2  UUID := gen_random_uuid();
  v_user_x         UUID := gen_random_uuid();

  -- Tenant IDs
  v_tenant_t       UUID;
  v_tenant_t2      UUID;

  -- Roles
  v_base_role_t    UUID;
  v_base_role_t2   UUID;
  v_role_sekretaris UUID := gen_random_uuid();

  -- Member IDs
  v_member_sek     UUID := gen_random_uuid();
  v_member_m       UUID := gen_random_uuid();
  v_member_x       UUID := gen_random_uuid();

  -- Program IDs
  v_program_p      UUID := gen_random_uuid();
  v_program_p2     UUID := gen_random_uuid();

  -- Document IDs & Paths
  v_doc_uuid       UUID := gen_random_uuid();
  v_doc_id_e4      UUID := gen_random_uuid();
  v_doc_id_e6      UUID := gen_random_uuid();
  v_valid_path     TEXT;
  v_traversal_path TEXT;
  v_wrong_seg_path TEXT;
  v_other_t_path   TEXT;

  -- Assertion helpers
  v_count          INT;
  v_res_bool       BOOLEAN;
  v_caught         BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: PROGRAM DOCUMENTS MATRIX (PANITIA-3.1)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan auth users, tenants, roles, dan memberships...';

  -- 1. Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_user_owner_t,   'owner_t@test.invalid',      'authenticated', 'authenticated'),
    (v_user_sekretaris, 'sekretaris_t@test.invalid', 'authenticated', 'authenticated'),
    (v_user_m,         'anggota_m@test.invalid',    'authenticated', 'authenticated'),
    (v_user_owner_t2,  'owner_t2@test.invalid',     'authenticated', 'authenticated'),
    (v_user_x,         'anggota_x@test.invalid',    'authenticated', 'authenticated');

  -- 2. Tenants (jenis panitia)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Panitia Dies Natalis T', 'panitia', v_user_owner_t)
  RETURNING id INTO v_tenant_t;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_t;

  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Panitia Lomba T2', 'panitia', v_user_owner_t2)
  RETURNING id INTO v_tenant_t2;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_t2;

  -- 3. Base roles
  SELECT id INTO v_base_role_t
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_t AND is_base_role = true
  LIMIT 1;

  SELECT id INTO v_base_role_t2
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_t2 AND is_base_role = true
  LIMIT 1;

  -- 4. Role Sekretaris: manage_programs
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_role_sekretaris, v_tenant_t, 'Sekretaris Acara', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key) VALUES
    (v_role_sekretaris, 'manage_programs');

  -- 5. Memberships
  -- Sekretaris di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_sek, v_tenant_t, v_user_sekretaris, 'Siti Sekretaris', 'approved', false, v_role_sekretaris);

  -- M: Anggota biasa di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_m, v_tenant_t, v_user_m, 'Maya Anggota', 'approved', false, v_base_role_t);

  -- X: Anggota di T2 (tenant lain)
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_x, v_tenant_t2, v_user_x, 'Xavier Tenant Lain', 'approved', false, v_base_role_t2);

  -- 6. Programs
  INSERT INTO public.tenant_programs (id, tenant_id, name, status, start_date, created_by)
  VALUES (v_program_p, v_tenant_t, 'Pentas Seni 2026', 'planning', '2026-11-20', v_user_owner_t);

  INSERT INTO public.tenant_programs (id, tenant_id, name, status, start_date, created_by)
  VALUES (v_program_p2, v_tenant_t2, 'Acara T2', 'planning', '2026-12-01', v_user_owner_t2);

  -- Siapkan path dokumen uji
  v_valid_path     := v_tenant_t::text || '/programs/' || v_program_p::text || '/' || v_doc_uuid::text || '_proposal_final.pdf';
  v_traversal_path := v_tenant_t::text || '/programs/' || v_program_p::text || '/../' || v_doc_uuid::text || '_proposal.pdf';
  v_wrong_seg_path := v_tenant_t::text || '/announcements/' || v_program_p::text || '/' || v_doc_uuid::text || '_proposal.pdf';
  v_other_t_path   := v_tenant_t2::text || '/programs/' || v_program_p::text || '/' || v_doc_uuid::text || '_proposal.pdf';

  RAISE NOTICE '[SETUP] Selesai.';

  -- ==============================================================================
  -- TEST E1: is_valid_program_document_path
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST E1] Validasi is_valid_program_document_path...';

  -- E1.1 Path valid
  v_res_bool := public.is_valid_program_document_path(v_valid_path);
  ASSERT v_res_bool = true, 'E1.1 GAGAL: path valid ditolak oleh validator.';

  -- E1.2 Path dengan directory traversal '..' ditolak
  v_res_bool := public.is_valid_program_document_path(v_traversal_path);
  ASSERT v_res_bool = false, 'E1.2 GAGAL: path traversal diterima oleh validator.';

  -- E1.3 Segmen selain 'programs' ditolak
  v_res_bool := public.is_valid_program_document_path(v_wrong_seg_path);
  ASSERT v_res_bool = false, 'E1.3 GAGAL: path dengan segmen bukan programs diterima.';

  -- E1.4 Path NULL atau string acak ditolak
  ASSERT public.is_valid_program_document_path(NULL) = false, 'E1.4 GAGAL: path NULL diterima.';
  ASSERT public.is_valid_program_document_path('random/path/file.pdf') = false, 'E1.5 GAGAL: path acak diterima.';

  RAISE NOTICE '[TEST E1] LULUS: validator path berfungsi dengan benar.';

  -- ==============================================================================
  -- TEST E2: can_upload_tenant_file('program_document', T)
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST E2] Izin unggah dokumen acara can_upload_tenant_file...';

  -- E2.1 Sekretaris (manage_programs) boleh unggah dokumen di T
  PERFORM set_config('request.jwt.claim.sub', v_user_sekretaris::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res_bool := public.can_upload_tenant_file('program_document', v_tenant_t);
  ASSERT v_res_bool = true, 'E2.1 GAGAL: Sekretaris dengan manage_programs ditolak unggah dokumen.';

  -- E2.2 Anggota biasa tidak boleh unggah dokumen di T
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res_bool := public.can_upload_tenant_file('program_document', v_tenant_t);
  ASSERT v_res_bool = false, 'E2.2 GAGAL: Anggota biasa diizinkan unggah dokumen.';

  RAISE NOTICE '[TEST E2] LULUS: kontrol izin unggah dokumen acara sesuai spesifikasi.';

  -- ==============================================================================
  -- TEST E4: Sekretaris menyimpan baris dokumen & tolak path lintas-tenant
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST E4] Simpan baris dokumen acara & RLS insert...';

  -- E4.1 Sekretaris menyimpan baris dokumen yang valid
  PERFORM set_config('request.jwt.claim.sub', v_user_sekretaris::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.program_documents (
    id, tenant_id, program_id, doc_type, title, file_path, file_name, mime_type, file_size, uploaded_by
  ) VALUES (
    v_doc_id_e4, v_tenant_t, v_program_p, 'proposal', 'Proposal Pentas Seni 2026',
    v_valid_path, 'proposal_final.pdf', 'application/pdf', 1048576, v_user_sekretaris
  );

  SELECT count(*) INTO v_count
  FROM public.program_documents
  WHERE id = v_doc_id_e4;
  ASSERT v_count = 1, 'E4.1 GAGAL: Baris dokumen gagal disimpan oleh sekretaris.';

  -- E4.2 Path dengan tenant lain ditolak check_violation (chk_program_documents_path_owner)
  v_caught := false;
  BEGIN
    INSERT INTO public.program_documents (
      tenant_id, program_id, doc_type, title, file_path, file_name, mime_type, file_size, uploaded_by
    ) VALUES (
      v_tenant_t, v_program_p, 'rab', 'RAB Palsu',
      v_other_t_path, 'rab.pdf', 'application/pdf', 50000, v_user_sekretaris
    );
  EXCEPTION
    WHEN check_violation THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'E4.2 GAGAL: Path dengan tenant berbeda tidak ditolak check_violation.';

  -- E4.3 Anggota biasa ditolak simpan baris dokumen
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught := false;
  BEGIN
    INSERT INTO public.program_documents (
      tenant_id, program_id, doc_type, title, file_path, file_name, mime_type, file_size, uploaded_by
    ) VALUES (
      v_tenant_t, v_program_p, 'rundown', 'Rundown Maya',
      v_tenant_t::text || '/programs/' || v_program_p::text || '/' || gen_random_uuid()::text || '_rundown.pdf',
      'rundown.pdf', 'application/pdf', 50000, v_user_m
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'E4.3 GAGAL: Anggota biasa tidak ditolak saat mencoba insert program_documents.';

  RAISE NOTICE '[TEST E4] LULUS: Penyimpanan dokumen dan proteksi constraint path berhasil.';

  -- ==============================================================================
  -- TEST E3: can_read_tenant_file & SELECT dokumen
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST E3] Izin baca dokumen can_read_tenant_file & RLS SELECT...';

  -- E3.1 Anggota T boleh membaca file via can_read_tenant_file dan melihat 1 baris
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res_bool := public.can_read_tenant_file('program_document', v_valid_path);
  ASSERT v_res_bool = true, 'E3.1 GAGAL: Anggota tenant T ditolak membaca dokumen program_document.';

  SELECT count(*) INTO v_count
  FROM public.program_documents
  WHERE id = v_doc_id_e4;
  ASSERT v_count = 1, 'E3.1 GAGAL: Anggota tenant T tidak dapat melihat baris dokumen.';

  -- E3.2 Anggota tenant lain (X di T2) tidak boleh membaca dan melihat 0 baris
  PERFORM set_config('request.jwt.claim.sub', v_user_x::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res_bool := public.can_read_tenant_file('program_document', v_valid_path);
  ASSERT v_res_bool = false, 'E3.2 GAGAL: Anggota tenant lain diizinkan membaca program_document.';

  SELECT count(*) INTO v_count
  FROM public.program_documents
  WHERE id = v_doc_id_e4;
  ASSERT v_count = 0, 'E3.2 GAGAL: Anggota tenant lain dapat melihat baris dokumen via SELECT.';

  -- E3.3 Path tidak valid ditolak oleh can_read_tenant_file
  ASSERT public.can_read_tenant_file('program_document', v_traversal_path) = false,
    'E3.3 GAGAL: Path traversal diizinkan oleh can_read_tenant_file.';

  RAISE NOTICE '[TEST E3] LULUS: Hak baca dan isolasi tenant dokumen acara terverifikasi.';

  -- ==============================================================================
  -- TEST E5 (REGRESI): Hak jenis file lama tetap berlaku
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST E5] Uji regresi can_upload_tenant_file...';

  -- E5.1 Anggota tetap boleh unggah payment_proof
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res_bool := public.can_upload_tenant_file('payment_proof', v_tenant_t);
  ASSERT v_res_bool = true, 'E5.1 GAGAL: Anggota ditolak unggah payment_proof.';

  -- E5.2 Anggota tetap tidak boleh unggah expense_receipt
  v_res_bool := public.can_upload_tenant_file('expense_receipt', v_tenant_t);
  ASSERT v_res_bool = false, 'E5.2 GAGAL: Anggota biasa diizinkan unggah expense_receipt.';

  -- E5.3 Jenis file tidak dikenal ditolak
  v_res_bool := public.can_upload_tenant_file('unknown_type', v_tenant_t);
  ASSERT v_res_bool = false, 'E5.3 GAGAL: Jenis file tidak dikenal diizinkan unggah.';

  RAISE NOTICE '[TEST E5] LULUS: Hak unggah jenis file lama tetap terjaga (tidak ada regresi).';

  -- ==============================================================================
  -- TEST E6: Hapus dokumen acara
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST E6] Hapus baris dokumen program_documents...';

  -- Siapkan baris kedua untuk tes penghapusan
  PERFORM set_config('request.jwt.claim.sub', v_user_sekretaris::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.program_documents (
    id, tenant_id, program_id, doc_type, title, file_path, file_name, mime_type, file_size, uploaded_by
  ) VALUES (
    v_doc_id_e6, v_tenant_t, v_program_p, 'lpj', 'Draft LPJ Sementara',
    v_tenant_t::text || '/programs/' || v_program_p::text || '/' || gen_random_uuid()::text || '_lpj.pdf',
    'lpj.pdf', 'application/pdf', 200000, v_user_sekretaris
  );

  -- E6.1 Anggota biasa mencoba hapus -> 0 baris terhapus (karena RLS USING mengecek hak)
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('role', 'authenticated', true);

  DELETE FROM public.program_documents WHERE id = v_doc_id_e6;

  -- Pastikan dokumen masih ada
  SELECT count(*) INTO v_count FROM public.program_documents WHERE id = v_doc_id_e6;
  ASSERT v_count = 1, 'E6.1 GAGAL: Dokumen terhapus oleh anggota biasa.';

  -- E6.2 Sekretaris menghapus dokumen -> berhasil
  PERFORM set_config('request.jwt.claim.sub', v_user_sekretaris::text, true);
  PERFORM set_config('role', 'authenticated', true);

  DELETE FROM public.program_documents WHERE id = v_doc_id_e6;

  SELECT count(*) INTO v_count FROM public.program_documents WHERE id = v_doc_id_e6;
  ASSERT v_count = 0, 'E6.2 GAGAL: Dokumen gagal dihapus oleh sekretaris.';

  RAISE NOTICE '[TEST E6] LULUS: Penghapusan dokumen diuji dengan benar.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH PENGUJIAN MATRIX DOKUMEN ACARA (E1 - E6) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
