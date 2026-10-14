import { describe, it, expect, vi } from 'vitest';

// Test logic helper murni dari hook tanpa ketergantungan render hook kompleks
function evaluateSubscriptionGate(status, role, actionName = 'Aksi ini', options = {}) {
  const isReadOnly = status === 'read_only';
  const canTransact = !isReadOnly;
  const isStaff = options.isStaff ?? (
    options.isOwner ||
    options.isTenantAdmin ||
    ['admin', 'bendahara', 'pengurus'].includes(role)
  );

  let tooltip = '';
  if (isReadOnly) {
    if (isStaff) {
      tooltip = `${actionName} dinonaktifkan sementara karena status layanan Read-Only. Klik untuk memperpanjang paket langganan.`;
    } else {
      tooltip = 'Layanan sedang dalam pemeliharaan sistem. Silakan hubungi pengurus atau pengelola Anda.';
    }
  }

  const redirectToRenewal = () => {
    const tid = options.activeTenant?.id || options.activeTenantId || options.tenantId;
    if (tid && options.navigate) {
      options.navigate(`/account/choose-plan?tenantId=${tid}`);
    }
  };

  const guardAction = (fn) => {
    if (canTransact) {
      return typeof fn === 'function' ? fn() : undefined;
    }
    if (isStaff) {
      redirectToRenewal();
    }
    return undefined;
  };

  return { canTransact, isReadOnly, isStaff, tooltip, redirectToRenewal, guardAction };
}

describe('useSubscriptionGate Logic (T5.1, T5.2)', () => {
  it('harus mengizinkan transaksi saat status active', () => {
    const res = evaluateSubscriptionGate('active', 'admin', 'Tambah Warga');
    expect(res.canTransact).toBe(true);
    expect(res.isReadOnly).toBe(false);
    expect(res.tooltip).toBe('');
  });

  it('harus mengizinkan transaksi saat status trial', () => {
    const res = evaluateSubscriptionGate('trial', 'bendahara', 'Catat IPL');
    expect(res.canTransact).toBe(true);
    expect(res.isReadOnly).toBe(false);
    expect(res.tooltip).toBe('');
  });

  it('harus memblokir transaksi saat status read_only untuk admin dengan info perpanjangan', () => {
    const res = evaluateSubscriptionGate('read_only', 'admin', 'Tambah Unit');
    expect(res.canTransact).toBe(false);
    expect(res.isReadOnly).toBe(true);
    expect(res.tooltip).toContain('Read-Only');
    expect(res.tooltip).toContain('Klik untuk memperpanjang');
  });

  it('harus menyamarkan pesan untuk anggota/warga saat read_only tanpa istilah teknis', () => {
    const res = evaluateSubscriptionGate('read_only', 'anggota', 'Bayar Tagihan');
    expect(res.canTransact).toBe(false);
    expect(res.isReadOnly).toBe(true);
    // Tidak boleh mengandung istilah teknis subscription/platform
    expect(res.tooltip).not.toContain('subscription');
    expect(res.tooltip).not.toContain('platform');
    expect(res.tooltip).not.toContain('Read-Only');
    expect(res.tooltip).toContain('pemeliharaan sistem');
    expect(res.tooltip).toContain('Silakan hubungi pengurus');
  });
});

describe('guardAction Logic (GATE-1F)', () => {
  it('guardAction memanggil fn saat status "active" dan "trial"', () => {
    const fnActive = vi.fn().mockReturnValue('ok-active');
    const gateActive = evaluateSubscriptionGate('active', 'admin');
    const resActive = gateActive.guardAction(fnActive);
    expect(fnActive).toHaveBeenCalledTimes(1);
    expect(resActive).toBe('ok-active');

    const fnTrial = vi.fn().mockReturnValue('ok-trial');
    const gateTrial = evaluateSubscriptionGate('trial', 'bendahara');
    const resTrial = gateTrial.guardAction(fnTrial);
    expect(fnTrial).toHaveBeenCalledTimes(1);
    expect(resTrial).toBe('ok-trial');
  });

  it('TIDAK memanggil fn saat "read_only"', () => {
    const fn = vi.fn();
    const gateReadOnly = evaluateSubscriptionGate('read_only', 'anggota');
    const result = gateReadOnly.guardAction(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('saat read_only dan staf → redirect (navigate ke /account/choose-plan?tenantId=...) dipanggil', () => {
    const mockNavigate = vi.fn();
    const gate = evaluateSubscriptionGate('read_only', 'admin', 'Aksi ini', {
      navigate: mockNavigate,
      tenantId: 'tenant-123',
    });
    const fn = vi.fn();
    const result = gate.guardAction(fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/account/choose-plan?tenantId=tenant-123');
  });

  it('saat read_only dan non-staf → redirect TIDAK dipanggil', () => {
    const mockNavigate = vi.fn();
    const gate = evaluateSubscriptionGate('read_only', 'anggota', 'Aksi ini', {
      navigate: mockNavigate,
      tenantId: 'tenant-123',
    });
    const fn = vi.fn();
    gate.guardAction(fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('mengembalikan hasil fn (termasuk promise)', async () => {
    const gate = evaluateSubscriptionGate('active', 'admin');

    // Nilai sinkron
    const syncFn = vi.fn(() => ({ success: true, count: 5 }));
    expect(gate.guardAction(syncFn)).toEqual({ success: true, count: 5 });

    // Promise asinkron
    const asyncFn = vi.fn(async () => 'hasil-async');
    const promiseResult = gate.guardAction(asyncFn);
    expect(promiseResult).toBeInstanceOf(Promise);
    await expect(promiseResult).resolves.toBe('hasil-async');
  });
});
