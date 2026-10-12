import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_BYTES,
  ALLOWED_MIME,
  detectMime,
  sanitizeFileName,
  adjustFileNameExtension,
  isUuid,
  isValidPath,
  buildPaymentProofPath,
  buildExpenseReceiptPath,
  PAYMENT_PROOF_PATH_REGEX,
  EXPENSE_RECEIPT_PATH_REGEX,
} from '../../../supabase/functions/_shared/fileRules.ts';

describe('STOR-1.2: fileRules helper', () => {
  const VALID_TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const VALID_BILLING_ITEM_ID = '22222222-2222-2222-2222-222222222222';
  const VALID_RECEIPT_UUID = '33333333-3333-3333-3333-333333333333';

  describe('Konstanta', () => {
    it('memiliki MAX_FILE_BYTES sebesar 5 MB', () => {
      expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
    });

    it('memiliki daftar ALLOWED_MIME yang sesuai', () => {
      expect(ALLOWED_MIME).toContain('image/jpeg');
      expect(ALLOWED_MIME).toContain('image/png');
      expect(ALLOWED_MIME).toContain('image/webp');
      expect(ALLOWED_MIME).toContain('application/pdf');
    });
  });

  describe('detectMime — Magic Bytes', () => {
    it('mendeteksi JPEG (FF D8 FF)', () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(detectMime(jpegBytes)).toBe('image/jpeg');
    });

    it('mendeteksi PNG (89 50 4E 47 0D 0A 1A 0A)', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
      expect(detectMime(pngBytes)).toBe('image/png');
    });

    it('mendeteksi WebP (RIFF....WEBP)', () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20, // VP8
      ]);
      expect(detectMime(webpBytes)).toBe('image/webp');
    });

    it('mendeteksi PDF (%PDF)', () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35]);
      expect(detectMime(pdfBytes)).toBe('application/pdf');
    });

    it('menolak file eksekusi .exe (MZ)', () => {
      const exeBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, 0x03]);
      expect(detectMime(exeBytes)).toBeNull();
    });

    it('menolak teks polos atau HTML', () => {
      const htmlBytes = new Uint8Array([0x3C, 0x68, 0x74, 0x6D, 0x6C, 0x3E]); // <html>
      expect(detectMime(htmlBytes)).toBeNull();

      const textBytes = new TextEncoder().encode('Hello world, transfer receipt');
      expect(detectMime(textBytes)).toBeNull();
    });

    it('menolak input kosong atau tidak valid', () => {
      expect(detectMime(null)).toBeNull();
      expect(detectMime(undefined)).toBeNull();
      expect(detectMime(new Uint8Array([]))).toBeNull();
      expect(detectMime(new Uint8Array([0xFF, 0xD8]))).toBeNull();
    });
  });

  describe('sanitizeFileName', () => {
    it('membersihkan traversal path dan karakter berbahaya', () => {
      expect(sanitizeFileName('../../secret/nota.pdf')).toBe('nota.pdf');
      expect(sanitizeFileName('..\\..\\bukti transfer.jpg')).toBe('bukti_transfer.jpg');
      expect(sanitizeFileName('file with spaces & symbols (#1)!.png')).toBe('file_with_spaces___symbols___1__.png');
    });

    it('menghapus titik ganda .. berulang', () => {
      expect(sanitizeFileName('file..name..jpg')).toBe('file_name_jpg');
    });

    it('mengembalikan default "file" bila kosong atau tidak valid', () => {
      expect(sanitizeFileName('')).toBe('file');
      expect(sanitizeFileName(null)).toBe('file');
      expect(sanitizeFileName(undefined)).toBe('file');
      expect(sanitizeFileName('   ')).toBe('file');
    });

    it('memotong nama yang terlalu panjang tapi menjaga ekstensi', () => {
      const longName = 'a'.repeat(150) + '.pdf';
      const sanitized = sanitizeFileName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(100);
      expect(sanitized.endsWith('.pdf')).toBe(true);
    });
  });

  describe('adjustFileNameExtension', () => {
    it('mengganti ekstensi palsu (.exe) dengan ekstensi yang sesuai MIME', () => {
      expect(adjustFileNameExtension('payload.exe', 'image/jpeg')).toBe('payload.jpg');
      expect(adjustFileNameExtension('fake.txt', 'application/pdf')).toBe('fake.pdf');
    });

    it('menambahkan ekstensi jika tidak memiliki ekstensi', () => {
      expect(adjustFileNameExtension('bukti_transfer', 'image/png')).toBe('bukti_transfer.png');
    });

    it('mempertahankan .jpeg untuk MIME image/jpeg', () => {
      expect(adjustFileNameExtension('bukti.jpeg', 'image/jpeg')).toBe('bukti.jpeg');
      expect(adjustFileNameExtension('bukti.jpg', 'image/jpeg')).toBe('bukti.jpg');
    });
  });

  describe('isUuid & isValidPath', () => {
    it('memvalidasi UUID dengan benar', () => {
      expect(isUuid(VALID_TENANT_ID)).toBe(true);
      expect(isUuid(VALID_TENANT_ID.toUpperCase())).toBe(true);
      expect(isUuid('invalid-uuid')).toBe(false);
      expect(isUuid('')).toBe(false);
      expect(isUuid(null)).toBe(false);
    });

    it('memvalidasi path canonical payment_proof dan menolak traversal', () => {
      const validPath = `${VALID_TENANT_ID}/payments/${VALID_BILLING_ITEM_ID}/1712345678_bukti.jpg`;
      expect(isValidPath('payment_proof', validPath)).toBe(true);

      // Traversal ditolak
      expect(isValidPath('payment_proof', `../${validPath}`)).toBe(false);
      expect(isValidPath('payment_proof', `/${validPath}`)).toBe(false);
      expect(isValidPath('payment_proof', `${VALID_TENANT_ID}/payments/../file.jpg`)).toBe(false);
      expect(isValidPath('payment_proof', `${VALID_TENANT_ID}\\payments\\${VALID_BILLING_ITEM_ID}\\file.jpg`)).toBe(false);

      // Jenis file tidak cocok
      expect(isValidPath('expense_receipt', validPath)).toBe(false);
    });

    it('memvalidasi path canonical expense_receipt dan menolak traversal', () => {
      const validExpensePath = `${VALID_TENANT_ID}/expenses/2026/${VALID_RECEIPT_UUID}_nota.png`;
      expect(isValidPath('expense_receipt', validExpensePath)).toBe(true);

      // Traversal ditolak
      expect(isValidPath('expense_receipt', `../${validExpensePath}`)).toBe(false);
      expect(isValidPath('expense_receipt', `/${validExpensePath}`)).toBe(false);
      expect(isValidPath('expense_receipt', `${VALID_TENANT_ID}/expenses/2026/fake/../nota.png`)).toBe(false);

      // Jenis file tidak cocok
      expect(isValidPath('payment_proof', validExpensePath)).toBe(false);
    });
  });

  describe('buildPaymentProofPath', () => {
    it('menyusun path bukti bayar canonical dengan benar', () => {
      const path = buildPaymentProofPath(
        VALID_TENANT_ID,
        VALID_BILLING_ITEM_ID,
        'bukti transfer.jpg',
        1700000000000
      );
      expect(path).toBe(`${VALID_TENANT_ID}/payments/${VALID_BILLING_ITEM_ID}/1700000000000_bukti_transfer.jpg`);
      expect(isValidPath('payment_proof', path)).toBe(true);
    });

    it('menyesuaikan ekstensi sesuai detectedMime', () => {
      const path = buildPaymentProofPath(
        VALID_TENANT_ID,
        VALID_BILLING_ITEM_ID,
        'bukti.exe',
        1700000000000,
        'image/jpeg'
      );
      expect(path).toBe(`${VALID_TENANT_ID}/payments/${VALID_BILLING_ITEM_ID}/1700000000000_bukti.jpg`);
    });

    it('melempar Error jika parameter tidak valid', () => {
      expect(() => buildPaymentProofPath('not-uuid', VALID_BILLING_ITEM_ID, 'file.jpg')).toThrow();
      expect(() => buildPaymentProofPath(VALID_TENANT_ID, 'not-uuid', 'file.jpg')).toThrow();
      expect(() => buildPaymentProofPath(VALID_TENANT_ID, VALID_BILLING_ITEM_ID, '')).toThrow();
      expect(() => buildPaymentProofPath(VALID_TENANT_ID, VALID_BILLING_ITEM_ID, 'file.jpg', -1)).toThrow();
    });
  });

  describe('buildExpenseReceiptPath', () => {
    it('menyusun path nota pengeluaran canonical dengan benar', () => {
      const path = buildExpenseReceiptPath(
        VALID_TENANT_ID,
        '2026-05-20',
        'struk belanja.png',
        VALID_RECEIPT_UUID
      );
      expect(path).toBe(`${VALID_TENANT_ID}/expenses/2026/${VALID_RECEIPT_UUID}_struk_belanja.png`);
      expect(isValidPath('expense_receipt', path)).toBe(true);
    });

    it('menyesuaikan ekstensi sesuai detectedMime', () => {
      const path = buildExpenseReceiptPath(
        VALID_TENANT_ID,
        '2026-05-20',
        'struk',
        VALID_RECEIPT_UUID,
        'application/pdf'
      );
      expect(path).toBe(`${VALID_TENANT_ID}/expenses/2026/${VALID_RECEIPT_UUID}_struk.pdf`);
    });

    it('melempar Error jika parameter tidak valid', () => {
      expect(() => buildExpenseReceiptPath('not-uuid', '2026-05-20', 'file.jpg', VALID_RECEIPT_UUID)).toThrow();
      expect(() => buildExpenseReceiptPath(VALID_TENANT_ID, 'invalid-date', 'file.jpg', VALID_RECEIPT_UUID)).toThrow();
      expect(() => buildExpenseReceiptPath(VALID_TENANT_ID, '2026-05-20', '', VALID_RECEIPT_UUID)).toThrow();
      expect(() => buildExpenseReceiptPath(VALID_TENANT_ID, '2026-05-20', 'file.jpg', 'not-uuid')).toThrow();
    });
  });
});
