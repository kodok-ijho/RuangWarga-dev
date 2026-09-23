import { describe, it, expect } from 'vitest';
import {
  buildCanonicalExpenseReceiptPath,
  isValidExpenseReceiptPath,
  extractTenantIdFromPath,
  canAccessExpenseReceipt,
  sanitizeStorageFileName,
  createReceiptSignedUrl,
} from './storagePolicy';

describe('Sub-Gate 8.1-B5: Storage RLS & Path Security Invariants', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const CANONICAL_PATH_A = `${TENANT_A}/expenses/2026/test-uuid_receipt.jpg`;
  const CANONICAL_PATH_B = `${TENANT_B}/expenses/2026/test-uuid_receipt.jpg`;

  describe('Invariant 1 & 2: Cross-tenant upload & read strictly denied', () => {
    it('denies user of Tenant A from uploading to Tenant B path', () => {
      const allowed = canAccessExpenseReceipt({
        userId: 'user-a',
        userTenantId: TENANT_A,
        userPermissions: ['manage_expenses'],
        path: CANONICAL_PATH_B,
        operation: 'INSERT',
      });
      expect(allowed).toBe(false);
    });

    it('denies user of Tenant A from reading receipt from Tenant B path', () => {
      const allowed = canAccessExpenseReceipt({
        userId: 'user-a',
        userTenantId: TENANT_A,
        userPermissions: ['manage_expenses'],
        path: CANONICAL_PATH_B,
        operation: 'SELECT',
      });
      expect(allowed).toBe(false);
    });
  });

  describe('Invariant 3: Forged tenant path denied', () => {
    it('denies access when client provides mismatched or forged tenant prefix', () => {
      const forgedPath = `33333333-3333-3333-3333-333333333333/expenses/2026/fake_receipt.jpg`;
      const allowed = canAccessExpenseReceipt({
        userId: 'user-a',
        userTenantId: TENANT_A,
        userPermissions: ['manage_expenses'],
        path: forgedPath,
        operation: 'SELECT',
      });
      expect(allowed).toBe(false);
    });
  });

  describe('Invariant 4: Authorized tenant owner/finance staff can access own-tenant receipt', () => {
    it('allows authorized staff with manage_expenses to read and upload own-tenant receipt', () => {
      const canRead = canAccessExpenseReceipt({
        userId: 'staff-a',
        userTenantId: TENANT_A,
        userPermissions: ['manage_expenses'],
        path: CANONICAL_PATH_A,
        operation: 'SELECT',
      });
      expect(canRead).toBe(true);

      const canUpload = canAccessExpenseReceipt({
        userId: 'staff-a',
        userTenantId: TENANT_A,
        userPermissions: ['manage_expenses'],
        subscriptionStatus: 'active',
        path: CANONICAL_PATH_A,
        operation: 'INSERT',
      });
      expect(canUpload).toBe(true);
    });

    it('allows tenant owner to access own-tenant receipt even without explicit role permissions', () => {
      const canRead = canAccessExpenseReceipt({
        userId: 'owner-a',
        userTenantId: TENANT_A,
        isTenantOwner: true,
        path: CANONICAL_PATH_A,
        operation: 'SELECT',
      });
      expect(canRead).toBe(true);
    });

    it('blocks uploads if tenant subscription is in read_only status', () => {
      const canUpload = canAccessExpenseReceipt({
        userId: 'staff-a',
        userTenantId: TENANT_A,
        userPermissions: ['manage_expenses'],
        subscriptionStatus: 'read_only',
        path: CANONICAL_PATH_A,
        operation: 'INSERT',
      });
      expect(canUpload).toBe(false);
    });
  });

  describe('Invariant 5: Regular tenant member cannot access expense receipt', () => {
    it('denies regular member without manage_expenses permission from reading receipt', () => {
      const allowed = canAccessExpenseReceipt({
        userId: 'warga-a',
        userTenantId: TENANT_A,
        userPermissions: ['view_reports'], // regular member lacks manage_expenses
        path: CANONICAL_PATH_A,
        operation: 'SELECT',
      });
      expect(allowed).toBe(false);
    });

    it('denies regular member from uploading expense receipt', () => {
      const allowed = canAccessExpenseReceipt({
        userId: 'warga-a',
        userTenantId: TENANT_A,
        userPermissions: [],
        path: CANONICAL_PATH_A,
        operation: 'INSERT',
      });
      expect(allowed).toBe(false);
    });
  });

  describe('Invariant 6: Anonymous/public access denied', () => {
    it('denies unauthenticated/anonymous access to receipts', () => {
      const allowed = canAccessExpenseReceipt({
        userId: null,
        path: CANONICAL_PATH_A,
        operation: 'SELECT',
      });
      expect(allowed).toBe(false);
    });
  });

  describe('Invariant 7: Canonical tenant-scoped path accepted', () => {
    it('builds and validates standard canonical path structure', () => {
      const path = buildCanonicalExpenseReceiptPath({
        tenantId: TENANT_A,
        expenseDate: '2026-03-15',
        fileName: 'nota kwitansi PLN #1.jpg',
        uuid: '00000000-0000-0000-0000-000000000001',
      });
      expect(path).toBe(`${TENANT_A}/expenses/2026/00000000-0000-0000-0000-000000000001_nota_kwitansi_PLN__1.jpg`);
      expect(isValidExpenseReceiptPath(path)).toBe(true);
      expect(extractTenantIdFromPath(path)).toBe(TENANT_A);
    });
  });

  describe('Invariant 8: Malformed/path traversal attempt denied', () => {
    it('rejects path traversal attempts with ../', () => {
      expect(isValidExpenseReceiptPath('../etc/passwd')).toBe(false);
      expect(isValidExpenseReceiptPath(`${TENANT_A}/expenses/2026/../../etc/passwd`)).toBe(false);
    });

    it('rejects flat files without tenant prefix', () => {
      expect(isValidExpenseReceiptPath('receipt.jpg')).toBe(false);
      expect(isValidExpenseReceiptPath('/expenses/2026/receipt.jpg')).toBe(false);
    });

    it('rejects non-expenses folders or malformed years', () => {
      expect(isValidExpenseReceiptPath(`${TENANT_A}/other_folder/2026/file.jpg`)).toBe(false);
      expect(isValidExpenseReceiptPath(`${TENANT_A}/expenses/999/file.jpg`)).toBe(false);
      expect(isValidExpenseReceiptPath(`not-a-uuid/expenses/2026/file.jpg`)).toBe(false);
    });

    it('sanitizes malicious file names cleanly', () => {
      expect(sanitizeStorageFileName('../../../evil.exe')).toBe('evil.exe');
      expect(sanitizeStorageFileName('file with spaces & symbols!?.png')).toBe('file_with_spaces___symbols__.png');
    });
  });

  describe('Signed URL Model (60-minute target lifetime)', () => {
    it('requests signed URL with 3600 seconds default lifetime for valid canonical path', async () => {
      const mockSupabase = {
        storage: {
          from: (bucket) => {
            expect(bucket).toBe('expense-receipts');
            return {
              createSignedUrl: async (path, expiresIn) => {
                expect(path).toBe(CANONICAL_PATH_A);
                expect(expiresIn).toBe(3600);
                return {
                  data: { signedUrl: `https://supabase.co/storage/v1/object/sign/expense-receipts/${path}?token=mock-token` },
                  error: null,
                };
              },
            };
          },
        },
      };

      const signedUrl = await createReceiptSignedUrl(mockSupabase, CANONICAL_PATH_A);
      expect(signedUrl).toContain('mock-token');
      expect(signedUrl).toContain('expense-receipts');
    });

    it('rejects signed URL generation if path violates canonical format', async () => {
      const mockSupabase = { storage: { from: () => ({}) } };
      await expect(createReceiptSignedUrl(mockSupabase, '../etc/passwd')).rejects.toThrow(
        'Path storage bukti pengeluaran tidak valid atau melanggar struktur canonical.'
      );
    });
  });
});
