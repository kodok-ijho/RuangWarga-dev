import { describe, it, expect } from 'vitest';
import {
  normalizeWaPhone,
  getUnpaidBillsForReminder,
  getCurrentPeriodJakarta,
  buildBillReminderMessage,
  buildProgramDuesReminderMessage,
  buildArisanReminderMessage,
  buildArisanDrawShareText,
  formatDateTimeWib,
  buildWaLink,
  buildAnnouncementShareText,
  buildAnnouncementShareUrl,
} from './waReminder';

describe('waReminder - normalizeWaPhone', () => {
  it('mengubah nomor awalan 0 menjadi 62 dan menghapus karakter non-digit', () => {
    expect(normalizeWaPhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWaPhone('0812 3456 7890')).toBe('6281234567890');
    expect(normalizeWaPhone('081234567890')).toBe('6281234567890');
  });

  it('membiarkan nomor dengan awalan +62 atau 62', () => {
    expect(normalizeWaPhone('+62 812-3456-7890')).toBe('6281234567890');
    expect(normalizeWaPhone('6281234567890')).toBe('6281234567890');
  });

  it('memberikan awalan 62 untuk nomor yang diawali 8', () => {
    expect(normalizeWaPhone('81234567890')).toBe('6281234567890');
    expect(normalizeWaPhone('812-3456-789')).toBe('628123456789');
  });

  it('mengembalikan null jika nomor terlalu pendek (< 10 digit)', () => {
    expect(normalizeWaPhone('081234')).toBeNull(); // 6281234 = 7 digit
    expect(normalizeWaPhone('8123456')).toBeNull(); // 628123456 = 9 digit
    expect(normalizeWaPhone('12345')).toBeNull();
  });

  it('mengembalikan null jika nomor terlalu panjang (> 15 digit)', () => {
    expect(normalizeWaPhone('08123456789012345')).toBeNull(); // 18 digit
    expect(normalizeWaPhone('628123456789012345')).toBeNull(); // 18 digit
  });

  it('mengembalikan null untuk input kosong atau tidak valid', () => {
    expect(normalizeWaPhone(null)).toBeNull();
    expect(normalizeWaPhone(undefined)).toBeNull();
    expect(normalizeWaPhone('')).toBeNull();
    expect(normalizeWaPhone('   ')).toBeNull();
    expect(normalizeWaPhone('abcd-efgh')).toBeNull();
  });
});

describe('waReminder - getUnpaidBillsForReminder', () => {
  const sampleCells = [
    {
      period: '2026-08',
      status: 'unpaid',
      bill: { id: 'b-1', period: '2026-08', status: 'unpaid', amount: 150000, late_fee: 0, due_date: '2026-08-10' },
    },
    {
      period: '2026-09',
      status: 'paid',
      bill: { id: 'b-2', period: '2026-09', status: 'paid', amount: 150000, late_fee: 0, due_date: '2026-09-10' },
    },
    {
      period: '2026-10',
      status: 'unpaid',
      bill: { id: 'b-3', period: '2026-10', status: 'unpaid', amount: 150000, late_fee: 10000, due_date: '2026-10-10' },
    },
    {
      period: '2026-11',
      status: 'unpaid',
      bill: { id: 'b-4', period: '2026-11', status: 'unpaid', amount: 150000, late_fee: 0, due_date: '2026-11-10' },
    },
    {
      period: '2026-12',
      status: 'none',
      bill: null,
    },
  ];

  it('mengambil hanya tagihan unpaid dengan period <= currentPeriod', () => {
    const result = getUnpaidBillsForReminder(sampleCells, '2026-10');
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(['b-1', 'b-3']);
  });

  it('mengabaikan tagihan masa depan (period > currentPeriod)', () => {
    const result = getUnpaidBillsForReminder(sampleCells, '2026-10');
    const futureBill = result.find((b) => b.period === '2026-11');
    expect(futureBill).toBeUndefined();
  });

  it('mengurutkan tagihan secara kronologis menurut periode', () => {
    // Acak urutan input
    const reversed = [...sampleCells].reverse();
    const result = getUnpaidBillsForReminder(reversed, '2026-10');
    expect(result.map((b) => b.period)).toEqual(['2026-08', '2026-10']);
  });

  it('mengembalikan array kosong jika input bukan array atau tidak ada sel unpaid', () => {
    expect(getUnpaidBillsForReminder(null, '2026-10')).toEqual([]);
    expect(getUnpaidBillsForReminder([], '2026-10')).toEqual([]);
    expect(getUnpaidBillsForReminder([{ status: 'paid', bill: { status: 'paid' } }], '2026-10')).toEqual([]);
  });
});

describe('waReminder - getCurrentPeriodJakarta', () => {
  it('mengembalikan format YYYY-MM untuk zona waktu Jakarta', () => {
    const date = new Date('2026-10-20T00:00:00Z');
    expect(getCurrentPeriodJakarta(date)).toBe('2026-10');
  });
});

describe('waReminder - buildBillReminderMessage', () => {
  const sampleBills = [
    {
      id: 'b-1',
      period: '2026-10',
      status: 'unpaid',
      amount: 150000,
      late_fee: 0,
      due_date: '2026-10-10',
    },
  ];

  it('menyusun pesan dengan rekening lengkap persis contoh NOTIF-1.md', () => {
    const text = buildBillReminderMessage({
      residentName: 'Budi Santoso',
      billLabel: 'IPL',
      unitLabel: 'Rumah',
      unitName: 'Blok A/1',
      bills: sampleBills,
      bankAccount: {
        bank_name: 'BCA',
        account_number: '1234567890',
        account_holder: 'Pengurus RT 01',
      },
      appUrl: 'https://ruangwarga.com/t/tenant-1',
      tenantName: 'Kompleks RT 01',
    });

    const expected = [
      'Halo Budi Santoso,',
      '',
      'Pengingat tagihan IPL Rumah Blok A/1:',
      '- Oktober 2026: Rp150.000 (jatuh tempo 10 Okt 2026)',
      'Total: Rp150.000',
      '',
      'Pembayaran bisa ditransfer ke BCA 1234567890 a.n. Pengurus RT 01, lalu unggah bukti bayar di aplikasi: https://ruangwarga.com/t/tenant-1',
      '',
      'Terima kasih.',
      'Pengurus Kompleks RT 01',
    ].join('\n');

    expect(text).toBe(expected);
  });

  it('menghitung total nominal dengan denda (late_fee) dan multi-periode', () => {
    const multiBills = [
      {
        id: 'b-1',
        period: '2026-09',
        amount: 150000,
        late_fee: 10000,
        due_date: '2026-09-10',
      },
      {
        id: 'b-2',
        period: '2026-10',
        amount: 150000,
        late_fee: 0,
        due_date: '2026-10-10',
      },
    ];

    const text = buildBillReminderMessage({
      residentName: 'Agus',
      billLabel: 'Sewa',
      unitLabel: 'Kamar',
      unitName: '101',
      bills: multiBills,
      bankAccount: null,
      appUrl: 'https://ruangwarga.com/t/kos-1',
      tenantName: 'Kos Flamboyan',
    });

    expect(text).toContain('- September 2026: Rp160.000 (jatuh tempo 10 Sep 2026)');
    expect(text).toContain('- Oktober 2026: Rp150.000 (jatuh tempo 10 Okt 2026)');
    expect(text).toContain('Total: Rp310.000');
  });

  it('menggunakan fallback cadangan saat rekening belum diisi atau tidak lengkap', () => {
    const textNoBank = buildBillReminderMessage({
      residentName: 'Siti',
      bills: sampleBills,
      bankAccount: null,
      appUrl: 'https://ruangwarga.com/t/tenant-1',
    });
    expect(textNoBank).toContain('Konfirmasi pembayaran di aplikasi: https://ruangwarga.com/t/tenant-1');
    expect(textNoBank).not.toContain('Pembayaran bisa ditransfer ke');

    const textIncompleteBank = buildBillReminderMessage({
      residentName: 'Siti',
      bills: sampleBills,
      bankAccount: { bank_name: 'BCA', account_number: '', account_holder: 'Bendahara' },
      appUrl: 'https://ruangwarga.com/t/tenant-1',
    });
    expect(textIncompleteBank).toContain('Konfirmasi pembayaran di aplikasi: https://ruangwarga.com/t/tenant-1');
  });

  it('menggunakan fallback "Bapak/Ibu" jika residentName kosong', () => {
    const text = buildBillReminderMessage({
      residentName: '',
      bills: sampleBills,
      appUrl: 'https://ruangwarga.com/t/tenant-1',
    });
    expect(text.startsWith('Halo Bapak/Ibu,')).toBe(true);
  });
});

describe('waReminder - buildWaLink', () => {
  it('menghasilkan tautan dengan nomor yang ternormalisasi', () => {
    const link = buildWaLink('0812-3456-7890', 'Halo apa kabar');
    expect(link).toBe('https://wa.me/6281234567890?text=Halo%20apa%20kabar');
  });

  it('menghasilkan tautan tanpa nomor jika nomor null atau tidak valid', () => {
    expect(buildWaLink(null, 'Halo')).toBe('https://wa.me/?text=Halo');
    expect(buildWaLink('', 'Halo')).toBe('https://wa.me/?text=Halo');
    expect(buildWaLink('123', 'Halo')).toBe('https://wa.me/?text=Halo');
  });
});

describe('waReminder - buildAnnouncementShareText & buildAnnouncementShareUrl (RTRW-3.1)', () => {
  it('menyusun teks pengumuman lengkap dengan judul, isi, dan tautan', () => {
    const text = buildAnnouncementShareText({
      title: 'Kerja Bakti Bersama',
      body: 'Harap membawa peralatan kebersihan masing-masing pada hari Minggu pagi.',
      tenantId: 'tenant-123',
      origin: 'https://ruangwarga.test',
    });

    expect(text).toBe(
      'Kerja Bakti Bersama\n\nHarap membawa peralatan kebersihan masing-masing pada hari Minggu pagi.\n\nSelengkapnya: https://ruangwarga.test/t/tenant-123/announcements'
    );
  });

  it('memotong isi yang melebihi 500 karakter dengan elipsis', () => {
    const longBody = 'A'.repeat(600);
    const text = buildAnnouncementShareText({
      title: 'Pengumuman Panjang',
      body: longBody,
      tenantId: 'tenant-123',
      origin: 'https://ruangwarga.test',
    });

    const expectedTruncated = 'A'.repeat(500) + '…';
    expect(text).toContain(expectedTruncated);
    expect(text).not.toContain('A'.repeat(501));
    expect(text).toContain('Selengkapnya: https://ruangwarga.test/t/tenant-123/announcements');
  });

  it('menangani isi kosong dengan rapi', () => {
    const text = buildAnnouncementShareText({
      title: 'Hanya Judul',
      body: '',
      tenantId: 'tenant-123',
      origin: 'https://ruangwarga.test',
    });

    expect(text).toBe('Hanya Judul\n\nSelengkapnya: https://ruangwarga.test/t/tenant-123/announcements');
  });

  it('menghasilkan tautan wa.me dengan query parameter text ter-encode', () => {
    const url = buildAnnouncementShareUrl({
      title: 'Rapat RT',
      body: 'Pukul 19.30 WIB',
      tenantId: 'tenant-123',
      origin: 'https://ruangwarga.test',
    });

    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).toContain(encodeURIComponent('Rapat RT'));
    expect(url).toContain(encodeURIComponent('Pukul 19.30 WIB'));
    expect(url).toContain(encodeURIComponent('https://ruangwarga.test/t/tenant-123/announcements'));
  });
});

describe('waReminder - buildProgramDuesReminderMessage (PANITIA-2.2)', () => {
  it('menyusun pesan pengingat iuran acara dengan rekening bank lengkap', () => {
    const msg = buildProgramDuesReminderMessage({
      memberName: 'Ahmad Faiz',
      programName: 'Pentas Seni Tahunan',
      amount: 50000,
      dueDate: '2026-11-20',
      bankAccount: {
        bank_name: 'BCA',
        account_number: '1234567890',
        account_holder: 'Panitia Pentas Seni',
      },
      tenantName: 'Panitia Pentas Seni 2026',
      appUrl: 'https://ruangwarga.id/t/panitia/dues',
    });

    expect(msg).toContain('Halo Ahmad Faiz,');
    expect(msg).toContain('Pengingat iuran acara Pentas Seni Tahunan:');
    expect(msg).toContain('Rp50.000');
    expect(msg).toContain('20 Nov 2026');
    expect(msg).toContain('BCA 1234567890 a.n. Panitia Pentas Seni');
    expect(msg).toContain('https://ruangwarga.id/t/panitia/dues');
    expect(msg).toContain('Pengurus Panitia Pentas Seni 2026');
  });

  it('menyusun pesan dengan fallback bila rekening bank belum diisi', () => {
    const msg = buildProgramDuesReminderMessage({
      memberName: '',
      programName: 'Bazar Akbar',
      amount: 75000,
      dueDate: '2026-12-05',
      bankAccount: null,
      tenantName: '',
      appUrl: 'https://ruangwarga.id',
    });

    expect(msg).toContain('Halo Bapak/Ibu,');
    expect(msg).toContain('Pengingat iuran acara Bazar Akbar:');
    expect(msg).toContain('Rp75.000');
    expect(msg).toContain('5 Des 2026');
    expect(msg).toContain('Konfirmasi pembayaran di aplikasi: https://ruangwarga.id');
    expect(msg).toContain('Pengurus');
  });
});

describe('ARISAN-1.2: buildArisanReminderMessage', () => {
  it('menyusun pesan pengingat setoran arisan lengkap dengan rekening bank', () => {
    const msg = buildArisanReminderMessage({
      memberName: 'Ibu Ratna',
      roundLabel: 'Putaran 2 (November 2026)',
      amount: 250000,
      dueDate: '2026-11-15',
      bankAccount: {
        bank_name: 'Mandiri',
        account_number: '1400012345678',
        account_holder: 'Bendahara Arisan Melati',
      },
      tenantName: 'Arisan Melati Indah',
      appUrl: 'https://ruangwarga.id/t/arisan/my',
    });

    expect(msg).toContain('Halo Ibu Ratna,');
    expect(msg).toContain('Pengingat setoran arisan Putaran 2 (November 2026):');
    expect(msg).toContain('Setoran Putaran 2 (November 2026): Rp250.000');
    expect(msg).toContain('Total: Rp250.000');
    expect(msg).toContain('Mandiri 1400012345678 a.n. Bendahara Arisan Melati');
    expect(msg).toContain('https://ruangwarga.id/t/arisan/my');
    expect(msg).toContain('Pengurus Arisan Melati Indah');
  });

  it('menggunakan fallback jika parameter kosong', () => {
    const msg = buildArisanReminderMessage({
      memberName: '',
      roundLabel: '',
      amount: 0,
      dueDate: null,
      bankAccount: null,
      tenantName: '',
      appUrl: '',
    });

    expect(msg).toContain('Halo Bapak/Ibu,');
    expect(msg).toContain('Pengingat setoran arisan Arisan:');
    expect(msg).toContain('Konfirmasi pembayaran di aplikasi:');
    expect(msg).toContain('Pengurus Arisan');
  });
});

describe('ARISAN-1.2: buildArisanDrawShareText', () => {
  it('menyusun teks pengumuman hasil kocok lengkap (dengan peserta yang ikut dan dikecualikan)', () => {
    const utcDate = '2026-10-22T08:30:00Z'; // 15:30 WIB
    const text = buildArisanDrawShareText({
      tenantName: 'Arisan Mawar',
      roundLabel: 'Putaran 3 - Oktober 2026',
      drawnAt: utcDate,
      operatorName: 'Ibu Siska (Ketua)',
      winnerName: 'Ibu Endang',
      slotLabel: 'Slot #05',
      totalPrize: 1500000,
      eligible: [
        { full_name: 'Ibu Endang' },
        { full_name: 'Ibu Siti' },
        { full_name: 'Ibu Ani' },
      ],
      excluded: [
        { full_name: 'Pak Rudi' },
      ],
      appUrl: 'https://ruangwarga.id/t/arisan-mawar/arisan',
    });

    expect(text).toContain('HASIL KOCOKAN ARISAN');
    expect(text).toContain('Arisan Mawar — Putaran 3 - Oktober 2026');
    expect(text).toContain('*Ibu Endang* (Slot #05)');
    expect(text).toContain('Total Hadiah: *Rp1.500.000*');
    expect(text).toContain('WIB');
    expect(text).toContain('15:30 WIB');
    expect(text).toContain('Operator: Ibu Siska (Ketua)');
    expect(text).toContain('Peserta yang ikut kocok (setoran lunas):');
    expect(text).toContain('Ibu Endang, Ibu Siti, Ibu Ani');
    expect(text).toContain('Belum lunas (tidak ikut kocok): Pak Rudi');
    expect(text).toContain('Hasil kocok tercatat permanen di RuangWarga dan tidak bisa diulang.');
    expect(text).toContain('Detail putaran: https://ruangwarga.id/t/arisan-mawar/arisan');
  });

  it('tidak menyertakan baris belum lunas jika tidak ada peserta yang dikecualikan', () => {
    const text = buildArisanDrawShareText({
      tenantName: 'Arisan Sejahtera',
      roundLabel: 'Putaran 1',
      drawnAt: '2026-10-22T08:30:00Z',
      operatorName: 'Pak Joko',
      winnerName: 'Ibu Lina',
      slotLabel: '',
      totalPrize: 2000000,
      eligible: [{ full_name: 'Ibu Lina' }, { full_name: 'Ibu Maya' }],
      excluded: [],
      appUrl: '',
    });

    expect(text).toContain('Ibu Lina');
    expect(text).toContain('Peserta yang ikut kocok (setoran lunas):');
    expect(text).not.toContain('Belum lunas (tidak ikut kocok)');
    expect(text).toContain('Hasil kocok tercatat permanen di RuangWarga dan tidak bisa diulang.');
  });
});

