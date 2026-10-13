import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clampExpiresIn,
  parseInvokeError,
  uploadTenantFile,
  getTenantFileUrl,
} from './fileStorageService';
import { submitTenantPayment } from './tenant/payments';
import { createTenantExpense, updateTenantExpense } from './tenant/finance';
import { supabase } from './supabaseClient';

describe('STOR-1.4: fileStorageService & R2 Edge Function Integration', () => {
  let mockInvoke;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke = vi.fn();
    vi.spyOn(supabase, 'functions', 'get').mockReturnValue({
      invoke: (...args) => mockInvoke(...args),
    });
  });

  describe('clampExpiresIn', () => {
    it('menjepit durasi di atas 600 menjadi 600', () => {
      expect(clampExpiresIn(3600)).toBe(600);
      expect(clampExpiresIn(601)).toBe(600);
      expect(clampExpiresIn('1000')).toBe(600);
    });

    it('menjepit durasi di bawah 60 menjadi 60', () => {
      expect(clampExpiresIn(59)).toBe(60);
      expect(clampExpiresIn(0)).toBe(60);
      expect(clampExpiresIn(-100)).toBe(60);
    });

    it('mempertahankan nilai valid dalam rentang 60..600', () => {
      expect(clampExpiresIn(60)).toBe(60);
      expect(clampExpiresIn(300)).toBe(300);
      expect(clampExpiresIn(600)).toBe(600);
    });

    it('menggunakan default 300 jika tidak diberikan atau NaN', () => {
      expect(clampExpiresIn(undefined)).toBe(300);
      expect(clampExpiresIn(null)).toBe(300);
      expect(clampExpiresIn('')).toBe(300);
      expect(clampExpiresIn('invalid')).toBe(300);
    });
  });

  describe('parseInvokeError mapping', () => {
    it('memetakan status 413 ke pesan ramah batas 5 MB', async () => {
      const mockError = {
        status: 413,
        context: {
          status: 413,
          json: async () => ({ error: 'Payload too large' }),
        },
      };
      const parsed = await parseInvokeError(mockError);
      expect(parsed.message).toBe('Ukuran file melebihi batas 5 MB.');
      expect(parsed.status).toBe(413);
    });

    it('memetakan status 415 ke pesan format tidak didukung', async () => {
      const mockError = {
        context: {
          status: 415,
          json: async () => ({ error: 'Unsupported media type' }),
        },
      };
      const parsed = await parseInvokeError(mockError);
      expect(parsed.message).toBe('Format file tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.');
      expect(parsed.status).toBe(415);
    });

    it('memetakan status 403 ke pesan izin file', async () => {
      const mockError = {
        context: {
          status: 403,
          json: async () => ({ error: 'Forbidden' }),
        },
      };
      const parsed = await parseInvokeError(mockError);
      expect(parsed.message).toBe('Anda tidak memiliki izin untuk file ini.');
      expect(parsed.status).toBe(403);
    });

    it('memetakan status 401 ke pesan sesi berakhir', async () => {
      const mockError = {
        context: {
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        },
      };
      const parsed = await parseInvokeError(mockError);
      expect(parsed.message).toBe('Sesi login berakhir. Silakan masuk kembali.');
      expect(parsed.status).toBe(401);
    });

    it('menggunakan pesan dari server jika status selain di atas', async () => {
      const mockError = {
        context: {
          status: 400,
          json: async () => ({ error: 'Parameter tenantId tidak valid.' }),
        },
      };
      const parsed = await parseInvokeError(mockError);
      expect(parsed.message).toBe('Parameter tenantId tidak valid.');
      expect(parsed.status).toBe(400);
    });

    it('menggunakan fallback pesan jika context json gagal diparsing', async () => {
      const mockError = {
        status: 500,
        context: {
          status: 500,
          json: async () => {
            throw new Error('Not JSON');
          },
        },
        message: 'Internal server error',
      };
      const parsed = await parseInvokeError(mockError);
      expect(parsed.message).toBe('Internal server error');
      expect(parsed.status).toBe(500);
    });
  });

  describe('uploadTenantFile', () => {
    it('mengirim FormData lengkap untuk kind payment_proof', async () => {
      let passedFunctionName = '';
      let passedBody = null;

      mockInvoke.mockImplementation(async (fnName, options) => {
        passedFunctionName = fnName;
        passedBody = options.body;
        return {
          data: {
            path: '11111111-1111-1111-1111-111111111111/payments/22222222-2222-2222-2222-222222222222/1712345_proof.jpg',
            contentType: 'image/jpeg',
            size: 1024,
          },
          error: null,
        };
      });

      const file = new File(['dummy-bytes'], 'proof.jpg', { type: 'image/jpeg' });
      const path = await uploadTenantFile({
        kind: 'payment_proof',
        tenantId: '11111111-1111-1111-1111-111111111111',
        billingItemId: '22222222-2222-2222-2222-222222222222',
        file,
      });

      expect(passedFunctionName).toBe('storage-upload');
      expect(passedBody instanceof FormData).toBe(true);
      expect(passedBody.get('kind')).toBe('payment_proof');
      expect(passedBody.get('tenantId')).toBe('11111111-1111-1111-1111-111111111111');
      expect(passedBody.get('billingItemId')).toBe('22222222-2222-2222-2222-222222222222');
      expect(passedBody.get('file')).toBe(file);
      expect(path).toBe('11111111-1111-1111-1111-111111111111/payments/22222222-2222-2222-2222-222222222222/1712345_proof.jpg');
    });

    it('mengirim FormData lengkap untuk kind expense_receipt', async () => {
      let passedBody = null;
      mockInvoke.mockImplementation(async (_fnName, options) => {
        passedBody = options.body;
        return {
          data: {
            path: '11111111-1111-1111-1111-111111111111/expenses/2026/uuid_receipt.png',
            contentType: 'image/png',
            size: 2048,
          },
          error: null,
        };
      });

      const file = new File(['dummy-receipt'], 'receipt.png', { type: 'image/png' });
      const path = await uploadTenantFile({
        kind: 'expense_receipt',
        tenantId: '11111111-1111-1111-1111-111111111111',
        expenseDate: '2026-04-12',
        file,
      });

      expect(passedBody.get('kind')).toBe('expense_receipt');
      expect(passedBody.get('tenantId')).toBe('11111111-1111-1111-1111-111111111111');
      expect(passedBody.get('expenseDate')).toBe('2026-04-12');
      expect(path).toBe('11111111-1111-1111-1111-111111111111/expenses/2026/uuid_receipt.png');
    });

    it('melempar error jika data.path kosong dari server', async () => {
      mockInvoke.mockResolvedValue({ data: {}, error: null });

      await expect(
        uploadTenantFile({
          kind: 'expense_receipt',
          tenantId: '11111111-1111-1111-1111-111111111111',
          expenseDate: '2026-04-12',
          file: new File([''], 'receipt.png'),
        })
      ).rejects.toThrow('Gagal memproses file.');
    });

    it('mode demo tidak memanggil invoke dan mengembalikan mock path', async () => {
      const path = await uploadTenantFile({
        kind: 'payment_proof',
        tenantId: 'demo-tenant-1',
        billingItemId: 'demo-bill-1',
        file: new File([''], 'proof.jpg'),
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(path).toContain('demo-tenant-1/payments/demo-bill-1');
    });
  });

  describe('getTenantFileUrl', () => {
    it('memanggil storage-sign-url dengan body JSON dan expiresIn yang dijepit', async () => {
      let passedFunctionName = '';
      let passedBody = null;

      mockInvoke.mockImplementation(async (fnName, options) => {
        passedFunctionName = fnName;
        passedBody = options.body;
        return {
          data: { url: 'https://r2.ruangwarga.test/signed-link', expiresIn: 600 },
          error: null,
        };
      });

      const url = await getTenantFileUrl({
        kind: 'payment_proof',
        path: '11111111-1111-1111-1111-111111111111/payments/22222222-2222-2222-2222-222222222222/proof.jpg',
        expiresIn: 3600, // 3600 dijepit jadi 600
      });

      expect(passedFunctionName).toBe('storage-sign-url');
      expect(passedBody).toEqual({
        kind: 'payment_proof',
        path: '11111111-1111-1111-1111-111111111111/payments/22222222-2222-2222-2222-222222222222/proof.jpg',
        expiresIn: 600,
      });
      expect(url).toBe('https://r2.ruangwarga.test/signed-link');
    });

    it('melempar error jika data.url tidak dikembalikan server', async () => {
      mockInvoke.mockResolvedValue({ data: {}, error: null });

      await expect(
        getTenantFileUrl({
          kind: 'expense_receipt',
          path: '11111111-1111-1111-1111-111111111111/expenses/2026/file.png',
        })
      ).rejects.toThrow('Gagal memproses file.');
    });

    it('mode demo tidak memanggil invoke dan mengembalikan mock url', async () => {
      const url = await getTenantFileUrl({
        kind: 'payment_proof',
        path: 'demo-tenant/payments/bill/test.jpg',
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(url).toContain('https://demo.ruangwarga.test/');
    });
  });

  describe('Integrasi payments.js uploadTenantFile', () => {
    const TENANT_ID = '11111111-1111-1111-1111-111111111111';
    const BILL_ID = '22222222-2222-2222-2222-222222222222';

    it('mengirim kind payment_proof, tenantId, billingItemId, dan file ke uploadTenantFile', async () => {
      const billData = {
        id: BILL_ID,
        amount: 100000,
        late_fee: 0,
        member_id: 'member-1',
        status: 'unpaid',
      };

      let insertedPayload = null;

      vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            insert: (rows) => ({
              select: () => ({
                single: async () => {
                  insertedPayload = rows[0];
                  return { data: { id: 'pay-1', ...rows[0] }, error: null };
                },
              }),
            }),
          };
        }
        return {};
      });

      let passedUploadParams = null;
      mockInvoke.mockImplementation(async (fnName, opts) => {
        if (fnName === 'storage-upload') {
          passedUploadParams = {
            kind: opts.body.get('kind'),
            tenantId: opts.body.get('tenantId'),
            billingItemId: opts.body.get('billingItemId'),
            file: opts.body.get('file'),
          };
          return {
            data: { path: `${TENANT_ID}/payments/${BILL_ID}/171234_bukti.jpg` },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const testFile = new File(['bukti-transfer'], 'bukti.jpg', { type: 'image/jpeg' });
      await submitTenantPayment(TENANT_ID, {
        billId: BILL_ID,
        amount: 100000,
        method: 'bank_transfer',
        proofFile: testFile,
        isStaff: false,
      });

      expect(passedUploadParams).not.toBeNull();
      expect(passedUploadParams.kind).toBe('payment_proof');
      expect(passedUploadParams.tenantId).toBe(TENANT_ID);
      expect(passedUploadParams.billingItemId).toBe(BILL_ID);
      expect(passedUploadParams.file).toBe(testFile);
      expect(insertedPayload.proof_url).toBe(`${TENANT_ID}/payments/${BILL_ID}/171234_bukti.jpg`);
      expect(insertedPayload.metadata.proof_stored).toBe(true);
    });

    it('meneruskan error 413 dan 415 dengan pesan ramah untuk warga non-staf', async () => {
      const billData = {
        id: BILL_ID,
        amount: 100000,
        late_fee: 0,
        member_id: 'member-1',
        status: 'unpaid',
      };

      vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      // Simulasi 413
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          status: 413,
          context: {
            status: 413,
            json: async () => ({ error: 'File too large' }),
          },
        },
      });

      await expect(
        submitTenantPayment(TENANT_ID, {
          billId: BILL_ID,
          amount: 100000,
          method: 'bank_transfer',
          proofFile: new File(['x'.repeat(100)], 'large.jpg'),
          isStaff: false,
        })
      ).rejects.toThrow('Ukuran file melebihi batas 5 MB.');

      // Simulasi 415
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          status: 415,
          context: {
            status: 415,
            json: async () => ({ error: 'Unsupported media type' }),
          },
        },
      });

      await expect(
        submitTenantPayment(TENANT_ID, {
          billId: BILL_ID,
          amount: 100000,
          method: 'bank_transfer',
          proofFile: new File(['x'.repeat(100)], 'bad.exe'),
          isStaff: false,
        })
      ).rejects.toThrow('Format file tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.');
    });

    it('melempar pesan default Bukti transfer gagal diunggah untuk error upload server lainnya', async () => {
      const billData = {
        id: BILL_ID,
        amount: 100000,
        late_fee: 0,
        member_id: 'member-1',
        status: 'unpaid',
      };

      vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          status: 500,
          context: {
            status: 500,
            json: async () => ({ error: 'R2 connection timeout' }),
          },
        },
      });

      await expect(
        submitTenantPayment(TENANT_ID, {
          billId: BILL_ID,
          amount: 100000,
          method: 'bank_transfer',
          proofFile: new File(['x'], 'bukti.jpg'),
          isStaff: false,
        })
      ).rejects.toThrow('Bukti transfer gagal diunggah. Coba lagi.');
    });

    it('fallback proof_url kosong untuk staf jika upload gagal', async () => {
      const billData = {
        id: BILL_ID,
        amount: 100000,
        late_fee: 0,
        member_id: 'member-1',
        status: 'unpaid',
      };

      let insertedPayload = null;

      vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            insert: (rows) => ({
              select: () => ({
                single: async () => {
                  insertedPayload = rows[0];
                  return { data: { id: 'pay-staff-1', ...rows[0] }, error: null };
                },
              }),
            }),
          };
        }
        return {};
      });

      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          status: 500,
          context: { status: 500, json: async () => ({ error: 'R2 failure' }) },
        },
      });

      const res = await submitTenantPayment(TENANT_ID, {
        billId: BILL_ID,
        amount: 100000,
        method: 'cash',
        proofFile: new File(['x'], 'receipt.jpg'),
        isStaff: true,
      });

      expect(res).toBeDefined();
      expect(insertedPayload.proof_url).toBeNull();
      expect(insertedPayload.metadata.proof_stored).toBe(false);
    });
  });

  describe('Integrasi finance.js uploadTenantFile', () => {
    const TENANT_ID = '11111111-1111-1111-1111-111111111111';

    it('createTenantExpense mengirim kind expense_receipt dan expenseDate', async () => {
      let passedUploadParams = null;
      mockInvoke.mockImplementation(async (fnName, opts) => {
        if (fnName === 'storage-upload') {
          passedUploadParams = {
            kind: opts.body.get('kind'),
            tenantId: opts.body.get('tenantId'),
            expenseDate: opts.body.get('expenseDate'),
            file: opts.body.get('file'),
          };
          return {
            data: { path: `${TENANT_ID}/expenses/2026/test_nota.jpg` },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      let insertedExpense = null;
      vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'expenses') {
          return {
            insert: (payload) => ({
              select: () => ({
                single: async () => {
                  insertedExpense = payload;
                  return { data: { id: 'exp-1', ...payload }, error: null };
                },
              }),
            }),
          };
        }
        return {};
      });

      const testFile = new File(['nota-pln'], 'nota.jpg', { type: 'image/jpeg' });
      await createTenantExpense(TENANT_ID, {
        date: '2026-05-10',
        category: 'Listrik',
        amount: 250000,
        description: 'Pembayaran token PLN',
        file: testFile,
      });

      expect(passedUploadParams).not.toBeNull();
      expect(passedUploadParams.kind).toBe('expense_receipt');
      expect(passedUploadParams.tenantId).toBe(TENANT_ID);
      expect(passedUploadParams.expenseDate).toBe('2026-05-10');
      expect(passedUploadParams.file).toBe(testFile);
      expect(insertedExpense.receipt_url).toBe(`${TENANT_ID}/expenses/2026/test_nota.jpg`);
    });

    it('updateTenantExpense mengirim kind expense_receipt dan mengupdate receipt_url', async () => {
      let passedUploadParams = null;
      mockInvoke.mockImplementation(async (fnName, opts) => {
        if (fnName === 'storage-upload') {
          passedUploadParams = {
            kind: opts.body.get('kind'),
            tenantId: opts.body.get('tenantId'),
            expenseDate: opts.body.get('expenseDate'),
            file: opts.body.get('file'),
          };
          return {
            data: { path: `${TENANT_ID}/expenses/2026/updated_nota.jpg` },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      let updatedPayload = null;
      vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'expenses') {
          return {
            update: (payload) => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () => {
                      updatedPayload = payload;
                      return { data: { id: 'exp-1', ...payload }, error: null };
                    },
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const testFile = new File(['nota-revisi'], 'nota_revisi.jpg', { type: 'image/jpeg' });
      await updateTenantExpense(TENANT_ID, 'exp-1', {
        date: '2026-05-15',
        amount: 275000,
        file: testFile,
      });

      expect(passedUploadParams.kind).toBe('expense_receipt');
      expect(passedUploadParams.expenseDate).toBe('2026-05-15');
      expect(updatedPayload.receipt_url).toBe(`${TENANT_ID}/expenses/2026/updated_nota.jpg`);
    });
  });
});
