# DEBT-1F — Pulihkan RBAC & tutup fallback mock

Baca `docs/handoff/README.md`, AGENT.md, dan `DEBT-1-review.md` (N1, N2) dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit; test ikut di commit task-nya. Tanpa migration.
🚫 Jangan sentuh `api/n8n.js`, `supabase/`, `legacy-backend/`, maupun `services/dataService.js`.

---

## DEBT-1F.1 — Pulihkan `services/tenant/rbac.js` apa adanya (N1)  ⚠️ BLOKER

**Isi file**
`rbac.js` = header komentar modul + `import { supabase, IS_DEMO } from './shared';` + **salinan persis** bagian RBAC dari file lama, mulai baris `// RBAC v2: MANAJEMEN ROLE & PERMISSION` sampai akhir file:
```bash
git show c48f8bf:client/src/services/tenantOperationalService.js | sed -n '/^\/\/ RBAC v2: MANAJEMEN ROLE/,$p'
```
- Jangan mengubah satu baris pun: nama, teks error, data mock, query, dan komentar tetap sama.
- Jangan menambah `eslint-disable`; lint sudah lolos tanpa itu.

**Wajib dijalankan dan output-nya ditempel di laporan:**
```bash
git show c48f8bf:client/src/services/tenantOperationalService.js > /tmp/old.js
python3 docs/handoff/tools/compare_split.py /tmp/old.js client/src/services/tenant/*.js
# harus: "OK: semua deklarasi identik" (exit 0)
```

**Test baru `services/tenant/rbac.test.js`**
Mock `supabaseClient` dengan pola yang sama seperti `tenantOperationalService.test.js`, dan pakai tenant ID non-demo (UUID). Test ini harus **gagal** pada versi `rbac.js` di `d2f0211` dan lulus setelah pemulihan.
- `fetchTenantRoles`: string select memuat `tenant_role_permissions` dan **tidak** memuat kolom `permissions` di `tenant_roles`. Hasil `permissions` dipetakan dari `permission_key`.
- `createTenantRole(tenantId, { name, permissions: ['view_reports'] })`:
  - insert ke `tenant_roles` tanpa field `permissions`;
  - lalu insert ke `tenant_role_permissions` dengan `{ tenant_role_id, permission_key }`.
- `updateTenantRole` dan `deleteTenantRole` pada role dengan `is_owner_role: true`:
  - melempar error;
  - tidak memanggil `.update` / `.delete` pada `tenant_roles`.
- `assignMemberRole(memberId, null)` melempar error (perilaku lama).

## DEBT-1F.2 — Tutup fallback mock tanpa penjaga (N2, dari tabel audit DEBT-1.3)
- `pages/PaymentMatrix.jsx` ±1566: `propPayment || (IS_DEMO && status === 'paid' ? getPaymentForBill(bill.id) : null)`.
- `pages/PaymentVerification.jsx` ±297 `getUnit` dan ±301 `getResident`: fallback mock hanya bila `IS_DEMO`; selain itu `null`.
- Periksa setiap pemakai `getUnit(...)` / `getResident(...)` di file itu (±330, ±504, ±692, ±816, ±920, ±941, ±1111), dan pastikan nilai `null` tidak membuat crash (`unit ? … : ''`, `?.`).
- Test: dengan `IS_DEMO = false`, ID unit/profil yang tidak ada di daftar → `null`, bukan data mock. Bila fungsi ini perlu diekstrak agar bisa dites, ekstrak sebagai fungsi murni kecil di file yang sama atau di `services/`.

---

## Definition of Done
- `DEBT-1F-report.md` dengan hash commit benar dan output `compare_split.py` (OK).
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau.
- `rbac.test.js` dibuktikan gagal pada `d2f0211`: tulis di laporan cara mengeceknya, mis. `git stash` / checkout sementara file lama, jalankan test, lalu kembalikan.
- Tidak ada perubahan di `api/`, `supabase/`, `legacy-backend/`, maupun `services/dataService.js`.
