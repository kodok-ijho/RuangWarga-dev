/**
 * tenantOperationalService.js — Barrel Export (DEBT-1.4)
 *
 * Layanan operasional generik multi-tenant untuk manajemen unit,
 * pengaturan tenant (komponen tagihan, rekening kas), billing, pembayaran,
 * keuangan, arisan, dan RBAC v2.
 *
 * Seluruh implementasi telah dimodularisasi ke dalam direktori `./tenant/`.
 * Dokumen bukti pengeluaran dan pembayaran dikelola di Cloudflare R2 via Edge Function
 * dengan path kanonikal yang divalidasi sebelum pembuatan signed URL.
 */

export * from './tenant/settings';
export * from './tenant/members';
export * from './tenant/billing';
export * from './tenant/payments';
export * from './tenant/finance';
export * from './tenant/arisan';
export * from './tenant/rbac';
export * from './tenant/announcements';
export * from './tenant/events';

