# Pertanyaan Terbuka

Executor menulis pertanyaan di sini (jangan menebak). Orchestrator/user menjawab di bawahnya.

Format:
```
## [SEC-1.x] Judul singkat
Konteks: ...
Pilihan yang dipertimbangkan: ...
Jawaban: (diisi Claude/user)
```

---

## [SEC-1.4] Spesifikasi Event & Status Webhook Mayar
Konteks: Pada Edge Functions webhook (`verify-subscription-payment` dan `verify-listing-payment`), sistem mengecek event dan status untuk mengaktivasi pembayaran hanya ketika transaksi sukses.
Pilihan yang dipertimbangkan: Saat ini diimplementasikan allowlist fleksibel di bagian atas file:
- `SUCCESS_EVENTS = ["payment.received", "payment.settled", "payment.success", "payment_received", "payment_settled", "payment_success"]`
- `SUCCESS_STATUSES = ["paid", "settled", "success", "SUCCESS"]`
Apakah ada nama string event khusus lainnya dari webhook dashboard Mayar yang perlu dimasukkan atau dikunci?
Jawaban (Claude): Pertahankan allowlist sebagai konstanta, tapi aturan aktivasi diperketat di SEC-2.3: status WAJIB sukses, event harus kosong atau ada di allowlist, amount wajib ada & sama. Nama event final menunggu user mengirim **contoh payload webhook asli** dari dashboard Mayar (fitur test webhook) — setelah itu allowlist dikunci ke nilai persis tersebut di batch berikutnya.

## [PAY-1] Biaya QRIS 0,7% untuk langganan platform & iklan listing
Konteks: Alur QRIS warga yang sudah jalan (n8n DOKU) membebankan MDR 0,7% ke pembayar:
`fee = ceil(base * 0.007)`, `total = base + fee`.
Pilihan: (a) dibebankan ke tenant — tenant bayar Rp X + 0,7%; (b) ditanggung platform — tenant bayar tepat Rp X, margin platform berkurang 0,7%.
Catatan: hanya berlaku untuk langganan & iklan. Iuran warga tidak lewat QRIS platform (keputusan user: ke rekening tenant sendiri).
Jawaban (user, 2026-10-10): **(a) dibebankan ke tenant, tarif 0,75%** (bukan 0,7%). Rincian implementasi di PAY-1.md bagian 5.

## [PAY-1] Format DOKU_PLATFORM_PRIVATE_KEY
Konteks: Web Crypto di Deno hanya bisa mengimpor kunci privat PKCS#8 (`-----BEGIN PRIVATE KEY-----`).
Pilihan: kalau kunci dari DOKU berformat PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`), perlu dikonversi: `openssl pkcs8 -topk8 -nocrypt -in doku.pem -out doku-pkcs8.pem`.
Jawaban (user): (belum dijawab — cek baris pertama file kunci dari dashboard DOKU merchant PLATFORM yang baru, bukan punya Palm Village)

## [PAY-1] Path endpoint status/query QRIS SNAP DOKU
Konteks: Webhook tidak boleh dipercaya; sebelum aktivasi, status harus dikonfirmasi ulang ke DOKU.
Pilihan: ambil path dari dokumentasi DOKU, atau dari workflow n8n `PV API - Payments QRIS Status DOKU Production`.
Jawaban (Claude/user): (belum — Claude bisa membaca workflow n8n-nya saat review PAY-1)

## [SEC-2 review / F6] Apakah pasang iklan listing gratis 30 hari pertama?
Konteks: `createListing()` membuat listing langsung `active` dengan masa tayang 30 hari, tanpa bayar. Pembayaran saat ini hanya untuk perpanjangan dan featured. Trigger SEC-2.1 sudah membatasi maksimal 30 hari, jadi tidak bisa disalahgunakan lebih dari itu — tapi tetap gratis.
Pilihan: (a) memang gratis 30 hari pertama, bayar untuk perpanjang/featured — tidak perlu perubahan; (b) iklan wajib bayar dulu — listing dibuat dalam status belum tayang dan baru aktif setelah pembayaran DOKU lunas (dikerjakan bersama PAY-1).
Jawaban (user, 2026-10-09): **(b) iklan harus bayar dulu.** Listing baru berstatus `pending_payment` (nilai enum baru), tidak tampil publik, dan baru `active` setelah pembayaran DOKU lunas. Dikerjakan di **PAY-1.7**.

## [PAY-2.4] Audit Akses RLS `tenants.settings` & Kebocoran `invite_code`
Konteks: Policy RLS `tenants_select` pada `supabase/migrations/202609170006_refactor_rls_to_has_permission.sql`:
```sql
CREATE POLICY "tenants_select" ON public.tenants
  FOR SELECT USING (
    public.is_platform_admin()
    OR id IN (SELECT public.current_tenant_ids())
    OR owner_id = auth.uid()
  );
```
Fungsi `public.current_tenant_ids()` mengembalikan tenant_id semua anggota tenant aktif (`status = 'approved'`).
Temuan:
1. **Siapa saja yang bisa SELECT `tenants.settings`**:
   - Platform Admin (`public.is_platform_admin()`)
   - Tenant Owner (`owner_id = auth.uid()`)
   - **Seluruh anggota tenant yang berstatus 'approved'** (`id IN (SELECT public.current_tenant_ids())`), termasuk warga biasa, penyewa kos, siswa kelas, dan peserta arisan.
2. **Implikasi Kebocoran `invite_code`**: Kolom `tenants.settings` (JSONB) menyimpan `bank_account`, `due_day`, komponen/skema IPL, DAN `invite_code` (kode undangan pendaftaran anggota baru). Karena PostgreSQL RLS berada pada level baris (bukan level kolom), seluruh anggota biasa dapat membaca `invite_code` langsung dari tabel `tenants`.
3. **Pilihan yang dipertimbangkan untuk batch berikutnya**:
   - (a) Pisahkan `invite_code` ke tabel khusus atau kolom privat terpisah yang hanya bisa di-SELECT oleh pengelola yang memiliki hak akses `manage_members` / owner / platform admin.
   - (b) Pisahkan `tenants.settings` menjadi `public_settings` (rekening bank, tata tertib publik) dan `private_settings` / fungsi RPC dengan security definer khusus admin.
Jawaban (Claude, 2026-10-09): **(a)** — `invite_code` dipindah ke tabel terpisah yang hanya terbaca owner / `manage_members` / platform admin; halaman join tetap lewat RPC `get_invite_details`. Dikerjakan di batch **SEC-3** (lihat BACKLOG), bukan di PAY-2F.


