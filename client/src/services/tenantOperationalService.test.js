import { describe, it, expect, vi } from 'vitest';
import { supabase } from './supabaseClient';
import {
  generateInviteCode,
  calculateBillingPreview,
  generateTenantBillingItems,
  fetchTenantPayments,
  verifyTenantPayment,
  rejectTenantPayment,
  fetchTenantExpenses,
  createTenantExpense,
  updateTenantExpense,
  deleteTenantExpense,
  fetchTenantMonthlyFinance,
  fetchTenantRunningBalance,
  fetchTenantDashboardData,
  fetchTenantDetails,
  bulkCreateTenantUnits,
  updateTenantProfileAndSettings,
  createTenantBillingItem,
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
  getTenantBankAccount,
  saveTenantBankAccount,
  isLegacyQrisEnabled,
  fetchTenantInviteCode,
  saveTenantInviteCode,
  fetchTenantSettingsAudit,
  INVITE_CODE_ALPHABET,
} from './tenantOperationalService';

describe('tenantOperationalService - Unit Tests', () => {
  describe('generateInviteCode (SEC-3F.1)', () => {
    it('menghasilkan kode undangan dengan format regex RW-<maks 4 huruf>-XXXX-XXXX dan panjang tepat', () => {
      const code1 = generateInviteCode('Palm Village');
      expect(code1).toMatch(/^RW-PALM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      expect(code1.length).toBe(17);

      const code2 = generateInviteCode('Bougenville');
      expect(code2).toMatch(/^RW-BOUG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      expect(code2.length).toBe(17);

      const codeEmpty = generateInviteCode('');
      expect(codeEmpty).toMatch(/^RW-RW-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      expect(codeEmpty.length).toBe(15);
    });

    it('hanya menggunakan karakter dari alfabet yang diizinkan (tanpa karakter ambigu I, O, 0, 1)', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateInviteCode('Test');
        const parts = code.split('-');
        const randomPart = parts[2] + parts[3];
        expect(randomPart.length).toBe(8);
        for (const char of randomPart) {
          expect(INVITE_CODE_ALPHABET.includes(char)).toBe(true);
          expect(['I', 'O', '0', '1'].includes(char)).toBe(false);
        }
      }
    });

    it('menghasilkan 1.000 panggilan tanpa ada duplikat (collision-free)', () => {
      const generatedCodes = new Set();
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        const code = generateInviteCode('RW05');
        expect(generatedCodes.has(code)).toBe(false);
        generatedCodes.add(code);
      }
      expect(generatedCodes.size).toBe(iterations);
    });
  });

  describe('calculateBillingPreview (Pure Calculation Engine)', () => {
    const sampleUnits = [
      { id: 1, label: 'Blok A-01', status: 'active' },
      { id: 2, label: 'Blok A-02', status: 'active' },
      { id: 3, label: 'Blok A-03', status: 'inactive' }, // inactive harus di-filter
    ];

    const sampleSettings = {
      ipl_components: [
        { name: 'Keamanan', amount: 90000 },
        { name: 'Kebersihan', amount: 35000 },
        { name: 'Kas RT', amount: 25000 },
      ],
      due_day: 15,
    };

    it('menghitung total nominal tagihan dari penjumlahan seluruh komponen IPL', () => {
      const result = calculateBillingPreview({
        tenantId: 'tenant-test-1',
        period: '2026-10',
        units: sampleUnits,
        settings: sampleSettings,
      });

      // 90.000 + 35.000 + 25.000 = 150.000
      expect(result.totalAmount).toBe(150000);
      expect(result.dueDate).toBe('2026-10-15');
      // Hanya 2 unit aktif (Blok A-01, Blok A-02), unit 3 inactive dilewati
      expect(result.preview.length).toBe(2);
      expect(result.preview[0].amount).toBe(150000);
      expect(result.preview[0].status).toBe('unpaid');
    });

    it('melewati (skip) unit yang sudah memiliki tagihan pada periode yang sama', () => {
      const existing = new Set([1]); // Unit 1 sudah ada tagihan

      const result = calculateBillingPreview({
        tenantId: 'tenant-test-1',
        period: '2026-10',
        units: sampleUnits,
        settings: sampleSettings,
        existingUnitIds: existing,
      });

      // Hanya unit 2 yang siap dibuat
      expect(result.preview.length).toBe(1);
      expect(result.preview[0].unit_id).toBe(2);

      // Unit 1 masuk ke list skipped
      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0].unit_id).toBe(1);
      expect(result.skipped[0].reason).toBe('already_exists');
    });

    it('memasangkan nama warga jika ada di unitMemberMap', () => {
      const memberMap = new Map();
      memberMap.set(2, { id: 'mem-2', full_name: 'Pak Bambang' });

      const result = calculateBillingPreview({
        tenantId: 'tenant-test-1',
        period: '2026-10',
        units: sampleUnits,
        settings: sampleSettings,
        unitMemberMap: memberMap,
      });

      const billUnit2 = result.preview.find((p) => p.unit_id === 2);
      expect(billUnit2.member_id).toBe('mem-2');
      expect(billUnit2.resident_name).toBe('Pak Bambang');

      const billUnit1 = result.preview.find((p) => p.unit_id === 1);
      expect(billUnit1.member_id).toBeNull();
      expect(billUnit1.resident_name).toBe('Belum Terdaftar / Kosong');
    });
  });

  describe('generateTenantBillingItems Validation', () => {
    it('melempar error jika tenantId atau periode tidak disediakan', async () => {
      await expect(generateTenantBillingItems('', { period: '2026-10' })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );

      await expect(generateTenantBillingItems('demo-tenant-1', { period: 'invalid-period' })).rejects.toThrow(
        'Format periode harus YYYY-MM.'
      );
    });

    it('menghasilkan dry run preview tagihan untuk seluruh unit aktif di demo mode', async () => {
      const result = await generateTenantBillingItems('demo-tenant-rtrw', {
        period: '2026-10',
        dry_run: true,
      });

      expect(result).toBeDefined();
      expect(result.dry_run).toBe(true);
      expect(result.period).toBe('2026-10');
      expect(result.total_preview).toBeGreaterThan(0);
      expect(result.generated_count).toBe(0); // Dry run tidak menyimpan
      expect(result.preview[0]).toHaveProperty('amount');
      expect(result.preview[0]).toHaveProperty('due_date');
      expect(result.preview[0].due_date).toMatch(/^2026-10-\d{2}$/);
      expect(result.preview[0].metadata).toHaveProperty('components');
    });
  });

  describe('Payment Verification Operations', () => {
    it('melempar error jika tenantId atau paymentId tidak disediakan saat verifikasi/penolakan', async () => {
      await expect(verifyTenantPayment('', 'pay-1')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
      await expect(verifyTenantPayment('tenant-1', '')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
      await expect(rejectTenantPayment('', 'pay-1')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
      await expect(rejectTenantPayment('tenant-1', '')).rejects.toThrow(
        'tenantId dan paymentId wajib disertakan.'
      );
    });

    it('mengembalikan array pembayaran pada mode demo tenant', async () => {
      const payments = await fetchTenantPayments('demo-tenant-rtrw');
      expect(Array.isArray(payments)).toBe(true);
      expect(payments.length).toBeGreaterThan(0);
      expect(payments[0]).toHaveProperty('id');
      expect(payments[0]).toHaveProperty('amount');
      expect(payments[0]).toHaveProperty('status');
    });

    it('berhasil memverifikasi pembayaran pada mode demo tenant', async () => {
      const result = await verifyTenantPayment('demo-tenant-rtrw', 'pay-pending-1', {
        verifiedBy: 'Bendahara Test',
        note: 'Bukti transfer valid',
      });
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('verified');
    });

    it('berhasil menolak pembayaran dengan alasan pada mode demo tenant', async () => {
      const result = await rejectTenantPayment('demo-tenant-rtrw', 'pay-pending-2', {
        rejectedBy: 'Bendahara Test',
        reason: 'Bukti transfer buram dan tidak terbaca',
      });
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('rejected');
    });
  });

  describe('Expenses and Financial Reports Operations', () => {
    it('mengambil daftar pengeluaran kas tenant pada mode demo', async () => {
      const expenses = await fetchTenantExpenses('demo-tenant-rtrw');
      expect(Array.isArray(expenses)).toBe(true);
      expect(expenses.length).toBeGreaterThan(0);
      expect(expenses[0]).toHaveProperty('category');
      expect(expenses[0]).toHaveProperty('amount');
    });

    it('berhasil mencatat pengeluaran baru pada mode demo tenant', async () => {
      const newExpense = await createTenantExpense('demo-tenant-rtrw', {
        date: '2026-10-01',
        category: 'Kebersihan',
        amount: 250000,
        description: 'Beli sapu dan kantong sampah',
      });
      expect(newExpense).toBeDefined();
      expect(newExpense.amount).toBe(250000);
      expect(newExpense.category).toBe('Kebersihan');
    });

    it('menghitung laporan keuangan bulanan dan saldo kas berjalan', async () => {
      const fin = await fetchTenantMonthlyFinance('demo-tenant-rtrw', { year: 2026, month: 10 });
      expect(fin).toBeDefined();
      expect(fin.report).toHaveProperty('total_income');
      expect(fin.report).toHaveProperty('total_expense');
      expect(fin.report).toHaveProperty('net_income');
      expect(Array.isArray(fin.expenses)).toBe(true);

      const bal = await fetchTenantRunningBalance('demo-tenant-rtrw', { year: 2026, month: 10 });
      expect(bal).toBeDefined();
      expect(Array.isArray(bal.chain)).toBe(true);
      expect(bal.chain.length).toBeGreaterThan(0);
      expect(bal.chain[0]).toHaveProperty('closingBalance');
    });

    it('memuat ringkasan data dashboard operasional tenant RT/RW dengan metrik lengkap', async () => {
      const dash = await fetchTenantDashboardData('demo-tenant-rtrw', { role: 'admin', period: '2026-10' });
      expect(dash).toBeDefined();
      expect(dash.period).toBe('2026-10');
      expect(dash.year).toBe(2026);
      expect(dash.month).toBe(10);
      expect(dash.units).toBeDefined();
      expect(dash.units.total).toBeGreaterThan(0);
      expect(dash.members).toBeDefined();
      expect(dash.finance).toBeDefined();
      expect(dash.billing).toBeDefined();
      expect(dash.billing).toHaveProperty('totalBilled');
      expect(dash.billing).toHaveProperty('totalCollected');
      expect(dash.billing).toHaveProperty('collectionRate');
      expect(typeof dash.pendingRegistrationCount).toBe('number');
      expect(typeof dash.pendingPaymentCount).toBe('number');
    });
  });

  describe('Kos Vertical Setup & Operational Unit Tests (T7.1)', () => {
    it('mengambil data tenant kos dengan tipe dan konfigurasi sewa yang tepat', async () => {
      const tenant = await fetchTenantDetails('demo-tenant-kos');
      expect(tenant).toBeDefined();
      expect(tenant.type).toBe('kos');
      expect(tenant.name).toBe('Kos Melati Harmoni');
      expect(tenant.settings).toBeDefined();
      expect(tenant.settings.default_rent_price).toBe(1200000);
      expect(tenant.settings.billing_cycle).toBe('monthly');
    });

    it('berhasil melakukan inisiasi kamar kos dengan status awal vacant dan metadata', async () => {
      const roomsToCreate = [
        {
          label: 'Kamar 101',
          status: 'vacant',
          metadata: { facilities: ['AC', 'Kamar Mandi Dalam'], price: 1200000 },
        },
        {
          label: 'Kamar 102',
          status: 'vacant',
          metadata: { facilities: ['AC', 'WiFi'], price: 1200000 },
        },
      ];

      const created = await bulkCreateTenantUnits('demo-tenant-kos', roomsToCreate);
      expect(Array.isArray(created)).toBe(true);
      expect(created.length).toBe(2);
      expect(created[0].label).toBe('Kamar 101');
      expect(created[0].status).toBe('vacant');
      expect(created[1].label).toBe('Kamar 102');
      expect(created[1].status).toBe('vacant');
    });

    it('berhasil menyimpan profil dan settings wizard kos', async () => {
      const updated = await updateTenantProfileAndSettings('demo-tenant-kos', {
        name: 'Kos Melati Harmoni Sleman',
        address: 'Jl. Kaliurang KM 5',
        contact_phone: '081299887766',
        settings: {
          onboarding_completed: true,
          default_rent_price: 1350000,
          billing_cycle: 'monthly',
          due_day: 5,
        },
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Kos Melati Harmoni Sleman');
      expect(updated.settings.onboarding_completed).toBe(true);
      expect(updated.settings.default_rent_price).toBe(1350000);
      expect(updated.settings.due_day).toBe(5);
    });

    it('berhasil membuat tagihan sewa baru dengan field contract_start dan contract_end', async () => {
      const bill = await createTenantBillingItem('demo-tenant-kos', {
        unit_id: 1,
        member_id: 'member-kos-1',
        period: '2026-10',
        amount: 1200000,
        due_date: '2026-10-05',
        contract_start: '2026-10-01',
        contract_end: '2027-09-30',
        metadata: { billing_type: 'rent', note: 'Sewa 1 tahun' },
      });

      expect(bill).toBeDefined();
      expect(bill.amount).toBe(1200000);
      expect(bill.period).toBe('2026-10');
      expect(bill.contract_start).toBe('2026-10-01');
      expect(bill.contract_end).toBe('2027-09-30');
      expect(bill.metadata.billing_type).toBe('rent');
    });

    it('berhasil menetapkan kontrak sewa kamar (assignRoomContract) dan memvalidasi tanggal', async () => {
      const contract = await assignRoomContract('demo-tenant-kos', {
        unitId: 2,
        memberId: 'member-kos-2',
        contractStart: '2026-11-01',
        contractEnd: '2027-04-30',
        rentPrice: 1500000,
        notes: 'Sewa kamar 6 bulan',
      });

      expect(contract).toBeDefined();
      expect(contract.unitId).toBe(2);
      expect(contract.contractStart).toBe('2026-11-01');
      expect(contract.contractEnd).toBe('2027-04-30');
      expect(contract.bill).toBeDefined();
      expect(contract.bill.contract_start).toBe('2026-11-01');
      expect(contract.bill.contract_end).toBe('2027-04-30');
      expect(contract.bill.amount).toBe(1500000);

      // Validasi error jika tanggal selesai lebih kecil/sama dengan tanggal mulai
      await expect(
        assignRoomContract('demo-tenant-kos', {
          unitId: 2,
          contractStart: '2026-11-01',
          contractEnd: '2026-10-01',
          rentPrice: 1500000,
        })
      ).rejects.toThrow('Tanggal selesai kontrak harus lebih besar dari tanggal mulai kontrak.');
    });

    it('calculateBillingPreview khusus kos: melewati kamar vacant dan kamar tanpa kontrak aktif', () => {
      const kosRooms = [
        { id: 101, label: 'Kamar 101', status: 'vacant', metadata: { default_rent_price: 1200000 } },
        {
          id: 102,
          label: 'Kamar 102',
          status: 'occupied',
          metadata: {
            rent_price: 1300000,
            contract_start: '2026-08-01',
            contract_end: '2027-01-31',
          },
        },
        {
          id: 103,
          label: 'Kamar 103',
          status: 'occupied',
          metadata: {
            rent_price: 1500000,
            contract_start: '2026-11-01',
            contract_end: '2027-04-30',
          },
        },
      ];

      const res = calculateBillingPreview({
        tenantId: 'demo-tenant-kos',
        tenantType: 'kos',
        period: '2026-09',
        units: kosRooms,
        settings: { billing_due_day: 5 },
      });

      // Kamar 101: vacant -> dilewati
      // Kamar 102: occupied & kontrak aktif (Agustus 2026 - Januari 2027) -> dibuat tagihan
      // Kamar 103: occupied tapi kontrak baru mulai November 2026 -> dilewati
      expect(res.preview.length).toBe(1);
      expect(res.preview[0].unit_id).toBe(102);
      expect(res.preview[0].amount).toBe(1300000);
      expect(res.preview[0].due_date).toBe('2026-09-05');
      expect(res.preview[0].metadata.billing_type).toBe('rent');

      expect(res.skipped.length).toBe(2);
      expect(res.skipped.find((s) => s.unit_id === 101).reason).toBe('room_vacant');
      expect(res.skipped.find((s) => s.unit_id === 103).reason).toBe('contract_inactive');
    });

    it('autoGenerateKosBilling dapat berjalan dan menghasilkan tagihan sewa bulanan', async () => {
      const res = await autoGenerateKosBilling('demo-tenant-kos', {
        period: '2026-09',
      });

      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.period).toBe('2026-09');
      expect(typeof res.generated_count).toBe('number');
      expect(typeof res.skipped_count).toBe('number');
      expect(Array.isArray(res.items)).toBe(true);
    });

    it('checkoutKosRoom berhasil mengubah status kamar menjadi vacant dan mencatat riwayat checkout', async () => {
      const res = await checkoutKosRoom('demo-tenant-kos', {
        unitId: 2,
        checkoutDate: '2026-11-20',
        reason: 'Penyewa selesai kontrak dan mengembalikan kunci',
      });

      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.unit_id).toBe(2);
      expect(res.status).toBe('vacant');
      expect(res.checkout_date).toBe('2026-11-20');

      // Validasi error jika parameter tidak lengkap
      await expect(checkoutKosRoom('', { unitId: 2 })).rejects.toThrow('Tenant ID wajib disertakan.');
      await expect(checkoutKosRoom('demo-tenant-kos', {})).rejects.toThrow('Kamar (unitId) wajib ditentukan untuk checkout.');
    });
  });

  describe('Arisan Operational Helpers (T8.2)', () => {
    it('fetchArisanRounds mengembalikan putaran arisan yang valid', async () => {
      const rounds = await fetchArisanRounds('demo-arisan-tenant');
      expect(Array.isArray(rounds)).toBe(true);
      expect(rounds.length).toBeGreaterThan(0);
      expect(rounds[0].status).toBe('collecting');
      expect(rounds[0].round_number).toBe(1);
    });

    it('createArisanRound berhasil membuat putaran arisan baru dengan struktur lengkap', async () => {
      const newRound = await createArisanRound('demo-arisan-tenant', {
        round_number: 2,
        period: 'Putaran 2 - November 2026',
        total_pool_amount: 5000000,
      });

      expect(newRound).toBeDefined();
      expect(newRound.round_number).toBe(2);
      expect(newRound.period).toBe('Putaran 2 - November 2026');
      expect(newRound.total_pool_amount).toBe(5000000);
      expect(newRound.status).toBe('collecting');

      // Validasi error jika tenantId kosong
      await expect(createArisanRound('', {})).rejects.toThrow('Tenant ID wajib diisi.');
    });

    it('enrollArisanParticipants dan fetchArisanParticipants menangani peserta arisan', async () => {
      const mockParticipants = [
        { member_id: 'member-1', unit_slot_id: 1 },
        { member_id: 'member-2', unit_slot_id: 2 },
      ];

      const enrolled = await enrollArisanParticipants('demo-arisan-tenant', mockParticipants);
      expect(enrolled).toBeDefined();
      expect(enrolled.length).toBe(2);

      const emptyRes = await fetchArisanParticipants('');
      expect(emptyRes).toEqual([]);
    });

    it('generateArisanRoundBills memicu pembuatan tagihan iuran untuk seluruh peserta', async () => {
      const result = await generateArisanRoundBills('demo-arisan-tenant', 'demo-round-1');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.total_generated).toBe(10);
      expect(result.contribution_amount).toBe(300000);

      // Validasi error jika parameter kosong
      await expect(generateArisanRoundBills('', 'demo-round-1')).rejects.toThrow('Tenant ID wajib disertakan.');
      await expect(generateArisanRoundBills('demo-arisan-tenant', '')).rejects.toThrow('ID putaran arisan wajib disertakan.');
    });

    it('fetchArisanRoundBills mengambil daftar tagihan iuran peserta putaran', async () => {
      const bills = await fetchArisanRoundBills('demo-arisan-tenant', 'demo-round-1');
      expect(Array.isArray(bills)).toBe(true);
      expect(bills.length).toBe(2);
      expect(bills[0].status).toBe('paid');
      expect(bills[1].status).toBe('unpaid');

      const emptyRes = await fetchArisanRoundBills('');
      expect(emptyRes).toEqual([]);
    });

    it('payArisanBillManual memperbarui status tagihan iuran peserta menjadi paid', async () => {
      const payRes = await payArisanBillManual('demo-arisan-tenant', 'demo-bill-2');
      expect(payRes).toBeDefined();
      expect(payRes.success).toBe(true);
      expect(payRes.status).toBe('paid');

      // Validasi error jika parameter kosong
      await expect(payArisanBillManual('', 'demo-bill-2')).rejects.toThrow('Tenant ID dan Bill ID wajib diisi.');
      await expect(payArisanBillManual('demo-arisan-tenant', '')).rejects.toThrow('Tenant ID dan Bill ID wajib diisi.');
    });

    it('fetchArisanCandidates mengambil peserta yang belum pernah menang (has_won = false)', async () => {
      const candidates = await fetchArisanCandidates('demo-arisan-tenant');
      expect(Array.isArray(candidates)).toBe(true);
      expect(candidates.length).toBe(2);
      expect(candidates[0].has_won).toBe(false);

      const emptyRes = await fetchArisanCandidates('');
      expect(emptyRes).toEqual([]);
    });

    it('drawArisanWinner berhasil memilih pemenang acak dan mengembalikan data pemenang', async () => {
      const result = await drawArisanWinner('demo-arisan-tenant', 'demo-round-1', 'demo-admin-id');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.round_id).toBe('demo-round-1');
      expect(result.winner_member_id).toBeDefined();
      expect(result.winner_name).toBe('Pak Budi');
      expect(result.total_prize).toBe(3000000);
      expect(typeof result.remaining_candidates).toBe('number');

      // Validasi error jika parameter kosong
      await expect(drawArisanWinner('', 'demo-round-1')).rejects.toThrow('Tenant ID wajib disertakan.');
      await expect(drawArisanWinner('demo-arisan-tenant', '')).rejects.toThrow('ID putaran arisan wajib disertakan.');
    });

    it('startNewArisanCycle berhasil mereset status peserta dan menaikkan siklus baru (T8.7)', async () => {
      const resetRes = await startNewArisanCycle('demo-arisan-tenant', 'demo-admin-id', false);
      expect(resetRes).toBeDefined();
      expect(resetRes.success).toBe(true);
      expect(resetRes.tenant_id).toBe('demo-arisan-tenant');
      expect(resetRes.new_cycle).toBe(2);
      expect(typeof resetRes.total_participants_reset).toBe('number');
      expect(resetRes.reset_at).toBeDefined();

      // Validasi error jika tenantId kosong
      await expect(startNewArisanCycle('', 'demo-admin-id')).rejects.toThrow('Tenant ID wajib disertakan.');
    });
  });

  describe('Kelas Vertical SPP Billing Unit Tests (T9.2)', () => {
    it('calculateBillingPreview menghasilkan tagihan SPP berkala untuk tenant tipe kelas', () => {
      const mockUnits = [
        { id: 'seat-1', label: 'Siswa #01', status: 'active', metadata: { expected_spp: 250000 } },
        { id: 'seat-2', label: 'Siswa #02', status: 'active', metadata: {} },
        { id: 'seat-3', label: 'Siswa #03', status: 'inactive' }, // tidak boleh ditagih
      ];

      const mockSettings = {
        class_type: 'reguler',
        subject: 'Matematika',
        instructor_name: 'Ibu Rina',
        spp_amount: 200000,
        due_day: 10,
      };

      const previewResult = calculateBillingPreview({
        tenantId: 'tenant-kelas-123',
        tenantType: 'kelas',
        period: '2026-10',
        units: mockUnits,
        settings: mockSettings,
        existingUnitIds: new Set(),
      });

      expect(previewResult).toBeDefined();
      expect(previewResult.dueDate).toBe('2026-10-10');
      expect(previewResult.preview).toHaveLength(2); // hanya 2 unit aktif

      // Slot 1 menggunakan expected_spp dari metadata
      expect(previewResult.preview[0].amount).toBe(250000);
      expect(previewResult.preview[0].metadata.bill_type).toBe('spp');
      expect(previewResult.preview[0].metadata.subject).toBe('Matematika');

      // Slot 2 fallback ke spp_amount dari settings kelas
      expect(previewResult.preview[1].amount).toBe(200000);
      expect(previewResult.preview[1].metadata.bill_type).toBe('spp');

      // Grand total = 250.000 + 200.000 = 450.000
      expect(previewResult.grandTotalAmount).toBe(450000);
    });

    it('generateKelasSppBilling memanggil pembuatan tagihan berkala SPP dengan validasi yang benar', async () => {
      const result = await generateKelasSppBilling('demo-tenant-id', {
        period: '2026-11',
        dry_run: true,
      });

      expect(result).toBeDefined();
      expect(result.period).toBe('2026-11');
      expect(Array.isArray(result.preview)).toBe(true);

      // Validasi error jika tenantId atau period tidak valid
      await expect(generateKelasSppBilling('', { period: '2026-11' })).rejects.toThrow('Tenant ID wajib disertakan.');
      await expect(generateKelasSppBilling('demo-tenant-id', { period: 'invalid' })).rejects.toThrow('Format periode harus YYYY-MM.');
    });
  });

  describe('PAY-2 Bank Account Helpers & Validation Tests (PAY-2.1 / PAY-2.5)', () => {
    describe('getTenantBankAccount', () => {
      it('mengembalikan objek bank account bila data lengkap', () => {
        const tenant = {
          settings: {
            bank_account: {
              bank_name: 'BCA',
              account_number: '8830123456',
              account_holder: 'Kas RT 05',
            },
          },
        };
        const result = getTenantBankAccount(tenant);
        expect(result).toEqual({
          bank_name: 'BCA',
          account_number: '8830123456',
          account_holder: 'Kas RT 05',
        });
      });

      it('mengembalikan null jika field tidak lengkap atau kosong', () => {
        expect(getTenantBankAccount(null)).toBeNull();
        expect(getTenantBankAccount({})).toBeNull();
        expect(getTenantBankAccount({ settings: {} })).toBeNull();
        expect(getTenantBankAccount({
          settings: {
            bank_account: { bank_name: 'BCA', account_number: '', account_holder: 'Kas' },
          },
        })).toBeNull();
        expect(getTenantBankAccount({
          settings: {
            bank_account: { bank_name: '', account_number: '12345678', account_holder: '' },
          },
        })).toBeNull();
      });
    });

    describe('isLegacyQrisEnabled (PAY-2F.2)', () => {
      it('mengembalikan true hanya jika settings.legacy_qris_enabled bernilai true', () => {
        expect(isLegacyQrisEnabled({ settings: { legacy_qris_enabled: true } })).toBe(true);
        expect(isLegacyQrisEnabled({ legacy_qris_enabled: true })).toBe(true);
      });

      it('mengembalikan false sebagai default untuk objek tanpa flag atau dengan flag false', () => {
        expect(isLegacyQrisEnabled(null)).toBe(false);
        expect(isLegacyQrisEnabled(undefined)).toBe(false);
        expect(isLegacyQrisEnabled({})).toBe(false);
        expect(isLegacyQrisEnabled({ settings: {} })).toBe(false);
        expect(isLegacyQrisEnabled({ settings: { legacy_qris_enabled: false } })).toBe(false);
        expect(isLegacyQrisEnabled({ settings: { legacy_qris_enabled: 'true' } })).toBe(false);
      });
    });

    describe('saveTenantBankAccount validation', () => {
      it('menolak nomor rekening yang memuat huruf atau karakter non-angka', async () => {
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: 'Mandiri',
            account_number: '1234ABCD5678',
            account_holder: 'Budi Santoso',
          })
        ).rejects.toThrow('Nomor rekening hanya boleh berisi angka');
      });

      it('membersihkan spasi dan strip pada nomor rekening saat disimpan', async () => {
        const result = await saveTenantBankAccount('demo-tenant-1', {
          bank_name: 'Bank Mandiri',
          account_number: ' 123-456-7890 12 ',
          account_holder: 'Budi Santoso',
        });
        expect(result.settings.bank_account.account_number).toBe('123456789012');
        expect(result.settings.bank_account.bank_name).toBe('Bank Mandiri');
        expect(result.settings.bank_account.account_holder).toBe('Budi Santoso');
      });

      it('menolak jika field wajib kosong atau hanya whitespace', async () => {
        // bank_name kosong
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: '   ',
            account_number: '123456789',
            account_holder: 'Budi Santoso',
          })
        ).rejects.toThrow('Nama bank wajib diisi.');

        // account_number kosong
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: 'BCA',
            account_number: '   ',
            account_holder: 'Budi Santoso',
          })
        ).rejects.toThrow('Nomor rekening wajib diisi.');

        // account_holder kosong
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: 'BCA',
            account_number: '123456789',
            account_holder: '   ',
          })
        ).rejects.toThrow('Nama pemilik rekening wajib diisi.');
      });

      it('menolak panjang karakter yang tidak valid (panjang digit & nama)', async () => {
        // digit rekening kurang dari 6
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: 'BCA',
            account_number: '12345',
            account_holder: 'Kas RT',
          })
        ).rejects.toThrow('Nomor rekening harus terdiri dari 6 hingga 20 digit angka.');

        // digit rekening lebih dari 20
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: 'BCA',
            account_number: '123456789012345678901',
            account_holder: 'Kas RT',
          })
        ).rejects.toThrow('Nomor rekening harus terdiri dari 6 hingga 20 digit angka.');

        // nama bank terlalu pendek (< 2 chars)
        await expect(
          saveTenantBankAccount('demo-tenant-1', {
            bank_name: 'B',
            account_number: '123456789',
            account_holder: 'Kas RT',
          })
        ).rejects.toThrow('Nama bank harus terdiri dari 2 hingga 50 karakter.');
      });
    });

    describe('PAY-2F.1 saveTenantBankAccount isolation & preservation (F10)', () => {
      it('melempar error dan TIDAK memanggil update jika fetchTenantDetails gagal', async () => {
        const updateSpy = vi.fn();
        const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
          if (table === 'tenants') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: new Error('Database connection failed'),
                  }),
                }),
              }),
              update: updateSpy,
            };
          }
          return {};
        });

        await expect(
          saveTenantBankAccount('prod-tenant-uuid-1', {
            bank_name: 'BCA',
            account_number: '1234567890',
            account_holder: 'Kas RT',
          })
        ).rejects.toThrow('Gagal memuat pengaturan tenant, rekening tidak disimpan.');

        expect(updateSpy).not.toHaveBeenCalled();
        fromSpy.mockRestore();
      });

      it('mempertahankan settings lama (invite_code, due_day, ipl_schemas) saat menyimpan rekening', async () => {
        let capturedUpdatePayload = null;
        const oldSettings = {
          invite_code: 'RW-TEST-1234',
          due_day: 15,
          ipl_schemas: [{ id: 1, name: 'Reguler', amount: 100000 }],
        };

        const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
          if (table === 'tenants') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'prod-tenant-uuid-2',
                      name: 'Komunitas Harmoni',
                      settings: oldSettings,
                    },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn((payload) => {
                capturedUpdatePayload = payload;
                return {
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: {
                          id: 'prod-tenant-uuid-2',
                          settings: payload.settings,
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              }),
            };
          }
          return {};
        });

        const result = await saveTenantBankAccount('prod-tenant-uuid-2', {
          bank_name: 'Bank Mandiri',
          account_number: '9876543210',
          account_holder: 'Pengurus Komunitas',
        });

        expect(capturedUpdatePayload).toBeDefined();
        expect(capturedUpdatePayload.settings).toBeDefined();
        // Semua key lama wajib ada
        expect(capturedUpdatePayload.settings.invite_code).toBe('RW-TEST-1234');
        expect(capturedUpdatePayload.settings.due_day).toBe(15);
        expect(capturedUpdatePayload.settings.ipl_schemas).toEqual([
          { id: 1, name: 'Reguler', amount: 100000 },
        ]);
        // Key bank_account baru terpasang
        expect(capturedUpdatePayload.settings.bank_account).toEqual({
          bank_name: 'Bank Mandiri',
          account_number: '9876543210',
          account_holder: 'Pengurus Komunitas',
        });

        expect(result.settings.bank_account.bank_name).toBe('Bank Mandiri');
        fromSpy.mockRestore();
      });
    });
  });

  describe('SEC-3 Tenant Invites & Settings Audit (SEC-3.5)', () => {
    describe('fetchTenantInviteCode & saveTenantInviteCode', () => {
      it('mengambil kode undangan dari mock data untuk demo tenant', async () => {
        const code = await fetchTenantInviteCode('demo-tenant-kos');
        expect(code).toBe('RW-KOS-2026');
      });

      it('menyimpan dan memperbarui kode undangan pada mode demo', async () => {
        const success = await saveTenantInviteCode('demo-tenant-custom', 'RW-CUST-9999');
        expect(success).toBe(true);
        const code = await fetchTenantInviteCode('demo-tenant-custom');
        expect(code).toBe('RW-CUST-9999');
      });

      it('mengambil kode undangan dari Supabase tenant_invites saat production', async () => {
        const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
          if (table === 'tenant_invites') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { code: 'PROD-INV-7777' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        });

        const code = await fetchTenantInviteCode('prod-tenant-uuid-3');
        expect(code).toBe('PROD-INV-7777');
        fromSpy.mockRestore();
      });

      it('mengembalikan null jika user tidak berhak (RLS error) atau data tidak ada', async () => {
        const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
          if (table === 'tenant_invites') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'permission denied for table tenant_invites' },
                  }),
                }),
              }),
            };
          }
          return {};
        });

        const code = await fetchTenantInviteCode('prod-tenant-uuid-4');
        expect(code).toBeNull();
        fromSpy.mockRestore();
      });

      it('menyimpan kode undangan ke Supabase dengan upsert', async () => {
        let upsertPayload = null;
        const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
          if (table === 'tenant_invites') {
            return {
              upsert: vi.fn((payload) => {
                upsertPayload = payload;
                return Promise.resolve({ error: null });
              }),
            };
          }
          return {};
        });

        const success = await saveTenantInviteCode('prod-tenant-uuid-5', 'rw-new-8888');
        expect(success).toBe(true);
        expect(upsertPayload).toBeDefined();
        expect(upsertPayload.tenant_id).toBe('prod-tenant-uuid-5');
        expect(upsertPayload.code).toBe('RW-NEW-8888');
        fromSpy.mockRestore();
      });
    });

    describe('fetchTenantSettingsAudit', () => {
      it('mengambil riwayat perubahan rekening di demo mode', async () => {
        const logs = await fetchTenantSettingsAudit('demo-tenant-rtrw');
        expect(Array.isArray(logs)).toBe(true);
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].field).toBe('bank_account');
        expect(logs[0].new_value.bank_name).toBe('BCA');
      });

      it('mengambil riwayat perubahan rekening dan mencocokkan nama pengubah dari tenant_members', async () => {
        const mockAuditRows = [
          {
            id: 'audit-1',
            tenant_id: 'prod-tenant-audit',
            changed_by: 'user-audit-1',
            field: 'bank_account',
            old_value: { bank_name: 'BCA', account_number: '111', account_holder: 'Lama' },
            new_value: { bank_name: 'Mandiri', account_number: '222', account_holder: 'Baru' },
            changed_at: '2026-10-10T10:00:00Z',
          },
        ];

        const mockMembers = [
          { user_id: 'user-audit-1', full_name: 'Ahmad Pengurus' },
        ];

        const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
          if (table === 'tenant_settings_audit') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: mockAuditRows,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'tenant_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({
                    data: mockMembers,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        });

        const logs = await fetchTenantSettingsAudit('prod-tenant-audit');
        expect(logs.length).toBe(1);
        expect(logs[0].changed_by_name).toBe('Ahmad Pengurus');
        expect(logs[0].old_value.bank_name).toBe('BCA');
        expect(logs[0].new_value.bank_name).toBe('Mandiri');

        fromSpy.mockRestore();
      });
    });
  });
});



