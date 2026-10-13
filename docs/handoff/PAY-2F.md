# PAY-2F — Perbaikan hasil review PAY-2

**Kerjakan sebelum PAY-1.** Baca `docs/handoff/PAY-2-review.md`, `README.md`, dan AGENT.md dulu.
Branch: `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. Tidak ada migration di batch ini.
🚫 n8n dan `api/n8n.js` tetap **tidak boleh disentuh**.

---

## PAY-2F.1 — Simpan rekening tidak boleh menghapus settings lain (F10)
`client/src/services/tenantOperationalService.js` `saveTenantBankAccount`:
- **Selalu** ambil settings terbaru lewat `fetchTenantDetails(tenantId)` tepat sebelum menyimpan. Hapus parameter `currentSettings` (atau abaikan) supaya pemanggil tidak bisa mengirim objek basi/kosong.
- Bila fetch gagal, atau hasilnya tidak punya objek `settings` → **lempar error** ("Gagal memuat pengaturan tenant, rekening tidak disimpan."). **Jangan** fallback ke `{}`.
- Mode demo (`IS_DEMO` / id `demo-*`) tetap jalan tanpa Supabase.

`client/src/pages/Settings.jsx`: berhenti mengirim `tenantSettings` ke `saveTenantBankAccount`. Selama data tenant belum termuat, tombol "Simpan Rekening" ter-disable.

Test (Vitest, mock Supabase):
- fetch gagal → error dilempar dan **update tidak dipanggil**;
- settings lama `{ invite_code, due_day, ipl_schemas }` + simpan rekening → payload update tetap memuat ketiganya plus `bank_account`.

## PAY-2F.2 — QRIS hanya untuk tenant yang diizinkan (F11)
Tujuan: warga tenant lain tidak bisa lagi membayar lewat QRIS n8n yang settle ke Palm Village.
- Tambah helper di `tenantOperationalService.js`: `isLegacyQrisEnabled(tenant)` → `true` hanya bila `tenant?.settings?.legacy_qris_enabled === true`. Default `false`.
- `client/src/pages/PaymentMatrix.jsx:123`: ganti `const canUseQris = true;` dengan helper tersebut untuk `activeTenant`.
- `client/src/pages/NonIplIncomes.jsx`: opsi `<option value="qris">` dan blok QRIS hanya dirender bila helper `true`. Validasi submit (±baris 127) juga harus menolak `qris` bila helper `false`.
- Cari pemanggil lain `createQrisPayment` / `createNonIplQrisPayment` / `QrisCheckoutModal` untuk pembayaran **warga** dan beri gate yang sama. Pembayaran langganan/iklan (`SubscriptionCheckout`, listing) **bukan** bagian task ini, jangan diubah.
- **Jangan** ubah `dataService.js` jalur n8n maupun `api/n8n.js`.
- Mode demo: tenant demo boleh `legacy_qris_enabled: true` di data mock supaya tampilan QRIS tetap bisa dicoba.
- Test: tenant tanpa flag → opsi QRIS tidak dirender dan `PaymentFlowModal` mulai di `bank_transfer`; tenant dengan flag → QRIS tampil.

Catatan untuk executor: flag `legacy_qris_enabled` pada tenant Palm Village di database di-set oleh **Claude** setelah review, bukan oleh executor.

## PAY-2F.3 — `NonIplIncomes.jsx` konsisten dengan modal (F13)
Bila `getTenantBankAccount(activeTenant)` `null` dan metode `bank_transfer`: jangan render input unggah bukti dan disable tombol submit, sama seperti `PaymentFlowModal`. Metode `cash` (staf) tetap jalan. Tambah satu test render.

---

## Definition of Done
- `PAY-2F-report.md` dengan hash commit tiap task.
- `npx vitest run`, `npm run build`, `npm run lint` hijau.
- `grep -n "canUseQris = true" client/src` → kosong.
- Tidak ada perubahan di `api/n8n.js` maupun fungsi path n8n di `dataService.js` (`git diff` harus menunjukkan itu).
