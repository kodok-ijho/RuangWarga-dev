import { describe, it, expect } from 'vitest';
import { isSafeLogoUrl } from './brand';

describe('isSafeLogoUrl (BRAND-1F.1 K4 Security Helper)', () => {
  it('mengizinkan path absolut lokal yang diawali satu slash', () => {
    expect(isSafeLogoUrl('/tenants/palm-village/logo.png')).toBe(true);
    expect(isSafeLogoUrl('/images/logo.png')).toBe(true);
    expect(isSafeLogoUrl('/brand/rw-mark.svg')).toBe(true);
  });

  it('mengizinkan URL eksternal dengan protokol aman HTTPS', () => {
    expect(isSafeLogoUrl('https://example.com/logo.png')).toBe(true);
    expect(isSafeLogoUrl('https://cdn.ruangwarga.com/tenant-1.png')).toBe(true);
  });

  it('menolak protokol tidak aman HTTP biasa', () => {
    expect(isSafeLogoUrl('http://example.com/logo.png')).toBe(false);
    expect(isSafeLogoUrl('http://evil.test/x.png')).toBe(false);
  });

  it('menolak URI berbahaya javascript: atau data:', () => {
    expect(isSafeLogoUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLogoUrl('javascript:void(0)')).toBe(false);
    expect(isSafeLogoUrl('data:image/svg+xml;base64,PHN2Zz...')).toBe(false);
  });

  it('menolak URL protocol-relative (//)', () => {
    expect(isSafeLogoUrl('//evil.test/logo.png')).toBe(false);
    expect(isSafeLogoUrl('///evil.test/logo.png')).toBe(false);
  });

  it('menolak input kosong, whitespace, atau tipe data non-string', () => {
    expect(isSafeLogoUrl('')).toBe(false);
    expect(isSafeLogoUrl('   ')).toBe(false);
    expect(isSafeLogoUrl(null)).toBe(false);
    expect(isSafeLogoUrl(undefined)).toBe(false);
    expect(isSafeLogoUrl(12345)).toBe(false);
    expect(isSafeLogoUrl({})).toBe(false);
  });
});
