import { describe, it, expect } from 'vitest';
import { getArisanAccess } from './arisanAccess';

describe('utils/arisanAccess - Unit Tests (VERT-1.3)', () => {
  it('owner atau admin penuh memiliki semua izin (semua true)', () => {
    const hasPermission = () => true;
    const access = getArisanAccess(hasPermission);

    expect(access).toEqual({
      canManageRounds: true,
      canGenerateBills: true,
      canRecordPayment: true,
    });
  });

  it('bendahara dengan generate_billing + manage_billing_cash bisa terbitkan & catat, tidak bisa kocok', () => {
    const permissions = new Set(['generate_billing', 'manage_billing_cash']);
    const hasPermission = (key) => permissions.has(key);
    const access = getArisanAccess(hasPermission);

    expect(access).toEqual({
      canManageRounds: false,
      canGenerateBills: true,
      canRecordPayment: true,
    });
  });

  it('peserta tanpa izin menghasilkan semua false', () => {
    const hasPermission = () => false;
    const access = getArisanAccess(hasPermission);

    expect(access).toEqual({
      canManageRounds: false,
      canGenerateBills: false,
      canRecordPayment: false,
    });
  });

  it('mengembalikan semua false jika hasPermission undefined atau bukan fungsi', () => {
    expect(getArisanAccess(undefined)).toEqual({
      canManageRounds: false,
      canGenerateBills: false,
      canRecordPayment: false,
    });
    expect(getArisanAccess(null)).toEqual({
      canManageRounds: false,
      canGenerateBills: false,
      canRecordPayment: false,
    });
    expect(getArisanAccess('not-a-func')).toEqual({
      canManageRounds: false,
      canGenerateBills: false,
      canRecordPayment: false,
    });
  });
});
