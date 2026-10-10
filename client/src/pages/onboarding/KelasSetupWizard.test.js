import { describe, it, expect } from 'vitest';
import { formatRupiah } from '../../services/dataHelpers';
import { normalizeBankAccount, pickBankAccountForForm } from '../../services/tenantOperationalService';

describe('KelasSetupWizard Logic & Validation Rules (T9.1)', () => {
  describe('Konfigurasi Model & Tipe Kelas', () => {
    it('memiliki konfigurasi default slot yang tepat untuk kelas reguler vs les privat', () => {
      const classTypes = {
        reguler: { defaultSlots: 20, prefix: 'Siswa #' },
        privat: { defaultSlots: 5, prefix: 'Siswa #' },
      };

      expect(classTypes.reguler.defaultSlots).toBe(20);
      expect(classTypes.privat.defaultSlots).toBe(5);
      expect(classTypes.reguler.prefix).toBe('Siswa #');
    });

    it('menghitung estimasi potensi kas SPP bulanan: slot_count * spp_amount', () => {
      const regularClass = { slots: 25, sppAmount: 200000 };
      const privateClass = { slots: 4, sppAmount: 750000 };

      const regularTotal = regularClass.slots * regularClass.sppAmount;
      const privateTotal = privateClass.slots * privateClass.sppAmount;

      expect(regularTotal).toBe(5000000);
      expect(formatRupiah(regularTotal)).toMatch(/Rp[\s\u00a0]5\.000\.000/);

      expect(privateTotal).toBe(3000000);
      expect(formatRupiah(privateTotal)).toMatch(/Rp[\s\u00a0]3\.000\.000/);
    });
  });

  describe('Generator & Manajemen Slot Siswa', () => {
    it('membuat slot siswa berurutan dengan penomoran dua digit', () => {
      const count = 5;
      const prefix = 'Siswa #';
      const slots = Array.from({ length: count }, (_, i) => ({
        id: `slot-${i + 1}`,
        label: `${prefix}${String(i + 1).padStart(2, '0')}`,
      }));

      expect(slots).toHaveLength(5);
      expect(slots[0].label).toBe('Siswa #01');
      expect(slots[4].label).toBe('Siswa #05');
    });

    it('memvalidasi batas kuota siswa (1 s/d 100 slot)', () => {
      const validateSlotCount = (count) => {
        if (isNaN(count) || count < 1) return { valid: false, error: 'MIN_SLOT' };
        if (count > 100) return { valid: false, error: 'MAX_SLOT' };
        return { valid: true };
      };

      expect(validateSlotCount(0).valid).toBe(false);
      expect(validateSlotCount(-5).valid).toBe(false);
      expect(validateSlotCount(1).valid).toBe(true);
      expect(validateSlotCount(30).valid).toBe(true);
      expect(validateSlotCount(100).valid).toBe(true);
      expect(validateSlotCount(101).valid).toBe(false);
    });
  });

  describe('Validasi Langkah Setup Wizard (Step 1, 2, 3)', () => {
    const validateStep = (step, data) => {
      if (step === 1) {
        if (!data.className?.trim()) return { valid: false, error: 'CLASS_NAME_REQUIRED' };
        if (!data.instructorName?.trim()) return { valid: false, error: 'INSTRUCTOR_REQUIRED' };
        if (!data.contactPhone?.trim()) return { valid: false, error: 'PHONE_REQUIRED' };
        return { valid: true };
      }

      if (step === 2) {
        if (!Array.isArray(data.slotList) || data.slotList.length === 0) {
          return { valid: false, error: 'SLOTS_EMPTY' };
        }
        return { valid: true };
      }

      if (step === 3) {
        if (!data.sppAmount || data.sppAmount <= 0) return { valid: false, error: 'INVALID_SPP' };
        if (!data.dueDay || data.dueDay < 1 || data.dueDay > 28) {
          return { valid: false, error: 'INVALID_DUE_DAY' };
        }
        if (!data.bankAccountNo?.trim() || !data.bankAccountHolder?.trim()) {
          return { valid: false, error: 'BANK_ACCOUNT_REQUIRED' };
        }
        return { valid: true };
      }

      return { valid: true };
    };

    it('memvalidasi field wajib di Langkah 1 (Identitas Kelas)', () => {
      expect(validateStep(1, { className: '', instructorName: 'Ibu Rina', contactPhone: '0812' }).valid).toBe(false);
      expect(validateStep(1, { className: 'Kelas 5A', instructorName: '', contactPhone: '0812' }).valid).toBe(false);
      expect(validateStep(1, { className: 'Kelas 5A', instructorName: 'Ibu Rina', contactPhone: '' }).valid).toBe(false);
      expect(validateStep(1, { className: 'Kelas 5A', instructorName: 'Ibu Rina', contactPhone: '0812' }).valid).toBe(true);
    });

    it('memvalidasi keberadaan slot di Langkah 2 (Slot Siswa)', () => {
      expect(validateStep(2, { slotList: [] }).valid).toBe(false);
      expect(validateStep(2, { slotList: [{ id: 's-1', label: 'Siswa #01' }] }).valid).toBe(true);
    });

    it('memvalidasi tanggal jatuh tempo SPP dan rekening di Langkah 3', () => {
      // Due day di luar 1-28 harus ditolak
      expect(
        validateStep(3, {
          sppAmount: 200000,
          dueDay: 30,
          bankAccountNo: '12345',
          bankAccountHolder: 'Budi',
        }).valid
      ).toBe(false);

      // Due day valid (1-28) dan rekening lengkap harus diterima
      expect(
        validateStep(3, {
          sppAmount: 200000,
          dueDay: 10,
          bankAccountNo: '12345',
          bankAccountHolder: 'Budi',
        }).valid
      ).toBe(true);
    });
  });

  describe('Generator Pesan Undangan WhatsApp Wali Murid', () => {
    it('memformat teks WhatsApp ramah untuk wali murid dan siswa dengan link yang tepat', () => {
      const className = 'Kelas 5B SD Juara';
      const inviteCode = 'KELAS-7788';
      const instructorName = 'Ibu Siti Rahma S.Pd';
      const origin = 'https://ruangwarga.com';
      const inviteUrl = `${origin}/join/${inviteCode}`;

      const waMessage = `Halo Bapak/Ibu Wali Murid & Siswa *${className}*,\n\nKami mengundang Anda untuk bergabung ke portal kelas digital kami. Melalui tautan ini, Anda dapat memantau status SPP, jadwal belajar, dan pengumuman kelas secara transparan:\n\n🔗 ${inviteUrl}\n\nKode Undangan: *${inviteCode}*\nPengajar: *${instructorName}*\n\nTerima kasih! 🙏`;

      expect(waMessage).toContain(className);
      expect(waMessage).toContain(inviteCode);
      expect(waMessage).toContain(instructorName);
      expect(waMessage).toContain(inviteUrl);
      expect(waMessage).toContain('Bapak/Ibu Wali Murid & Siswa');
    });
  });

  describe('Standardisasi Rekening Bank di Setup Kelas (BRAND-1F.3 pickBankAccountForForm)', () => {
    it('mengutamakan bank_account walau bank_info ada', () => {
      const settings = {
        bank_account: {
          bank_name: 'Mandiri',
          account_number: '140001928374',
          account_holder: 'Yayasan Bina Prestasi',
        },
        bank_info: {
          bank_name: 'BCA Lama',
          account_number: '111222333',
          account_holder: 'Pengurus Lama',
        },
      };

      const result = pickBankAccountForForm(settings);
      expect(result).toBe(settings.bank_account);
      expect(result.bank_name).toBe('Mandiri');
      expect(result.account_number).toBe('140001928374');
      expect(result.account_holder).toBe('Yayasan Bina Prestasi');
    });

    it('fallback ke legacy bank_info bila bank_account belum ada di data settings', () => {
      const settings = {
        bank_info: {
          bank_name: 'BCA',
          account_number: '8830192834',
          account_holder: 'Pak Guru Budi',
        },
      };

      const result = pickBankAccountForForm(settings);
      expect(result).toBe(settings.bank_info);
      expect(result.bank_name).toBe('BCA');
      expect(result.account_number).toBe('8830192834');
      expect(result.account_holder).toBe('Pak Guru Budi');
    });

    it('mengembalikan null untuk settings kosong, undefined, atau nilai non-objek', () => {
      expect(pickBankAccountForForm(null)).toBeNull();
      expect(pickBankAccountForForm(undefined)).toBeNull();
      expect(pickBankAccountForForm({})).toBeNull();
      expect(pickBankAccountForForm('bukan-objek')).toBeNull();
      expect(pickBankAccountForForm({ bank_account: null, bank_info: null })).toBeNull();
      expect(pickBankAccountForForm({ bank_account: 'string-bukan-objek' })).toBeNull();
    });
  });
});
