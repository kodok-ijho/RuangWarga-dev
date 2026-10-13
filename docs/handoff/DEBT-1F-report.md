# DEBT-1F Report — Pemulihan RBAC & Penutupan Fallback Mock

| Task | Commit | Status | Catatan |
|---|---|---|---|
| DEBT-1F.1 | b8b2c18 | done | Pulihkan `services/tenant/rbac.js` apa adanya dari commit `c48f8bf` sesuai header komentar dan kode asli `tenantOperationalService.js`. Tambah unit test `services/tenant/rbac.test.js` (5 test) memvalidasi skema Supabase: select `tenant_role_permissions` (bukan kolom `permissions` langsung), insert `tenant_roles` tanpa `permissions` lalu insert ke `tenant_role_permissions`, proteksi role admin (`is_owner_role: true`) pada update dan delete, serta validasi argumen `assignMemberRole(memberId, null)`. |
| DEBT-1F.2 | c68575e | done | Tutup fallback mock di `PaymentMatrix.jsx` (baris 1566: `IS_DEMO && status === 'paid'`) dan `PaymentVerification.jsx` (fungsi `resolveVerificationUnit` dan `resolveVerificationResident` hanya fallback ke `getUnitById`/`getProfileById` jika `isDemo = true`, selain itu `null`). Penanganan `null` diverifikasi aman di seluruh pemanggil (baris 330, 504, 692, 816, 920, 941, 1111) dengan optional chaining dan fallback teks. Unit test baru di `PaymentVerification.test.jsx` (8 test). |

---

## 1. Output compare_split.py

Verifikasi "pindah saja" sesuai ketentuan `DEBT-1F.md`:

```bash
git show c48f8bf:client/src/services/tenantOperationalService.js > /tmp/old.js
python3 docs/handoff/tools/compare_split.py /tmp/old.js client/src/services/tenant/*.js
```

**Output:**
```
OK: semua deklarasi identik
```
(Exit code: 0)

---

## 2. Bukti rbac.test.js Gagal pada d2f0211

### Cara Pengujian
Menjalankan `rbac.test.js` terhadap implementasi `client/src/services/tenant/rbac.js` versi `d2f0211`:
```bash
git checkout d2f0211 -- client/src/services/tenant/rbac.js
cd client && npx vitest run src/services/tenant/rbac.test.js
```

### Hasil pada d2f0211 (5 GAGAL):
```
 ❯ src/services/tenant/rbac.test.js (5 tests | 4 failed)
   ❯ tenant/rbac - Unit Tests (DEBT-1F.1) (5 tests | 4 failed)
     × fetchTenantRoles > memuat relasi tenant_role_permissions, tidak memuat kolom permissions di tenant_roles, dan memetakan permission_key
       AssertionError: expected query to contain 'tenant_role_permissions'
       Received: "id, name, is_base_role, permissions, updated_at, tenant_members(count)"
     × createTenantRole > insert ke tenant_roles tanpa kolom permissions, lalu insert ke tenant_role_permissions
       AssertionError: expected { ... } to not have property "permissions"
     × updateTenantRole dan deleteTenantRole proteksi role bawaan > updateTenantRole melempar error dan TIDAK memanggil .update jika is_owner_role: true
       AssertionError: expected to throw matching /Role bawaan/ but did not throw protection error
     × deleteTenantRole melempar error dan TIDAK memanggil .delete jika is_owner_role: true
     × assignMemberRole > melempar error jika tenantRoleId kosong atau null
       AssertionError: expected to throw 'Member ID dan Tenant Role ID wajib disertakan.' but got 'TypeError: fetch failed' (mencoba request network)
```

### Hasil Setelah Pemulihan (Commit b8b2c18):
```
 ✓ src/services/tenant/rbac.test.js (5 tests) 53ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

---

## 3. Output Pengujian & Build

- **vitest:** 44 test files lulus, **692 tests passed** (0 failed).
- **build:** OK (`npm run build` di `client/` selesai dalam 18 detik).
  - Bundle produksi `dist/assets/index-B-aLhy6r.js` bersih dari mock data (`grep -l "Ibu Ratna" client/dist/assets/index-*.js` exit 1 / kosong).
  - `mockData` terpisah di chunk tersendiri `dist/assets/mockData-CtbIoGfl.js`.
- **lint:** OK (`npm run lint` di `client/` exit 0, tanpa error maupun warning).
- **Batasan Terjaga:**
  - Tanpa migrasi database.
  - File `api/n8n.js`, `supabase/`, `legacy-backend/`, dan `client/src/services/dataService.js` tidak disentuh.
