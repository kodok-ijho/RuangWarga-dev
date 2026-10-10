import { describe, it, expect } from 'vitest';
import {
  calculateQrisFee,
  formatDokuTimestamp,
  buildB2BStringToSign,
  buildMpmStringToSign,
  sha256HexLower,
  hmacSha512Base64,
  timingSafeEqual,
} from '../dokuProtocol';

describe('DOKU SNAP Protocol Pure Helpers (PAY-1.6)', () => {
  describe('calculateQrisFee', () => {
    it('menghitung biaya MDR 0,75% dibulatkan ke atas (Math.ceil)', () => {
      // 100.000 * 0.0075 = 750
      expect(calculateQrisFee(100000)).toEqual({ fee: 750, total: 100750 });

      // Listing prices
      // 15.000 * 0.0075 = 112.5 -> ceil -> 113
      expect(calculateQrisFee(15000)).toEqual({ fee: 113, total: 15113 });
      // 35.000 * 0.0075 = 262.5 -> ceil -> 263
      expect(calculateQrisFee(35000)).toEqual({ fee: 263, total: 35263 });
      // 10.000 * 0.0075 = 75
      expect(calculateQrisFee(10000)).toEqual({ fee: 75, total: 10075 });
      // 25.000 * 0.0075 = 187.5 -> ceil -> 188
      expect(calculateQrisFee(25000)).toEqual({ fee: 188, total: 25188 });

      // Nilai kecil dengan pembulatan ke atas
      // 100 * 0.0075 = 0.75 -> ceil -> 1
      expect(calculateQrisFee(100)).toEqual({ fee: 1, total: 101 });
      // 1 * 0.0075 = 0.0075 -> ceil -> 1
      expect(calculateQrisFee(1)).toEqual({ fee: 1, total: 2 });
    });

    it('menangani input 0 atau invalid secara aman', () => {
      expect(calculateQrisFee(0)).toEqual({ fee: 0, total: 0 });
      expect(calculateQrisFee(-5000)).toEqual({ fee: 0, total: 0 });
      expect(calculateQrisFee('invalid')).toEqual({ fee: 0, total: 0 });
      expect(calculateQrisFee(null)).toEqual({ fee: 0, total: 0 });
      expect(calculateQrisFee(undefined)).toEqual({ fee: 0, total: 0 });
    });
  });

  describe('formatDokuTimestamp', () => {
    it('memformat timestamp ISO tanpa milidetik dengan akhiran Z', () => {
      const fixedDate = new Date('2026-10-10T12:34:56.789Z');
      expect(formatDokuTimestamp(fixedDate)).toBe('2026-10-10T12:34:56Z');
    });

    it('menerima string ISO atau epoch timestamp', () => {
      expect(formatDokuTimestamp('2026-05-01T08:00:00.000Z')).toBe('2026-05-01T08:00:00Z');
      const epoch = new Date('2026-01-01T00:00:00.000Z').getTime();
      expect(formatDokuTimestamp(epoch)).toBe('2026-01-01T00:00:00Z');
    });

    it('membuat timestamp valid saat dipanggil tanpa argumen', () => {
      const ts = formatDokuTimestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  describe('buildB2BStringToSign', () => {
    it('membentuk string to sign B2B: {clientId}|{timestamp}', () => {
      const clientId = 'CLIENT-12345';
      const timestamp = '2026-10-10T10:00:00Z';
      expect(buildB2BStringToSign(clientId, timestamp)).toBe('CLIENT-12345|2026-10-10T10:00:00Z');
    });
  });

  describe('buildMpmStringToSign', () => {
    it('membentuk string to sign transaksi MPM: {method}:{path}:{token}:{bodyHash}:{ts}', () => {
      const method = 'post';
      const path = '/services/v1.0/qr-dynamic/generate';
      const token = 'token-abc-xyz';
      const bodyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const ts = '2026-10-10T10:00:00Z';

      const result = buildMpmStringToSign(method, path, token, bodyHash, ts);
      expect(result).toBe('POST:/services/v1.0/qr-dynamic/generate:token-abc-xyz:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855:2026-10-10T10:00:00Z');
    });
  });

  describe('sha256HexLower & hmacSha512Base64 (Web Crypto test vectors)', () => {
    it('menghasilkan hash SHA-256 lowercase hex yang akurat', async () => {
      // Test vector standard untuk string kosong ""
      const emptyHash = await sha256HexLower('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // Test vector standard untuk "hello"
      const helloHash = await sha256HexLower('hello');
      expect(helloHash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('menghasilkan HMAC-SHA512 Base64 konsisten untuk payload dan secret yang sama', async () => {
      const payload = 'TEST-STRING-TO-SIGN';
      const secret = 'super-secret-key';
      const sig1 = await hmacSha512Base64(payload, secret);
      const sig2 = await hmacSha512Base64(payload, secret);

      expect(sig1).toBe(sig2);
      expect(typeof sig1).toBe('string');
      expect(sig1.length).toBeGreaterThan(0);

      // Secret berbeda menghasilkan signature berbeda
      const sigDifferentSecret = await hmacSha512Base64(payload, 'other-secret');
      expect(sig1).not.toBe(sigDifferentSecret);
    });
  });

  describe('timingSafeEqual', () => {
    it('mengembalikan true untuk string yang identik', () => {
      expect(timingSafeEqual('secret123', 'secret123')).toBe(true);
      expect(timingSafeEqual('', '')).toBe(true);
    });

    it('mengembalikan false untuk string dengan panjang atau karakter berbeda', () => {
      expect(timingSafeEqual('secret123', 'secret124')).toBe(false);
      expect(timingSafeEqual('secret123', 'secret12')).toBe(false);
      expect(timingSafeEqual('secret12', 'secret123')).toBe(false);
    });

    it('menolak input bukan string', () => {
      expect(timingSafeEqual(null, 'secret')).toBe(false);
      expect(timingSafeEqual('secret', undefined)).toBe(false);
    });
  });
});
