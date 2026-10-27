import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTodayWib,
  getDiffDaysWib,
  getRentDueBannerInfo,
  fetchTodayReminders,
  markRentReminder,
  fetchKosArrears,
  resetDemoCollectionsStore,
} from './collections';
import { supabase } from './shared';

describe('collections.js Service & Helpers (KOS-5.2b)', () => {
  beforeEach(() => {
    resetDemoCollectionsStore();
    vi.clearAllMocks();
  });

  describe('WIB Date & Reminder Helpers', () => {
    it('1. getTodayWib mengembalikan string tanggal YYYY-MM-DD dalam Asia/Jakarta', () => {
      // 2026-10-27T18:00:00Z di UTC sama dengan 2026-10-28T01:00:00 di WIB (UTC+7)
      const lateUtcDate = new Date('2026-10-27T18:00:00Z');
      expect(getTodayWib(lateUtcDate)).toBe('2026-10-28');

      // 2026-10-27T10:00:00Z di UTC sama dengan 2026-10-27T17:00:00 di WIB
      const daytimeUtcDate = new Date('2026-10-27T10:00:00Z');
      expect(getTodayWib(daytimeUtcDate)).toBe('2026-10-27');
    });

    it('2. getDiffDaysWib menghitung selisih hari kalender murni tanpa timezone drift', () => {
      const today = new Date('2026-10-27T10:00:00Z'); // 2026-10-27 WIB

      // 3 hari lagi
      expect(getDiffDaysWib('2026-10-30', today)).toBe(3);
      // Hari ini
      expect(getDiffDaysWib('2026-10-27', today)).toBe(0);
      // Terlambat 5 hari
      expect(getDiffDaysWib('2026-10-22', today)).toBe(-5);
      // null jika dueDate tidak valid
      expect(getDiffDaysWib(null, today)).toBeNull();
      expect(getDiffDaysWib('', today)).toBeNull();
    });

    it('3. getRentDueBannerInfo: <= 3 hari -> Tagihan <periode> jatuh tempo N hari lagi', () => {
      const today = new Date('2026-10-27T10:00:00Z'); // 2026-10-27 WIB
      const bill = {
        period: '2026-10',
        due_date: '2026-10-30',
        status: 'unpaid',
        late_fee: 0,
      };

      const banner = getRentDueBannerInfo(bill, today);
      expect(banner).not.toBeNull();
      expect(banner.type).toBe('approaching');
      expect(banner.diffDays).toBe(3);
      expect(banner.headline).toBe('Tagihan Oktober jatuh tempo 3 hari lagi');
      expect(banner.shortText).toBe('Jatuh tempo 3 hari lagi');
      expect(banner.variant).toBe('amber');
    });

    it('4. getRentDueBannerInfo: hari H -> Tagihan <periode> jatuh tempo hari ini', () => {
      const today = new Date('2026-10-27T10:00:00Z'); // 2026-10-27 WIB
      const bill = {
        period: '2026-10',
        due_date: '2026-10-27',
        status: 'unpaid',
        late_fee: 0,
      };

      const banner = getRentDueBannerInfo(bill, today);
      expect(banner).not.toBeNull();
      expect(banner.type).toBe('today');
      expect(banner.diffDays).toBe(0);
      expect(banner.headline).toBe('Tagihan Oktober jatuh tempo hari ini');
      expect(banner.shortText).toBe('Jatuh tempo hari ini');
      expect(banner.variant).toBe('amber');
    });

    it('5. getRentDueBannerInfo: lewat jatuh tempo -> Terlambat N hari + denda bila ada', () => {
      const today = new Date('2026-10-27T10:00:00Z'); // 2026-10-27 WIB
      const billWithFee = {
        period: '2026-10',
        due_date: '2026-10-22',
        status: 'unpaid',
        late_fee: 50000,
      };

      const bannerFee = getRentDueBannerInfo(billWithFee, today);
      expect(bannerFee).not.toBeNull();
      expect(bannerFee.type).toBe('overdue');
      expect(bannerFee.daysLate).toBe(5);
      expect(bannerFee.headline).toBe('Tagihan Oktober terlambat 5 hari, denda Rp50.000');
      expect(bannerFee.shortText).toBe('Terlambat 5 hari, denda Rp50.000');
      expect(bannerFee.variant).toBe('rose');

      const billNoFee = {
        period: '2026-10',
        due_date: '2026-10-25',
        status: 'unpaid',
        late_fee: 0,
      };
      const bannerNoFee = getRentDueBannerInfo(billNoFee, today);
      expect(bannerNoFee.headline).toBe('Tagihan Oktober terlambat 2 hari');
      expect(bannerNoFee.shortText).toBe('Terlambat 2 hari');
    });

    it('6. getRentDueBannerInfo: lebih dari 3 hari sebelum jatuh tempo atau berstatus paid -> null', () => {
      const today = new Date('2026-10-27T10:00:00Z');
      const farBill = {
        period: '2026-11',
        due_date: '2026-11-10', // 14 hari lagi
        status: 'unpaid',
      };
      expect(getRentDueBannerInfo(farBill, today)).toBeNull();

      const paidBill = {
        period: '2026-10',
        due_date: '2026-10-20',
        status: 'paid',
        late_fee: 50000,
      };
      expect(getRentDueBannerInfo(paidBill, today)).toBeNull();
    });
  });

  describe('fetchTodayReminders', () => {
    it('7. fetchTodayReminders memvalidasi ID tenant wajib', async () => {
      await expect(fetchTodayReminders('')).rejects.toThrow('ID tenant wajib disertakan.');
    });

    it('8. fetchTodayReminders mode demo mengembalikan daftar pengingat pending', async () => {
      const data = await fetchTodayReminders('tenant-kos-1');
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);

      const first = data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('stage');
      expect(first).toHaveProperty('totalDue');
      expect(first.status).toBe('pending');
    });

    it('9. fetchTodayReminders mode Supabase memanggil tabel rent_reminders dengan filter tanggal hari ini', async () => {
      const mockRows = [
        {
          id: 'rem-real-1',
          tenant_id: 'tenant-real-kos',
          bill_id: 'bill-1',
          member_id: 'member-1',
          stage: 'h-3',
          remind_date: '2026-10-27',
          status: 'pending',
          billing_item: {
            id: 'bill-1',
            amount: 1500000,
            late_fee: 50000,
            period: '2026-10',
            due_date: '2026-10-30',
            tenant_units: { id: 1, label: 'Kamar Melati 01' },
          },
          tenant_members: {
            id: 'member-1',
            full_name: 'Dewi Sartika',
            phone: '0812345678',
          },
        },
      ];

      const spy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
              }),
            }),
          }),
        }),
      });

      try {
        const res = await fetchTodayReminders('tenant-real-kos');
        expect(res.length).toBe(1);
        expect(res[0].residentName).toBe('Dewi Sartika');
        expect(res[0].unit.label).toBe('Kamar Melati 01');
        expect(res[0].totalDue).toBe(1550000);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('markRentReminder', () => {
    it('10. markRentReminder memvalidasi parameter id dan status', async () => {
      await expect(markRentReminder('', 'sent')).rejects.toThrow('ID pengingat wajib disertakan.');
      await expect(markRentReminder('rem-1', 'invalid_status')).rejects.toThrow("harus 'sent' atau 'skipped'");
    });

    it('11. markRentReminder mode demo mengubah status item di in-memory store', async () => {
      const rems = await fetchTodayReminders('tenant-kos-1');
      const target = rems[0];

      const res = await markRentReminder(target.id, 'sent');
      expect(res.success).toBe(true);
      expect(res.status).toBe('sent');

      const after = await fetchTodayReminders('tenant-kos-1');
      const found = after.find((r) => r.id === target.id);
      expect(found).toBeUndefined(); // status sudah bukan pending
    });

    it('12. markRentReminder mode Supabase memanggil RPC mark_rent_reminder', async () => {
      const spy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: true, reminder_id: 'rem-rpc-1', status: 'skipped' },
        error: null,
      });

      try {
        const res = await markRentReminder('rem-rpc-1', 'skipped');
        expect(spy).toHaveBeenCalledWith('mark_rent_reminder', {
          p_reminder_id: 'rem-rpc-1',
          p_status: 'skipped',
        });
        expect(res.success).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('fetchKosArrears', () => {
    it('13. fetchKosArrears memvalidasi ID tenant', async () => {
      await expect(fetchKosArrears('')).rejects.toThrow('ID tenant wajib disertakan.');
    });

    it('14. fetchKosArrears mode demo mengembalikan daftar tunggakan kos', async () => {
      const res = await fetchKosArrears('tenant-kos-1');
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThan(0);

      const first = res[0];
      expect(first).toHaveProperty('nama');
      expect(first).toHaveProperty('unit');
      expect(first).toHaveProperty('total_due');
      expect(first).toHaveProperty('days_late');
      expect(first).toHaveProperty('bucket');
    });

    it('15. fetchKosArrears mode Supabase memanggil RPC get_kos_arrears', async () => {
      const mockArrears = [
        {
          member_id: 'm1',
          nama: 'Budi',
          unit: 'Kamar 101',
          total_due: 1550000,
          bills_count: 1,
          oldest_due_date: '2026-10-10',
          days_late: 17,
          bucket: '8-30',
        },
      ];

      const spy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: mockArrears,
        error: null,
      });

      try {
        const res = await fetchKosArrears('tenant-real-kos');
        expect(spy).toHaveBeenCalledWith('get_kos_arrears', {
          p_tenant_id: 'tenant-real-kos',
        });
        expect(res.length).toBe(1);
        expect(res[0].bucket).toBe('8-30');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
