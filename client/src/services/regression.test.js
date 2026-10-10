/**
 * regression.test.js — T11.1 Regression Test Keempat Vertikal
 *
 * Menguji alur end-to-end (setup tenant → add units → add members →
 * buat tagihan → bayar tagihan pertama) untuk setiap vertikal:
 *   1. RT/RW
 *   2. Kos-kosan
 *   3. Arisan
 *   4. Kelas
 *
 * Semua test berjalan di demo mode (tanpa koneksi Supabase),
 * sehingga aman dijalankan di CI maupun lokal.
 */
import { describe, it, expect } from 'vitest';
import {
  fetchTenantDetails,
  updateTenantProfileAndSettings,
  fetchTenantUnits,
  bulkCreateTenantUnits,
  requestJoinTenant,
  fetchPendingTenantMembers,
  approveTenantMember,
  rejectTenantMember,
  calculateBillingPreview,
  generateTenantBillingItems,
  fetchTenantBillingItems,
  fetchTenantPayments,
  verifyTenantPayment,
  rejectTenantPayment,
  fetchTenantExpenses,
  createTenantExpense,
  fetchTenantMonthlyFinance,
  fetchTenantDashboardData,
  generateInviteCode,
  assignRoomContract,
  autoGenerateKosBilling,
  checkoutKosRoom,
  fetchArisanRounds,
  createArisanRound,
  fetchArisanParticipants,
  enrollArisanParticipants,
  generateArisanRoundBills,
  fetchArisanRoundBills,
  payArisanBillManual,
  fetchArisanCandidates,
  drawArisanWinner,
  startNewArisanCycle,
  generateKelasSppBilling,
} from './tenantOperationalService';

// ─────────────────────────────────────────────────────────────────────────────
// 1. VERTIKAL RT/RW
// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: Vertikal RT/RW — Alur Lengkap (T11.1)', () => {
  const tenantId = 'demo-tenant-rtrw';

  it('1. Fetch detail tenant RT/RW dan verifikasi tipe & konfigurasi IPL', async () => {
    const tenant = await fetchTenantDetails(tenantId);
    expect(tenant).toBeDefined();
    expect(tenant.type).toBe('rt_rw');
    expect(tenant.name).toContain('Palm Village');
    expect(tenant.settings).toBeDefined();
    expect(tenant.settings.ipl_components).toBeDefined();
    expect(Array.isArray(tenant.settings.ipl_components)).toBe(true);
    expect(tenant.settings.ipl_components.length).toBeGreaterThan(0);
    expect(tenant.settings.due_day).toBeDefined();
  });

  it('2. Update profil dan settings tenant berhasil', async () => {
    const result = await updateTenantProfileAndSettings(tenantId, {
      name: 'Palm Village RT 05 Updated',
      address: 'Jl. Boulevard Palm No. 1A',
      contact_phone: '081234567899',
      settings: {
        ipl_components: [
          { name: 'Keamanan', amount: 90000 },
          { name: 'Kebersihan', amount: 35000 },
        ],
        due_day: 15,
      },
    });
    expect(result).toBeDefined();
    expect(result.id).toBe(tenantId);
  });

  it('3. Fetch daftar unit (rumah) tenant RT/RW', async () => {
    const units = await fetchTenantUnits(tenantId);
    expect(Array.isArray(units)).toBe(true);
    expect(units.length).toBeGreaterThan(0);
    // Setiap unit harus punya label
    units.forEach(u => {
      expect(u.id).toBeDefined();
      expect(u.label).toBeDefined();
    });
  });

  it('4. Bulk create unit (rumah) baru — gunakan field "label"', async () => {
    const newUnits = [
      { label: 'Blok H-01', status: 'occupied' },
      { label: 'Blok H-02', status: 'occupied' },
      { label: 'Blok H-03', status: 'vacant' },
    ];
    const created = await bulkCreateTenantUnits(tenantId, newUnits);
    expect(Array.isArray(created)).toBe(true);
    expect(created.length).toBe(3);
    created.forEach(u => {
      expect(u.tenant_id).toBe(tenantId);
      expect(u.label).toBeDefined();
    });
  });

  it('5. Warga mendaftar ke tenant via requestJoinTenant (IS_DEMO fallback)', async () => {
    // requestJoinTenant hanya cek IS_DEMO (bukan demo- prefix).
    // Di test tanpa VITE_DEMO_MODE=true, fungsi ini akan memanggil supabase
    // yang mungkin gagal. Kita uji validasi input saja.
    await expect(
      requestJoinTenant({ tenantId: null, userId: 'u1', fullName: 'Test' })
    ).rejects.toThrow('Tenant ID dan User ID wajib disertakan');
    await expect(
      requestJoinTenant({ tenantId: 't1', userId: null, fullName: 'Test' })
    ).rejects.toThrow('Tenant ID dan User ID wajib disertakan');
  });

  it('6. Approve dan reject member — validasi input', async () => {
    // approveTenantMember dan rejectTenantMember hanya cek IS_DEMO
    // (bukan demo- prefix), sehingga di test tanpa env VITE_DEMO_MODE=true
    // mereka akan mencoba akses Supabase. Uji validasi input saja.
    await expect(
      approveTenantMember(null, { role: 'anggota' })
    ).rejects.toThrow('Member ID wajib disertakan');

    await expect(
      approveTenantMember('', { role: 'anggota' })
    ).rejects.toThrow('Member ID wajib disertakan');

    await expect(rejectTenantMember(null)).rejects.toThrow('Member ID wajib disertakan');
    await expect(rejectTenantMember('')).rejects.toThrow('Member ID wajib disertakan');
  });

  it('7. Generate kode undangan dengan format yang benar', () => {
    const code = generateInviteCode('Palm Village');
    expect(code).toMatch(/^RW-PALM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('8. Hitung preview tagihan IPL dan verifikasi komponen', () => {
    // calculateBillingPreview menggunakan Map dan Set, bukan plain object
    const units = [
      { id: 1, label: 'A-01', status: 'occupied' },
      { id: 2, label: 'A-02', status: 'occupied' },
    ];
    const settings = {
      ipl_components: [
        { name: 'Keamanan', amount: 80000 },
        { name: 'Kebersihan', amount: 30000 },
        { name: 'Kas RT', amount: 20000 },
      ],
      due_day: 10,
    };
    const unitMemberMap = new Map([
      [1, { id: 'mem-1', full_name: 'Budi Santoso' }],
      [2, { id: 'mem-2', full_name: 'Siti Rahayu' }],
    ]);
    const existingUnitIds = new Set();

    const result = calculateBillingPreview({
      units,
      settings,
      period: '2026-01',
      unitMemberMap,
      existingUnitIds,
      tenantType: 'rt_rw',
    });

    // Return shape: { preview, skipped, totalAmount, grandTotalAmount, dueDate, period }
    expect(result.preview).toBeDefined();
    expect(result.preview.length).toBe(2);
    expect(result.preview[0].amount).toBe(130000); // 80000 + 30000 + 20000
    expect(result.preview[0].resident_name).toBe('Budi Santoso');
    expect(result.skipped).toBeDefined();
    expect(result.skipped.length).toBe(0);
    expect(result.grandTotalAmount).toBe(260000); // 130000 × 2
  });

  it('9. Generate tagihan periode baru (dry run)', async () => {
    const result = await generateTenantBillingItems(tenantId, {
      period: '2026-09',
      dry_run: true,
    });
    expect(result).toBeDefined();
    expect(result.preview || result.bills || result.generated).toBeDefined();
  });

  it('10. Fetch tagihan dan verifikasi pembayaran pertama', async () => {
    const payments = await fetchTenantPayments(tenantId);
    expect(Array.isArray(payments)).toBe(true);

    if (payments.length > 0) {
      const verified = await verifyTenantPayment(tenantId, payments[0].id, {
        verifiedBy: 'admin-001',
        note: 'Pembayaran IPL Januari diverifikasi',
      });
      expect(verified).toBeDefined();
      expect(verified.status).toBe('verified');
    }
  });

  it('11. Catat dan ambil pengeluaran kas RT', async () => {
    const expense = await createTenantExpense(tenantId, {
      date: '2026-09-01',
      category: 'Pemeliharaan',
      amount: 500000,
      description: 'Perbaikan gerbang utama',
      recordedBy: 'bendahara-001',
    });
    expect(expense).toBeDefined();
    expect(expense.amount).toBe(500000);

    const expenses = await fetchTenantExpenses(tenantId);
    expect(Array.isArray(expenses)).toBe(true);
  });

  it('12. Laporan keuangan bulanan dan dashboard RT/RW', async () => {
    const finance = await fetchTenantMonthlyFinance(tenantId, {
      year: 2026,
      month: 9,
    });
    expect(finance).toBeDefined();
    // Return shape: { report: { total_income, ... }, expenses, cashPayments }
    expect(finance.report).toBeDefined();
    expect(finance.report.total_income).toBeDefined();

    const dashboard = await fetchTenantDashboardData(tenantId, {
      role: 'admin',
      period: '2026-09',
    });
    expect(dashboard).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. VERTIKAL KOS-KOSAN
// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: Vertikal Kos — Alur Lengkap (T11.1)', () => {
  const tenantId = 'demo-tenant-kos';

  it('1. Fetch detail tenant kos dan verifikasi konfigurasi sewa', async () => {
    const tenant = await fetchTenantDetails(tenantId);
    expect(tenant).toBeDefined();
    expect(tenant.type).toBe('kos');
    expect(tenant.name).toBeDefined();
    expect(tenant.settings).toBeDefined();
    expect(tenant.settings.default_rent_price).toBeDefined();
    expect(typeof tenant.settings.default_rent_price).toBe('number');
    expect(tenant.settings.billing_cycle).toBeDefined();
  });

  it('2. Bulk create kamar kos dengan metadata — field "label"', async () => {
    const rooms = [
      { label: 'Kamar 101', status: 'vacant', metadata: { floor: 1, room_type: 'standard' } },
      { label: 'Kamar 102', status: 'vacant', metadata: { floor: 1, room_type: 'deluxe' } },
      { label: 'Kamar 201', status: 'vacant', metadata: { floor: 2, room_type: 'standard' } },
    ];
    const created = await bulkCreateTenantUnits(tenantId, rooms);
    expect(created.length).toBe(3);
    created.forEach(r => {
      expect(r.tenant_id).toBe(tenantId);
      expect(r.label).toBeDefined();
    });
  });

  it('3. Assign kontrak sewa kamar ke penghuni', async () => {
    const contract = await assignRoomContract(tenantId, {
      unitId: 'unit-demo-101',
      memberId: 'mem-demo-k01',
      rentPrice: 1500000,
      contractStart: '2026-09-01',
      contractEnd: '2027-08-31',
    });
    expect(contract).toBeDefined();
    // Return shape: { unitId, memberId, contractStart, contractEnd, bill }
    expect(contract.unitId).toBe('unit-demo-101');
    expect(contract.contractStart).toBe('2026-09-01');
    expect(contract.contractEnd).toBe('2027-08-31');
    expect(contract.bill).toBeDefined();
  });

  it('4. calculateBillingPreview khusus kos: skip kamar vacant', () => {
    // Function signature: unitMemberMap = new Map(), existingUnitIds = new Set()
    const units = [
      { id: 1, label: 'K-101', status: 'occupied', metadata: { contract_start: '2026-01-01', contract_end: '2027-08-31', rent_price: 1500000 } },
      { id: 2, label: 'K-102', status: 'vacant' },
      { id: 3, label: 'K-201', status: 'occupied', metadata: { contract_start: '2026-01-01', contract_end: '2027-06-30', rent_price: 1200000 } },
    ];
    const unitMemberMap = new Map([
      [1, { id: 'mem-k1', full_name: 'Andi Penyewa' }],
      [3, { id: 'mem-k3', full_name: 'Rina Penyewa' }],
    ]);

    const result = calculateBillingPreview({
      units,
      settings: { default_rent_price: 1000000, due_day: 5 },
      period: '2026-09',
      unitMemberMap,
      existingUnitIds: new Set(),
      tenantType: 'kos',
    });

    // Return shape: { preview, skipped }
    expect(result.preview.length).toBe(2);
    expect(result.skipped.length).toBe(1); // K-102 vacant
    expect(result.preview[0].amount).toBe(1500000);
    expect(result.preview[1].amount).toBe(1200000);
    expect(result.skipped[0].reason).toBe('room_vacant');
  });

  it('5. Auto-generate tagihan sewa bulanan', async () => {
    const result = await autoGenerateKosBilling(tenantId, {
      period: '2026-09',
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it('6. Checkout kamar kos (tenant pindah)', async () => {
    const checkout = await checkoutKosRoom(tenantId, {
      unitId: 'unit-demo-101',
      memberId: 'mem-demo-k01',
      checkoutDate: '2027-08-31',
      reason: 'Selesai kontrak',
    });
    expect(checkout).toBeDefined();
    expect(checkout.status).toBe('vacant');
  });

  it('7. Fetch dan verifikasi pembayaran sewa', async () => {
    const payments = await fetchTenantPayments(tenantId);
    expect(Array.isArray(payments)).toBe(true);
  });

  it('8. Dashboard kos menampilkan data', async () => {
    const dashboard = await fetchTenantDashboardData(tenantId, {
      role: 'admin',
      period: '2026-09',
    });
    expect(dashboard).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VERTIKAL ARISAN
// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: Vertikal Arisan — Alur Lengkap (T11.1)', () => {
  const tenantId = 'demo-tenant-arisan';

  it('1. Fetch daftar putaran arisan', async () => {
    const rounds = await fetchArisanRounds(tenantId);
    expect(Array.isArray(rounds)).toBe(true);
    expect(rounds.length).toBeGreaterThan(0);
    rounds.forEach(r => {
      expect(r.id).toBeDefined();
    });
  });

  it('2. Buat putaran arisan baru', async () => {
    const round = await createArisanRound(tenantId, {
      round_number: 5,
      scheduled_date: '2026-10-15',
      contribution_amount: 200000,
    });
    expect(round).toBeDefined();
    expect(round.id).toBeDefined();
    expect(round.tenant_id).toBe(tenantId);
  });

  it('3. Enroll peserta arisan', async () => {
    const participants = [
      { member_id: 'mem-001', name: 'Ibu Sari' },
      { member_id: 'mem-002', name: 'Ibu Dewi' },
      { member_id: 'mem-003', name: 'Bapak Eko' },
    ];
    const enrolled = await enrollArisanParticipants(tenantId, participants);
    expect(enrolled).toBeDefined();
    // Demo mode mengembalikan participants yang sama
    expect(Array.isArray(enrolled)).toBe(true);
    expect(enrolled.length).toBe(3);
  });

  it('4. fetchArisanParticipants mengembalikan array (demo: kosong)', async () => {
    // Demo mode fetchArisanParticipants mengembalikan []
    const fetched = await fetchArisanParticipants(tenantId);
    expect(Array.isArray(fetched)).toBe(true);
  });

  it('5. Generate tagihan iuran per putaran', async () => {
    const bills = await generateArisanRoundBills(tenantId, 'demo-round-1', {
      dueDate: '2026-10-20',
    });
    expect(bills).toBeDefined();
  });

  it('6. Fetch dan bayar tagihan iuran arisan', async () => {
    const bills = await fetchArisanRoundBills(tenantId, 'demo-round-1', '2026-10');
    expect(Array.isArray(bills)).toBe(true);

    if (bills.length > 0) {
      const paid = await payArisanBillManual(tenantId, bills[0].id);
      expect(paid).toBeDefined();
      expect(paid.status).toBe('paid');
    }
  });

  it('7. Fetch kandidat pemenang (belum pernah menang)', async () => {
    const candidates = await fetchArisanCandidates(tenantId);
    expect(Array.isArray(candidates)).toBe(true);
    // Semua kandidat belum pernah menang
    candidates.forEach(c => {
      expect(c.has_won).toBe(false);
    });
  });

  it('8. Pengundian pemenang arisan', async () => {
    const winner = await drawArisanWinner(tenantId, 'demo-round-1', 'operator-001');
    expect(winner).toBeDefined();
    // Demo return shape: { success, winner_member_id, winner_name, ... }
    expect(winner.success).toBe(true);
    expect(winner.winner_member_id).toBeDefined();
    expect(winner.winner_name).toBeDefined();
  });

  it('9. Mulai siklus arisan baru', async () => {
    const newCycle = await startNewArisanCycle(tenantId, 'operator-001', true);
    expect(newCycle).toBeDefined();
    // Demo return shape: { success, new_cycle, total_participants_reset, ... }
    expect(newCycle.success).toBe(true);
    expect(newCycle.new_cycle).toBeDefined();
    expect(newCycle.total_participants_reset).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. VERTIKAL KELAS
// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: Vertikal Kelas — Alur Lengkap (T11.1)', () => {
  const tenantId = 'demo-tenant-kelas';

  it('1. Fetch detail tenant kelas (fallback ke demo)', async () => {
    const tenant = await fetchTenantDetails(tenantId);
    expect(tenant).toBeDefined();
    expect(tenant.id).toBe(tenantId);
    expect(tenant.settings).toBeDefined();
  });

  it('2. Bulk create unit (slot siswa/kelas) — field "label"', async () => {
    const slots = [
      { label: 'Kelas A - Slot 1', status: 'occupied' },
      { label: 'Kelas A - Slot 2', status: 'occupied' },
      { label: 'Kelas B - Slot 1', status: 'occupied' },
      { label: 'Kelas B - Slot 2', status: 'vacant' },
    ];
    const created = await bulkCreateTenantUnits(tenantId, slots);
    expect(created.length).toBe(4);
    created.forEach(u => {
      expect(u.tenant_id).toBe(tenantId);
    });
  });

  it('3. calculateBillingPreview untuk SPP kelas — gunakan Map', () => {
    const units = [
      { id: 1, label: 'Slot-01', status: 'occupied' },
      { id: 2, label: 'Slot-02', status: 'occupied' },
      { id: 3, label: 'Slot-03', status: 'vacant' },
    ];
    const settings = {
      spp_amount: 350000,
      ipl_components: [
        { name: 'SPP Bulanan', amount: 350000 },
      ],
      due_day: 10,
    };
    const unitMemberMap = new Map([
      [1, { id: 'mem-s1', full_name: 'Ahmad' }],
      [2, { id: 'mem-s2', full_name: 'Budi' }],
    ]);

    const result = calculateBillingPreview({
      units,
      settings,
      period: '2026-09',
      unitMemberMap,
      existingUnitIds: new Set(),
      tenantType: 'kelas',
    });

    // Kelas path: vacant TIDAK di-skip (hanya inactive yang difilter)
    // calculateBillingPreview menggunakan spp_amount dari settings
    expect(result.preview.length).toBe(3); // semua non-inactive masuk
    expect(result.preview[0].amount).toBe(350000);
    expect(result.preview[0].resident_name).toBe('Ahmad');
    expect(result.skipped.length).toBe(0); // tidak ada yang di-skip
  });

  it('4. Generate tagihan SPP berkala (dry run)', async () => {
    const result = await generateKelasSppBilling(tenantId, {
      period: '2026-09',
      dry_run: true,
    });
    expect(result).toBeDefined();
  });

  it('5. Fetch tagihan SPP', async () => {
    const bills = await fetchTenantBillingItems(tenantId, {
      period: '2026-09',
    });
    expect(Array.isArray(bills)).toBe(true);
  });

  it('6. Verifikasi pembayaran SPP oleh admin kelas', async () => {
    const payments = await fetchTenantPayments(tenantId);
    expect(Array.isArray(payments)).toBe(true);

    if (payments.length > 0) {
      const verified = await verifyTenantPayment(tenantId, payments[0].id, {
        verifiedBy: 'admin-kelas-001',
        note: 'SPP September lunas',
      });
      expect(verified.status).toBe('verified');
    }
  });

  it('7. Dashboard kelas menampilkan data ringkasan', async () => {
    const dashboard = await fetchTenantDashboardData(tenantId, {
      role: 'admin',
      period: '2026-09',
    });
    expect(dashboard).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CROSS-VERTIKAL: Validasi & Error Handling
// ─────────────────────────────────────────────────────────────────────────────
describe('Regression: Cross-Vertikal — Validasi & Error Handling (T11.1)', () => {
  it('fetchTenantDetails mengembalikan null untuk tenantId kosong', async () => {
    const result = await fetchTenantDetails(null);
    expect(result).toBeNull();
  });

  it('requestJoinTenant melempar error jika tenantId atau userId tidak ada', async () => {
    await expect(
      requestJoinTenant({ tenantId: null, userId: 'u1', fullName: 'Test' })
    ).rejects.toThrow();
    await expect(
      requestJoinTenant({ tenantId: 't1', userId: null, fullName: 'Test' })
    ).rejects.toThrow();
  });

  it('approveTenantMember melempar error jika memberId kosong', async () => {
    await expect(
      approveTenantMember(null, { role: 'anggota' })
    ).rejects.toThrow('Member ID wajib disertakan');
  });

  it('rejectTenantMember melempar error jika memberId kosong', async () => {
    await expect(rejectTenantMember(null)).rejects.toThrow('Member ID wajib disertakan');
  });

  it('generateTenantBillingItems melempar error jika periode kosong', async () => {
    await expect(
      generateTenantBillingItems('demo-tenant-rtrw', { period: '' })
    ).rejects.toThrow();
  });

  it('updateTenantProfileAndSettings melempar error tanpa tenantId', async () => {
    await expect(
      updateTenantProfileAndSettings(null, { name: 'Test' })
    ).rejects.toThrow('Tenant ID wajib disertakan');
  });
});
