/**
 * Mock data untuk demo mode.
 * Simulasi data yang nantinya berasal dari Supabase.
 * Import dari sini oleh komponen UI saat VITE_DEMO_MODE=true.
 */

// ── STATUS PENGHUNI ──────────────────────────────────────────────
// Status tinggal sebuah profil terhadap unit yang dirujuk via unit_id.
export const OCCUPANCY_STATUS = {
  owner_occupied: 'Tetap / Owner - Dihuni',       // pemilik tinggal sendiri
  owner_vacant: 'Tetap / Owner - Tidak Dihuni',    // pemilik, unit kosong
  owner_rented: 'Tetap / Owner - Dikontrakkan',    // pemilik, disewakan ke tenant
  tenant: 'Kontrak',                                // penyewa (yang ngontrak)
};

// ── UNITS ────────────────────────────────────────────────────────
// owner_id = profil pemilik unit. Berbeda dari penghuni (occupant) yang
// dirujuk lewat profile.unit_id. Untuk unit yang dikontrakkan, pemilik
// (owner) bukan penghuni — penghuni adalah profil dengan status 'tenant'.
export const mockUnits = [
  { id: 1, block: 'A', unit_number: '01', floor: 1, size: 72, is_occupied: true, owner_id: 'demo-bendahara', ipl_schema_id: 'schema-komplit' },
  { id: 2, block: 'A', unit_number: '02', floor: 1, size: 72, is_occupied: true, owner_id: 'demo-warga', ipl_schema_id: 'schema-komplit' },
  { id: 3, block: 'A', unit_number: '03', floor: 1, size: 72, is_occupied: true, owner_id: 'p-4', ipl_schema_id: 'schema-komplit' },
  { id: 4, block: 'A', unit_number: '04', floor: 2, size: 84, is_occupied: true, owner_id: 'p-5', ipl_schema_id: 'schema-komplit' },
  { id: 5, block: 'A', unit_number: '05', floor: 2, size: 84, is_occupied: true, owner_id: 'p-6', ipl_schema_id: 'schema-komplit' },
  { id: 6, block: 'A', unit_number: '06', floor: 2, size: 84, is_occupied: true, owner_id: 'demo-pengurus', ipl_schema_id: 'schema-komplit' },
  { id: 7, block: 'A', unit_number: '07', floor: 3, size: 96, is_occupied: true, owner_id: 'p-7', ipl_schema_id: 'schema-komplit' },
  { id: 8, block: 'A', unit_number: '08', floor: 3, size: 96, is_occupied: true, owner_id: 'p-8', ipl_schema_id: 'schema-komplit' },
  { id: 9, block: 'A', unit_number: '09', floor: 3, size: 96, is_occupied: true, owner_id: 'p-9', ipl_schema_id: 'schema-komplit' },
  { id: 10, block: 'A', unit_number: '10', floor: 3, size: 96, is_occupied: false, owner_id: 'p-14', ipl_schema_id: 'schema-basic' },
  { id: 11, block: 'B', unit_number: '01', floor: 1, size: 72, is_occupied: true, owner_id: 'p-10', ipl_schema_id: 'schema-komplit' },
  { id: 12, block: 'B', unit_number: '02', floor: 1, size: 72, is_occupied: true, owner_id: 'p-11', ipl_schema_id: 'schema-komplit' },
  { id: 13, block: 'B', unit_number: '03', floor: 1, size: 72, is_occupied: false, owner_id: 'p-12', ipl_schema_id: 'schema-basic' },
  { id: 14, block: 'B', unit_number: '04', floor: 2, size: 84, is_occupied: true, owner_id: 'p-13', ipl_schema_id: 'schema-komplit' },
  { id: 15, block: 'B', unit_number: '05', floor: 2, size: 84, is_occupied: true, owner_id: 'p-14', ipl_schema_id: 'schema-komplit' },
  { id: 16, block: 'C', unit_number: '01', floor: 1, size: 72, is_occupied: false, owner_id: null, ipl_schema_id: 'schema-basic' },
  { id: 17, block: 'C', unit_number: '02', floor: 1, size: 72, is_occupied: false, owner_id: null, ipl_schema_id: 'schema-basic' },
  { id: 18, block: 'C', unit_number: '03', floor: 2, size: 84, is_occupied: false, owner_id: null, ipl_schema_id: 'schema-basic' },
];


// ── PROFILES (penghuni) ─────────────────────────────────────────
// occupancy_status lihat OCCUPANCY_STATUS di atas. Untuk unit yang
// dikontrakkan, ada 2 profil: pemilik (owner_rented) + tenant.
export const mockProfiles = [
  {
    id: 'demo-admin',
    full_name: 'Pak Hendra (Admin)',
    phone: '0812-1000-0001',
    role: 'admin',
    unit_id: null,
    occupancy_status: null,
    is_active: true,
    email: 'admin@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'demo-admin-viewer',
    full_name: 'Admin Viewer (Read Only)',
    phone: '0812-1000-0099',
    role: 'admin_viewer',
    unit_id: null,
    occupancy_status: null,
    is_active: true,
    email: 'admin.viewer@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'demo-bendahara',
    full_name: 'Budi Santoso (Bendahara)',
    phone: '0813-2000-0002',
    role: 'bendahara',
    unit_id: 1,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'bendahara@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'demo-pengurus',
    full_name: 'Ibu Ratna (Koordinator Lingkungan)',
    phone: '0814-3000-0003',
    role: 'pengurus',
    unit_id: 6,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'pengurus@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'demo-warga',
    full_name: 'Siti Rahayu',
    phone: '0812-3000-0003',
    role: 'warga',
    unit_id: 2,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'warga@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'p-4',
    full_name: 'Ahmad Hidayat',
    phone: '0856-4000-0004',
    role: 'warga',
    unit_id: 3,
    occupancy_status: 'owner_rented', // pemilik unit 3, dikontrakkan ke p-4b
    is_active: true,
    email: 'ahmad.h@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-02T00:00:00Z',
  },
  {
    // Contoh TENANT: menempati unit 3 milik Ahmad Hidayat (p-4)
    id: 'p-4b',
    full_name: 'Eko Prasetyo (Penyewa)',
    phone: '0838-4100-0040',
    role: 'warga',
    unit_id: 3,
    occupancy_status: 'tenant',
    is_active: true,
    email: 'eko.p@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-03T00:00:00Z',
  },
  {
    id: 'p-5',
    full_name: 'Dewi Lestari',
    phone: '0878-5000-0005',
    role: 'warga',
    unit_id: 4,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'dewi.l@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-04T00:00:00Z',
  },
  {
    id: 'p-6',
    full_name: 'Rudi Pratama',
    phone: '0819-6000-0006',
    role: 'warga',
    unit_id: 5,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'rudi.p@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-05T00:00:00Z',
  },
  {
    id: 'p-7',
    full_name: 'Lina Kusuma',
    phone: '0821-7000-0007',
    role: 'warga',
    unit_id: 7,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'lina.k@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-06T00:00:00Z',
  },
  {
    id: 'p-8',
    full_name: 'Agus Wijaya',
    phone: '0857-8000-0008',
    role: 'warga',
    unit_id: 8,
    occupancy_status: 'owner_rented', // pemilik unit 8, dikontrakkan ke p-8b
    is_active: false, // sudah pindah
    email: 'agus.w@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-07T00:00:00Z',
  },
  {
    // Contoh TENANT: menempati unit 8 milik Agus Wijaya (p-8)
    id: 'p-8b',
    full_name: 'Maya Sari (Penyewa)',
    phone: '0833-8200-0080',
    role: 'warga',
    unit_id: 8,
    occupancy_status: 'tenant',
    is_active: true,
    email: 'maya.s@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-08T00:00:00Z',
  },
  {
    id: 'p-9',
    full_name: 'Rina Wulandari',
    phone: '0896-9000-0009',
    role: 'warga',
    unit_id: 9,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'rina.w@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-09T00:00:00Z',
  },
  {
    id: 'p-10',
    full_name: 'Dian Permata',
    phone: '0813-1111-0010',
    role: 'warga',
    unit_id: 11,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'dian.p@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-10T00:00:00Z',
  },
  {
    id: 'p-11',
    full_name: 'Fajar Setiawan',
    phone: '0858-2222-0011',
    role: 'warga',
    unit_id: 12,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'fajar.s@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-11T00:00:00Z',
  },
  {
    id: 'p-12',
    full_name: 'Maya Anggraeni',
    phone: '0877-3333-0012',
    role: 'warga',
    unit_id: 13,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'maya.a@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-12T00:00:00Z',
  },
  {
    id: 'p-13',
    full_name: 'Doni Cahyadi',
    phone: '0822-4444-0013',
    role: 'warga',
    unit_id: 14,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'doni.c@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-13T00:00:00Z',
  },
  {
    id: 'p-14',
    full_name: 'Nurul Fadilah',
    phone: '0815-5555-0014',
    role: 'warga',
    unit_id: 15,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email: 'nurul.f@palmvillage.id',
    approval_status: 'approved',
    registered_at: '2025-01-14T00:00:00Z',
  },
  // ── Pending registrations (menunggu approval) ──────────────────
  {
    id: 'pending-1',
    full_name: 'Bambang Supriadi',
    phone: '0857-9999-1234',
    role: 'warga',
    unit_id: null,
    occupancy_status: null,
    is_active: false,
    email: 'bambang.supriadi@gmail.com',
    approval_status: 'pending',
    registered_at: '2026-07-04T14:30:00Z',
  },
  {
    id: 'pending-2',
    full_name: 'Wati Kusumawati',
    phone: '0878-8888-5678',
    role: 'warga',
    unit_id: null,
    occupancy_status: null,
    is_active: false,
    email: 'wati.kusuma@gmail.com',
    approval_status: 'pending',
    registered_at: '2026-07-05T09:15:00Z',
  },
  {
    id: 'pending-3',
    full_name: 'Haris Munandar',
    phone: '0812-7777-9012',
    role: 'warga',
    unit_id: null,
    occupancy_status: null,
    is_active: false,
    email: 'haris.munandar@gmail.com',
    approval_status: 'pending',
    registered_at: '2026-07-05T11:00:00Z',
  },
  // Persona contoh untuk panduan aplikasi: pendaftar warga baru yang belum
  // pernah memperoleh sesi aktif dan masih menunggu persetujuan pengurus.
  {
    id: 'pending-ngantor-matic',
    full_name: 'Ngantor Matic',
    phone: '0812-0000-2026',
    role: 'warga',
    unit_id: null,
    occupancy_status: null,
    is_active: false,
    email: 'ngantormatic@gmail.com',
    approval_status: 'pending',
    registered_at: '2026-08-13T00:00:00Z',
  },
];

// Generate 50 new units and profiles for the demo meeting
const indonesianNames = [
  "Ahmad Fauzi", "Budi Wijaya", "Cici Amalia", "Dedi Setiadi", "Endang Sri",
  "Fahmi Idris", "Gita Gutawa", "Hendra Wijaya", "Indah Permata", "Joko Susilo",
  "Kartika Sari", "Lukman Hakim", "Maria Ulfah", "Novianti", "Oki Setiana",
  "Prabowo Subianto", "Qori Sandioriva", "Rian d'Masiv", "Siti Badriah", "Taufik Hidayat",
  "Umar Shihab", "Vicky Shu", "Wulan Guritno", "Xena Aliyah", "Yuni Shara",
  "Zaskia Adya", "Andi Pratama", "Dewi Sartika", "Eko Yuli", "Fitri Carlina",
  "Guntur Saputra", "Harianto", "Irmawati", "Junaidi", "Kurniawan",
  "Lestari", "Mulyadi", "Ningsih", "Oktavianus", "Putra",
  "Qadir", "Rahmat", "Sari", "Tri", "Utami",
  "Wahyudi", "Yuliana", "Zulkifli", "Agung", "Bambang"
];

for (let i = 1; i <= 50; i++) {
  const id = 18 + i;
  const block = String.fromCharCode(68 + Math.floor((i - 1) / 10)); // Block D, E, F, G, H
  const unitNum = String((i - 1) % 10 + 1).padStart(2, '0');
  const email = `warga${i}@palmvillage.id`;
  
  mockUnits.push({
    id,
    block,
    unit_number: unitNum,
    floor: ((i - 1) % 3) + 1,
    size: 72,
    is_occupied: true,
    owner_id: `p-${id}`,
    ipl_schema_id: 'schema-komplit'
  });

  mockProfiles.push({
    id: `p-${id}`,
    full_name: indonesianNames[i - 1],
    phone: `0812-${String(1000 + i).padStart(4, '0')}-00${id}`,
    role: 'warga',
    unit_id: id,
    occupancy_status: 'owner_occupied',
    is_active: true,
    email,
    approval_status: 'approved',
    registered_at: `2025-01-${String(10 + i).padStart(2, '0')}T00:00:00Z`
  });
}



// ── IPL SETTINGS ─────────────────────────────────────────────────
// Konfigurasi IPL yang bisa diubah admin di halaman Settings.
//
// Catatan: besaran IPL per bulan TIDAK lagi disimpan sebagai nilai terpisah.
// Ia selalu = penjumlahan semua `ipl_components` (lihat computeIPLAmount).
// Jadi komponen IPL adalah satu-satunya sumber kebenaran besaran iuran.
export const mockSettings = {
  due_day: 10, // tanggal jatuh tempo tiap bulan
  late_fee_enabled: true,
  late_fee_type: 'percent', // 'percent' | 'fixed'
  late_fee_value: 5, // 5% atau nilai fixed (Rp)
  bill_recipient: 'occupant', // 'occupant' | 'owner' — ke siapa tagihan ditujukan
  qris_enabled: true,
  qris_provider: 'doku',
  smoke_test: {
    enabled: true,
    frequency: 'daily',
    run_hour: 9,
    timezone: 'Asia/Jakarta',
    notification_email: 'dyudhiantoro@gmail.com',
    notify_recovery: true,
    last_run: {
      status: 'never',
      checks: [],
      notification_sent: false,
    },
  },
  ipl_schemas: [
    {
      id: 'schema-komplit',
      name: 'IPL Komplit (Rumah Ditempati)',
      description: 'Wajib dibayar untuk seluruh rumah yang ditempati oleh pemilik atau penyewa.',
      components: [
        { name: 'Keamanan', amount: 80000 },
        { name: 'Kebersihan', amount: 30000 },
        { name: 'DDC (Dana Duka Cita)', amount: 7000 },
        { name: 'Kas', amount: 23000 },
      ],
    },
    {
      id: 'schema-basic',
      name: 'IPL Basic (Rumah Kosong)',
      description: 'Dibebankan kepada pemilik untuk rumah yang tidak dihuni / kosong.',
      components: [
        { name: 'Keamanan', amount: 80000 },
        { name: 'Kebersihan', amount: 30000 },
      ],
    },
  ],
};

export function getIPLSchemas() {
  return mockSettings.ipl_schemas || [];
}

export function getIPLSchemaById(schemaId) {
  const schemas = getIPLSchemas();
  return schemas.find((s) => s.id === schemaId) || schemas[0];
}

export function computeSchemaAmount(schema) {
  if (!schema || !schema.components) return 0;
  return schema.components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

/**
 * Hitung besaran IPL per bulan = penjumlahan semua komponen di dalam skema IPL yang menempel pada unit.
 * @param {number|object|Array} [arg] - bisa berupa unitId (number), unit obj, schema obj, atau array components
 * @returns {number}
 */
export function computeIPLAmount(arg) {
  if (Array.isArray(arg)) {
    return arg.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }
  if (arg && typeof arg === 'object' && arg.components) {
    return computeSchemaAmount(arg);
  }
  let unitId = typeof arg === 'object' ? arg?.id : arg;
  const unit = mockUnits.find((u) => u.id === Number(unitId));
  if (unit && unit.ipl_schema_id) {
    const schema = getIPLSchemaById(unit.ipl_schema_id);
    return computeSchemaAmount(schema);
  }
  const defaultSchema = getIPLSchemas()[0];
  return computeSchemaAmount(defaultSchema);
}

// ── IPL BILLS ────────────────────────────────────────────────────
// Tagihan di-generate untuk beberapa periode (2025 + 2026) supaya
// matriks pembayaran multi-tahun & laporan relevan.
//
// Aturan SEKUENSIAL LINTAS TAHUN: setiap unit punya satu garis "batas bayar"
// yang berjalan kontinu dari 2025-01. Semua periode sebelum batas → paid.
// Semua periode setelah batas → pending/overdue.
// Ini menjamin tunggakan hanya muncul di BELAKANG, tidak di tengah, dan
// konsisten lintas tahun (tidak mungkin Jan-Mar 2026 lunas tapi Nov 2025 belum).
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1; // 1-based
const periods = [
  // 2025 — sebagian besar lunas (tahun lalu)
  '2025-01','2025-02','2025-03','2025-04','2025-05','2025-06',
  '2025-07','2025-08','2025-09','2025-10','2025-11','2025-12',
  // 2026 — 2027 (tahun berjalan & tahun buku)
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
  '2027-01','2027-02','2027-03','2027-04','2027-05','2027-06',
  '2027-07','2027-08','2027-09','2027-10','2027-11','2027-12',
];

export const mockIPLBills = [];
let billId = 1;

const occupiedUnits = mockUnits; // Semua unit (terhuni maupun kosong) dikenakan tagihan IPL sesuai skema
const residentsWithUnit = mockProfiles.filter((p) => p.unit_id && p.is_active);

// ── Tentukan batas bayar absolut per unit ────────────────────────
// Menggunakan deterministik pseudo-random berdasarkan unit.id
// agar hasil konsisten setiap kali halaman di-reload.
// cutoffMonth: bulan terakhir yang sudah dibayar (1-based dari 2025-01)
//   2025-01 = 1, 2025-02 = 2, ..., 2025-12 = 12, 2026-01 = 13, ..., 2026-06 = 18
const unitCutoffs = {}; // { unitId: cutoffMonth }
for (const unit of occupiedUnits) {
  const seed = unit.id * 7 + 3; // deterministik per unit
  if (unit.id > 18) {
    // 30 unit baru: Pastikan lunas 2025 (>=12) dan acak di 2026 (12 s.d 18)
    unitCutoffs[unit.id] = 12 + (seed % 7); // Range 12-18
  } else {
    // Range 10-17: sebagian lunas 2025 penuh + sebagian 2026, ada yang menunggak di 2025
    unitCutoffs[unit.id] = 10 + (seed % 8);
  }
}

function periodToIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return (y - 2025) * 12 + m; // 2025-01 → 1, 2025-12 → 12, 2026-01 → 13, dst.
}

for (const period of periods) {
  for (const unit of occupiedUnits) {
    // Penerima tagihan ditentukan oleh setting global bill_recipient:
    // bisa penghuni (occupant) atau pemilik (owner).
    const recipient = getBillRecipient(unit.id);
    const [y, m] = period.split('-').map(Number);
    const dueDate = new Date(y, m - 1, mockSettings.due_day);
    const amount = computeIPLAmount(unit.id);

    const isPast = now > new Date(y, m, 0); // akhir bulan periode
    const isCurrent = y === currentYear && m === currentMonth;

    // Status sekuensial kontinu: bandingkan index periode dengan cutoff
    const idx = periodToIndex(period);
    const cutoff = unitCutoffs[unit.id];
    let status;
    if (idx <= cutoff) {
      status = 'paid';
    } else {
      // Periode setelah cutoff: overdue jika sudah lewat jatuh tempo, else pending
      status = (isPast || (isCurrent && now.getDate() > mockSettings.due_day))
        ? 'overdue'
        : 'pending';
    }

    mockIPLBills.push({
      id: `bill-${billId}`,
      unit_id: unit.id,
      resident_id: recipient?.id || null,
      period,
      amount,
      late_fee:
        status === 'overdue' && mockSettings.late_fee_enabled
          ? mockSettings.late_fee_type === 'percent'
            ? Math.round(amount * (mockSettings.late_fee_value / 100))
            : mockSettings.late_fee_value
          : 0,
      due_date: dueDate.toISOString().split('T')[0],
      status,
      qris_ref: status === 'paid' ? `QRI-${billId}` : null,
      payment_id: status === 'paid' ? `pay-${billId}` : null,
    });
    billId++;
  }
}

// ── PAYMENTS ─────────────────────────────────────────────────────
export const mockPayments = mockIPLBills
  .filter((b) => b.status === 'paid')
  .map((b) => ({
    id: b.payment_id,
    ipl_bill_id: b.id,
    resident_id: b.resident_id,
    amount: b.amount,
    method: 'qris',
    transaction_id: `TXN-${b.payment_id}`,
    status: 'completed',
    paid_at: b.due_date, // bayar sebelum/tepat jatuh tempo
    provider: mockSettings.qris_provider,
    metadata: { provider: mockSettings.qris_provider },
  }));

// Demo: beberapa pembayaran menunggu verifikasi (transfer oleh warga)
(function addDemoPendingPayments() {
  // Find 2 overdue/pending bills to mark as pending_verification
  const demoBills = mockIPLBills.filter(
    (b) => (b.status === 'overdue' || b.status === 'pending') && b.unit_id === 2
  ).slice(0, 2);
  demoBills.forEach((bill, i) => {
    bill.status = 'pending_verification';
    const payment = {
      id: `pay-pending-${i + 1}`,
      ipl_bill_id: bill.id,
      resident_id: 'demo-warga',
      amount: bill.amount,
      method: 'bank_transfer',
      transaction_id: `TRF-pending-${i + 1}`,
      status: 'pending_verification',
      paid_at: new Date().toISOString().split('T')[0],
      proof_file_name: `bukti-transfer-${bill.period}.jpg`,
      proof_file_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800',
      receipt_file: `bukti-transfer-${bill.period}.jpg`,
      metadata: {
        note: 'Transfer via BCA Mobile',
        payer: 'Siti Rahayu',
      },
    };
    bill.payment_id = payment.id;
    mockPayments.push(payment);
  });
})();

// ── HELPERS ─────────────────────────────────────────────────────

/** Ambil unit berdasarkan ID */
export function getUnitById(unitId) {
  return mockUnits.find((u) => u.id === unitId) || null;
}

/** Ambil profil berdasarkan ID */
export function getProfileById(profileId) {
  return mockProfiles.find((p) => p.id === profileId) || null;
}

// ── RELASI OWNER vs OCCUPANT ─────────────────────────────────────

/** Ambil PEMILIK (owner) suatu unit. Pakai unit.owner_id bila ada,
 *  fallback ke profil pertama dengan unit_id==unitId & status owner_*.
 *  Mengembalikan objek profil atau null. */
export function getUnitOwner(unitId) {
  const unit = getUnitById(unitId);
  if (!unit) return null;
  if (unit.owner_id) {
    const p = getProfileById(unit.owner_id);
    if (p) return p;
  }
  // Fallback: profil pertama yang merefer unit ini & ber-status owner
  return (
    mockProfiles.find(
      (p) => p.unit_id === unitId && p.occupancy_status && p.occupancy_status.startsWith('owner_')
    ) || null
  );
}

/** Ambil PENGHUNI (occupant) suatu unit — tenant kalau ada, else owner.
 *  Occupant = orang yang BENAR-BENAR tinggal di unit. */
export function getUnitOccupant(unitId) {
  const tenant = mockProfiles.find(
    (p) =>
      p.unit_id === unitId &&
      p.is_active &&
      (p.occupancy_status === 'tenant' || p.occupancy_status === 'owner_occupied')
  );
  return tenant || null;
}

/** Ambil PENERIMA TAGIHAN untuk unit, sesuai setting global bill_recipient.
 *  - 'owner'    → selalu pemilik
 *  - 'occupant' → penghuni (kalau ada), fallback ke pemilik */
export function getBillRecipient(unitId) {
  if (mockSettings.bill_recipient === 'owner') {
    return getUnitOwner(unitId);
  }
  return getUnitOccupant(unitId) || getUnitOwner(unitId);
}

/** Label status penghuni */
export function occupancyStatusLabel(status) {
  return OCCUPANCY_STATUS[status] || '—';
}

/** Warna badge status penghuni */
export function occupancyStatusColor(status) {
  const map = {
    owner_occupied: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    owner_vacant: 'bg-gray-100 text-gray-500 border border-gray-200',
    owner_rented: 'bg-amber-50 text-amber-700 border border-amber-200',
    tenant: 'bg-sky-50 text-sky-700 border border-sky-200',
  };
  return map[status] || 'bg-gray-100 text-gray-600 border border-gray-200';
}


/** Format rupiah */
export function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format periode YYYY-MM → "Juni 2026" */
export function formatPeriod(period) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const [y, m] = period.split('-');
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

/** Format tanggal YYYY-MM-DD → "10 Jun 2026" */
export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Label status tagihan */
export function billStatusLabel(status) {
  const map = {
    pending: 'Menunggu',
    paid: 'Lunas',
    overdue: 'Terlambat',
    cancelled: 'Dibatalkan',
    pending_verification: 'Menunggu Verifikasi',
  };
  return map[status] || status;
}

/** Warna badge status tagihan */
export function billStatusColor(status) {
  const map = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    overdue: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
    pending_verification: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return map[status] || 'bg-gray-100 text-gray-600 border-gray-200';
}

const ROLE_LEVEL = { warga: 1, pengurus: 2, bendahara: 3, admin: 4, admin_viewer: 4 };
const READ_ONLY_ROLES = new Set(['admin_viewer']);

export function hasMinRole(userRole, minRole) {
  return (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

export function canModifyData(role) {
  return Boolean(ROLE_LEVEL[role]) && !READ_ONLY_ROLES.has(role);
}

export function isStaffRole(role) {
  return hasMinRole(role, 'pengurus');
}

export function isBendaharaOrAbove(role) {
  return hasMinRole(role, 'bendahara');
}

export function isAdminRole(role) {
  return role === 'admin';
}

/** Label role */
export function roleLabel(role) {
  const map = {
    admin: 'Admin',
    admin_viewer: 'Admin Viewer',
    bendahara: 'Bendahara',
    pengurus: 'Pengurus',
    warga: 'Warga',
  };
  return map[role] || role;
}

/** Warna badge role */
export function roleColor(role) {
  const map = {
    admin: 'bg-gold-500 text-forest-900',
    admin_viewer: 'bg-slate-100 text-slate-700 border border-slate-200',
    bendahara: 'bg-emerald-600 text-white',
    pengurus: 'bg-forest-800 text-gold-400',
    warga: 'bg-forest-100 text-forest-700 border border-forest-200',
  };
  return map[role] || 'bg-gray-100 text-gray-600';
}

// ── PENGELUARAN (expenses) ────────────────────────────────────────
// Kategori & data pengeluaran bendahara. Bukti pembayaran disimpan
// sebagai nama file (string) — saat Supabase terhubung, file asli
// disimpan di Supabase Storage dan field ini berisi path/URL-nya.
export const mockExpenseCategories = [
  'Kebersihan',
  'Keamanan',
  'Perawatan Fasilitas',
  'Listrik & Air',
  'Administrasi',
  'Acara Warga',
  'Lain-lain',
];

export const mockExpenses = [];

// Helper to generate expenses dynamically from Jan 2025
function generateDemoExpenses() {
  const list = [];
  const start = new Date('2025-01-01');
  const end = new Date(); // current date
  
  let current = new Date(start);
  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const period = `${year}-${String(month).padStart(2, '0')}`;
    
    // 1. Kebersihan (tiap bulan)
    list.push({
      id: `exp-gen-${period}-1`,
      date: `${year}-${String(month).padStart(2, '0')}-05`,
      category: 'Kebersihan',
      amount: 450000,
      description: `Honor petugas kebersihan untuk periode ${period}`,
      receipt_file: `kwitansi-kebersihan-${period}.pdf`,
      recorded_by: 'Budi Santoso (Bendahara)',
      created_at: `${year}-${String(month).padStart(2, '0')}-05T08:00:00Z`,
    });
    
    // 2. Keamanan (tiap bulan)
    list.push({
      id: `exp-gen-${period}-2`,
      date: `${year}-${String(month).padStart(2, '0')}-05`,
      category: 'Keamanan',
      amount: 1100000,
      description: `Honor satpam komplek untuk periode ${period}`,
      receipt_file: `honor-satpam-${period}.pdf`,
      recorded_by: 'Budi Santoso (Bendahara)',
      created_at: `${year}-${String(month).padStart(2, '0')}-05T09:00:00Z`,
    });
    
    // 3. Listrik & Air (bulan genap)
    if (month % 2 === 0) {
      list.push({
        id: `exp-gen-${period}-3`,
        date: `${year}-${String(month).padStart(2, '0')}-08`,
        category: 'Listrik & Air',
        amount: 350000,
        description: `Pembayaran token listrik lampu jalan komplek periode ${period}`,
        receipt_file: `struk-listrik-${period}.jpg`,
        recorded_by: 'Budi Santoso (Bendahara)',
        created_at: `${year}-${String(month).padStart(2, '0')}-08T10:30:00Z`,
      });
    }
    
    // 4. Perawatan Fasilitas (setiap 3 bulan: Maret, Juni, September, Desember)
    if (month % 3 === 0) {
      list.push({
        id: `exp-gen-${period}-4`,
        date: `${year}-${String(month).padStart(2, '0')}-12`,
        category: 'Perawatan Fasilitas',
        amount: 300000,
        description: `Servis pompa air taman & fasilitas umum periode ${period}`,
        receipt_file: `kwitansi-servis-${period}.pdf`,
        recorded_by: 'Budi Santoso (Bendahara)',
        created_at: `${year}-${String(month).padStart(2, '0')}-12T14:00:00Z`,
      });
    }
    
    // 5. Administrasi (setiap 6 bulan: Juni, Desember)
    if (month % 6 === 0) {
      list.push({
        id: `exp-gen-${period}-5`,
        date: `${year}-${String(month).padStart(2, '0')}-15`,
        category: 'Administrasi',
        amount: 200000,
        description: `Pembelian ATK & biaya administrasi RT periode ${period}`,
        receipt_file: null,
        recorded_by: 'Budi Santoso (Bendahara)',
        created_at: `${year}-${String(month).padStart(2, '0')}-15T16:00:00Z`,
      });
    }
    
    // Move to next month
    current.setMonth(current.getMonth() + 1);
  }
  return list;
}

mockExpenses.push(...generateDemoExpenses());

// Tambah pengeluaran baru
export function addExpense(data) {
  const expense = {
    id: 'exp-' + Date.now(),
    date: data.date,
    category: data.category,
    amount: Number(data.amount),
    description: data.description,
    receipt_file: data.receipt_file || null,
    recorded_by: data.recorded_by || 'Staff',
    created_at: new Date().toISOString(),
  };
  mockExpenses.push(expense);
  return expense;
}

// Update pengeluaran
export function updateExpense(id, data) {
  const idx = mockExpenses.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  Object.assign(mockExpenses[idx], data, { amount: Number(data.amount ?? mockExpenses[idx].amount) });
  return mockExpenses[idx];
}

// Hapus pengeluaran
export function deleteExpense(id) {
  const idx = mockExpenses.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  mockExpenses.splice(idx, 1);
  return true;
}

// Ambil pengeluaran untuk periode (YYYY-MM)
export function getExpensesForPeriod(period) {
  return mockExpenses.filter((e) => e.date.startsWith(period));
}

// Hitung total pengeluaran untuk periode
export function getTotalExpenses(period) {
  return getExpensesForPeriod(period).reduce((s, e) => s + e.amount, 0);
}

/**
 * Daftar pembayaran IPL yang DIBAYAR pada bulan/tahun tertentu (basis kas masuk),
 * terlepas dari periode IPL yang dibayarnya. Dipakai untuk Laporan B.
 *
 * Berbeda dari computeReport() yang berbasis PERIODE tagihan: fungsi ini
 * berbasis TANGGAL PEMBAYARAN (paid_at). Satu pembayaran untuk periode lampau
 * yang baru dilunasi bulan ini akan muncul di sini.
 * @param {number} year
 * @param {number} month  // 1-12
 * @returns {Array<{paymentId, paidAt, amount, method, unitId, block, unitNumber, residentName, period, recordedBy}>}
 */
export function getPaymentsByMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return mockPayments
    .filter(
      (p) => p.status === 'completed' && typeof p.paid_at === 'string' && p.paid_at.startsWith(prefix)
    )
    .map((p) => {
      const bill = mockIPLBills.find((b) => b.id === p.ipl_bill_id);
      const unit = bill ? getUnitById(bill.unit_id) : null;
      const occupants = unit ? mockProfiles.filter(prof => prof.unit_id === unit.id) : [];
      const profile = getProfileById(p.resident_id) || (unit?.owner_id ? getProfileById(unit.owner_id) : null);
      const residentName =
        profile?.full_name ||
        (occupants.length > 0 ? occupants.map((o) => o.full_name).join(' / ') : '') ||
        (bill ? bill.resident_name : 'Warga') ||
        '-';
      return {
        paymentId: p.id,
        paidAt: p.paid_at,
        amount: p.amount,
        method: p.method,
        unitId: bill?.unit_id || null,
        block: unit?.block || '-',
        unitNumber: unit?.unit_number || '-',
        residentName,
        period: bill?.period || '-',
        recordedBy: p.metadata?.recorded_by || p.metadata?.payer || null,
      };
    })
    .sort((a, b) => (a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0));
}

/** Ambil semua tagihan untuk tahun tertentu */
export function getBillsForYear(year) {
  return mockIPLBills.filter((b) => b.period.startsWith(String(year)));
}

/**
 * Ambil daftar tahun yang punya data tagihan (untuk dropdown tahun).
 */
export function getAvailableYears() {
  const years = [...new Set(mockIPLBills.map((b) => b.period.split('-')[0]))];
  return years.sort().reverse().map(Number);
}

/**
 * Bangun matriks pembayaran: baris = unit, kolom = 12 bulan.
 * Setiap sel berisi { status, bill } atau null bila tidak ada tagihan.
 *
 * @param {number} year
 * @param {object} opts - { scopeUnitId } untuk warga (hanya unit sendiri)
 * @returns array baris: { unit, resident, cells: [12] }
 */
export function getBillMatrix(year, opts = {}) {
  const { scopeUnitId } = opts;
  const targetUnitId = scopeUnitId ? Number(scopeUnitId) : null;
  const units = targetUnitId
    ? mockUnits.filter((u) => u.id === targetUnitId)
    : mockUnits; // Tampilkan seluruh unit (termasuk rumah kosong) di dalam matriks

  // Periode 12 bulan tahun buku (Juli YYYY s.d. Juni YYYY+1)
  const matrixPeriods = [
    `${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`,
    `${year + 1}-01`, `${year + 1}-02`, `${year + 1}-03`, `${year + 1}-04`, `${year + 1}-05`, `${year + 1}-06`
  ];

  return units.map((unit) => {
    const resident = getBillRecipient(unit.id);
    const cells = matrixPeriods.map((period) => {
      const bill = mockIPLBills.find(
        (b) => Number(b.unit_id) === Number(unit.id) && b.period === period
      );
      if (!bill) return null;
      const payment = bill.payment_id
        ? mockPayments.find((p) => p.id === bill.payment_id)
        : mockPayments.find((p) => p.ipl_bill_id === bill.id) || null;

      return {
        status: bill.status,
        bill,
        payment: payment ? payment : null,
      };
    });
    return {
      unit,
      resident: resident || null,
      cells,
    };
  });
}

/** Nama bulan pendek (Indonesia) */
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/** Nama bulan panjang (Indonesia) */
export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Hitung running balance dari Januari 2025 sampai bulan target.
 * Mengembalikan array objek per bulan secara berurutan.
 * 
 * @param {number} targetYear - tahun target (misal 2026)
 * @param {number} targetMonth - bulan target 1-12 (misal 6 = Juni)
 * @returns {Array<{
 *   period: string,
 *   year: number,
 *   month: number,
 *   openingBalance: number,
 *   totalIncome: number,
 *   totalExpense: number,
 *   closingBalance: number,
 *   incomeCount: number,
 *   expenseCount: number,
 * }>}
 */
export function computeRunningBalance(targetYear, targetMonth) {
  const result = [];
  let cumulativeBalance = 0; // Saldo awal Kas = Rp 0 (Aplikasi baru)

  const startYear = 2025;
  const startMonth = 1;

  let y = startYear;
  let m = startMonth;

  while (y < targetYear || (y === targetYear && m <= targetMonth)) {
    const period = `${y}-${String(m).padStart(2, '0')}`;
    
    // Kas masuk: pembayaran IPL yang paid_at di bulan ini
    const payments = getPaymentsByMonth(y, m);
    const totalIncome = payments.reduce((s, p) => s + p.amount, 0);
    
    // Kas keluar: pengeluaran di bulan ini  
    const expenses = getExpensesForPeriod(period);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    
    const openingBalance = cumulativeBalance;
    const closingBalance = openingBalance + totalIncome - totalExpense;
    
    result.push({
      period,
      year: y,
      month: m,
      openingBalance,
      totalIncome,
      totalExpense,
      closingBalance,
      incomeCount: payments.length,
      expenseCount: expenses.length,
    });
    
    cumulativeBalance = closingBalance;
    
    // Next month
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  
  return result;
}

/**
 * Ambil running balance untuk SATU bulan spesifik.
 * Menghitung seluruh chain dari Jan 2025 untuk mendapatkan saldo awal yang benar.
 */
export function getMonthBalance(year, month) {
  const chain = computeRunningBalance(year, month);
  return chain[chain.length - 1] || {
    period: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    openingBalance: 15000000,
    totalIncome: 0,
    totalExpense: 0,
    closingBalance: 15000000,
    incomeCount: 0,
    expenseCount: 0,
  };
}

/**
 * Hitung laporan keuangan IPL untuk periode (YYYY-MM) tertentu.
 * @returns { totalBilled, totalCollected, totalOutstanding, collectionRate, byBlock, details }
 */
export function computeReport(period) {
  const bills = mockIPLBills.filter((b) => b.period === period);
  const totalBilled = bills.reduce((s, b) => s + b.amount, 0);
  const paidBills = bills.filter((b) => b.status === 'paid');
  const totalCollected = paidBills.reduce((s, b) => s + b.amount, 0);
  const totalOutstanding = totalBilled - totalCollected;
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  // Breakdown per blok
  const byBlock = {};
  for (const b of bills) {
    const unit = getUnitById(b.unit_id);
    const block = unit?.block || '?';
    if (!byBlock[block]) {
      byBlock[block] = { block, billed: 0, collected: 0, count: 0, paid: 0 };
    }
    byBlock[block].billed += b.amount;
    byBlock[block].count += 1;
    if (b.status === 'paid') {
      byBlock[block].collected += b.amount;
      byBlock[block].paid += 1;
    }
  }

  // Detail per unit
  const details = bills.map((b) => {
    const unit = getUnitById(b.unit_id);
    const occupants = unit ? mockProfiles.filter(prof => prof.unit_id === unit.id) : [];
    const resident = getProfileById(b.resident_id) || (unit?.owner_id ? getProfileById(unit.owner_id) : null);
    const payment = b.payment_id
      ? mockPayments.find((p) => p.id === b.payment_id)
      : null;
    const residentName =
      resident?.full_name ||
      (occupants.length > 0 ? occupants.map((o) => o.full_name).join(' / ') : '') ||
      b.resident_name ||
      '-';
    return {
      billId: b.id,
      block: unit?.block || '-',
      unitNumber: unit?.unit_number || '-',
      residentName,
      amount: b.amount,
      status: b.status,
      paidAt: payment?.paid_at || null,
    };
  });

  return {
    totalBilled,
    totalCollected,
    totalOutstanding,
    collectionRate,
    billCount: bills.length,
    paidCount: paidBills.length,
    byBlock: Object.values(byBlock).sort((a, b) => a.block.localeCompare(b.block)),
    details,
  };
}

/** Hitung denda berdasarkan settings untuk sebuah nominal */
export function computeLateFee(amount) {
  if (!mockSettings.late_fee_enabled) return 0;
  return mockSettings.late_fee_type === 'percent'
    ? Math.round(amount * (mockSettings.late_fee_value / 100))
    : mockSettings.late_fee_value;
}

// ── HELPERS: aturan urut pembayaran + input manual ──────────────

/**
 * Aturan urut LINTAS TAHUN: sebuah tagihan (unitId, period) hanya bisa
 * dibayar jika SEMUA tagihan periode sebelumnya (di tahun manapun) sudah lunas.
 *
 * @param {number} unitId
 * @param {string} period - "YYYY-MM"
 * @param {string[]} [extraPaidPeriods] - daftar periode yang sedang diseleksi
 *   untuk dibayar dalam transaksi berjalan, dianggap "sudah lunas" agar bulan
 *   berikutnya bisa ikut diseleksi (mendukung pembayaran multi-bulan runut).
 * @returns boolean
 */
export function canPayBill(unitId, period, extraPaidPeriods = []) {
  const extraSet = new Set(extraPaidPeriods);
  const earlierUnpaid = mockIPLBills.filter(
    (b) =>
      b.unit_id === unitId &&
      b.period < period &&
      b.status !== 'paid' &&
      !extraSet.has(b.period)
  );
  return earlierUnpaid.length === 0;
}

/**
 * Ambil payment record untuk sebuah bill (untuk tampil nominal + tanggal bayar).
 */
export function getPaymentForBill(billId) {
  return mockPayments.find((p) => p.ipl_bill_id === billId) || null;
}

/**
 * Catat pembayaran manual oleh bendahara (cash / transfer bank).
 * @param {string} billId
 * @param {object} opts - { method, paidAt, recordedBy, note, receiptFile, recorderRole, amount }
 */
export function recordManualPayment(billId, { method, paidAt, recordedBy, note, receiptFile, recorderRole, amount }) {
  const bill = mockIPLBills.find((b) => b.id === billId);
  if (!bill) return null;
  const paymentId = `pay-manual-${Date.now()}`;

  // Bendahara/admin langsung paid; pengurus/warga perlu verifikasi
  const directPaid = recorderRole && (ROLE_LEVEL[recorderRole] || 0) >= 3;

  // Admin/Bendahara dapat mengubah nominal tagihan saat pencatatan (bisa 0, tidak boleh minus)
  if (directPaid && amount != null && !isNaN(Number(amount)) && Number(amount) >= 0) {
    bill.amount = Number(amount);
  }

  bill.status = directPaid ? 'paid' : 'pending_verification';
  bill.late_fee = directPaid ? 0 : bill.late_fee;
  bill.payment_id = paymentId;
  const paymentAmount = directPaid ? bill.amount : (Number(bill.amount || 0) + Number(bill.late_fee || 0));
  const payment = {
    id: paymentId,
    ipl_bill_id: bill.id,
    resident_id: bill.resident_id,
    amount: paymentAmount,
    method,
    transaction_id: `MANUAL-${paymentId}`,
    status: directPaid ? 'completed' : 'pending_verification',
    paid_at: paidAt,
    receipt_file: receiptFile || null,
    provider: method === 'qris' ? mockSettings.qris_provider : null,
    metadata: {
      recorded_by: recordedBy || 'staff',
      note: note || '',
      provider: method === 'qris' ? mockSettings.qris_provider : null,
    },
  };
  mockPayments.push(payment);
  return payment;
}

/**
 * Catat pembayaran warga multi-bulan (QRIS / transfer bank dengan bukti).
 * @param {string[]} billIds
 * @param {object} opts - { method: 'qris'|'bank_transfer', receiptFile?, note?, payerName? }
 */
export function recordResidentPayment(billIds, { method, receiptFile = null, note = '', payerName = '' } = {}) {
  let count = 0;
  const paidAt = new Date().toISOString().split('T')[0];
  // QRIS langsung paid; bank_transfer perlu verifikasi bendahara/admin
  const isQris = method === 'qris';
  for (const billId of billIds) {
    const bill = mockIPLBills.find((b) => b.id === billId);
    if (!bill || bill.status === 'paid') continue;
    const paymentId = `pay-resident-${Date.now()}-${count}`;
    bill.status = isQris ? 'paid' : 'pending_verification';
    bill.late_fee = isQris ? 0 : bill.late_fee;
    bill.payment_id = paymentId;
    mockPayments.push({
      id: paymentId,
      ipl_bill_id: bill.id,
      resident_id: bill.resident_id,
      amount: bill.amount,
      method,
      transaction_id: `${isQris ? 'TXN' : 'TRF'}-${paymentId}`,
      status: isQris ? 'completed' : 'pending_verification',
      paid_at: paidAt,
      receipt_file: receiptFile || null,
      provider: isQris ? mockSettings.qris_provider : null,
      metadata: { note: note || '', payer: payerName || '', provider: isQris ? mockSettings.qris_provider : null },
    });
    count++;
  }
  return count;
}

/** Format nominal ringkas untuk sel matriks: 500000 → "500k" */
export function formatShort(amount) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(amount % 1000000 ? 1 : 0)}jt`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}k`;
  return String(amount);
}

// User Management CRUD mock functions
export function getUserList() {
  return mockProfiles;
}

export function addMockUser(data) {
  const newUser = {
    id: `u-gen-${Date.now()}`,
    full_name: data.full_name,
    phone: data.phone || '',
    role: data.role,
    unit_id: data.unit_id ? Number(data.unit_id) : null,
    occupancy_status: data.occupancy_status || null,
    is_active: true,
    email: data.email,
    approval_status: data.approval_status || 'approved',
    registered_at: data.registered_at || new Date().toISOString(),
  };
  mockProfiles.push(newUser);
  return newUser;
}

export function updateMockUser(id, data) {
  const idx = mockProfiles.findIndex((p) => p.id === id);
  if (idx !== -1) {
    mockProfiles[idx] = {
      ...mockProfiles[idx],
      ...data,
      unit_id: data.unit_id !== undefined ? (data.unit_id ? Number(data.unit_id) : null) : mockProfiles[idx].unit_id,
    };
    return mockProfiles[idx];
  }
  return null;
}

export function deactivateMockUser(id) {
  const idx = mockProfiles.findIndex((p) => p.id === id);
  if (idx !== -1) {
    mockProfiles[idx].is_active = false;
    return mockProfiles[idx];
  }
  return null;
}

// ── APPROVAL WORKFLOW ────────────────────────────────────────────
// Registrasi user baru butuh approval dari pengurus, bendahara, atau admin.

/** Daftar user yang menunggu persetujuan */
export function getPendingRegistrations() {
  return mockProfiles.filter((p) => p.approval_status === 'pending');
}

/** Daftar riwayat approval (approved + rejected) */
export function getApprovalHistory() {
  return mockProfiles.filter(
    (p) => p.approval_status === 'approved' && p.registered_at > '2026-01-01'
  ).concat(
    mockProfiles.filter((p) => p.approval_status === 'rejected')
  );
}

/**
 * Approve registrasi user.
 * @param {string} userId
 * @param {{ unit_id?: number, occupancy_status?: string, role?: string, phone?: string, approved_by?: string }} data
 */
export function approveRegistration(userId, data = {}) {
  const idx = mockProfiles.findIndex((p) => p.id === userId);
  if (idx === -1) return null;
  
  const unitId = data.unit_id !== undefined ? Number(data.unit_id) : mockProfiles[idx].unit_id;
  const occupancyStatus = data.occupancy_status || mockProfiles[idx].occupancy_status;
  
  mockProfiles[idx] = {
    ...mockProfiles[idx],
    approval_status: 'approved',
    is_active: true,
    full_name: data.full_name || mockProfiles[idx].full_name,
    unit_id: unitId,
    occupancy_status: occupancyStatus,
    role: data.role || mockProfiles[idx].role,
    phone: data.phone || mockProfiles[idx].phone,
    approved_by: data.approved_by || 'System',
    approved_at: new Date().toISOString(),
  };

  // Link unit
  if (unitId) {
    const unit = mockUnits.find((u) => u.id === unitId);
    if (unit) {
      const isOccupied = occupancyStatus !== 'owner_vacant';
      unit.is_occupied = isOccupied;
      if (isOccupied) {
        unit.ipl_schema_id = 'schema-komplit';
      } else {
        unit.ipl_schema_id = 'schema-basic';
      }
      
      if (occupancyStatus && occupancyStatus.startsWith('owner_')) {
        unit.owner_id = mockProfiles[idx].id;
      }
    }
  }

  return mockProfiles[idx];
}

/**
 * Tolak registrasi user.
 * @param {string} userId
 * @param {string} reason
 * @param {string} [rejectedBy]
 */
export function rejectRegistration(userId, reason, rejectedBy, decision = 'rejected') {
  const idx = mockProfiles.findIndex((p) => p.id === userId);
  if (idx === -1) return null;
  const isBlocked = decision === 'blocked';
  mockProfiles[idx] = {
    ...mockProfiles[idx],
    approval_status: isBlocked ? 'blocked' : 'rejected',
    is_active: false,
    rejection_reason: reason,
    rejected_by: rejectedBy || 'System',
    rejected_at: new Date().toISOString(),
  };
  return mockProfiles[idx];
}

export function unblockRegistration(userId) {
  const idx = mockProfiles.findIndex((p) => p.id === userId);
  if (idx === -1) return null;
  mockProfiles[idx] = {
    ...mockProfiles[idx],
    approval_status: 'pending',
    is_active: true,
    rejection_reason: null,
    rejected_by: null,
    rejected_at: null,
  };
  return mockProfiles[idx];
}

// ── VERIFIKASI PEMBAYARAN ────────────────────────────────────────
// Pembayaran transfer oleh warga & pengurus perlu verifikasi bendahara/admin.
// Pembayaran QRIS langsung verified. Pencatatan oleh bendahara/admin langsung paid.

/** Daftar pembayaran menunggu verifikasi */
export function getPendingPayments() {
  return mockPayments.filter((p) => p.status === 'pending_verification');
}

/**
 * Verifikasi pembayaran — ubah status payment → verified, bill → paid.
 * @param {string} paymentId
 * @param {{ verifiedBy: string }} opts
 */
export function verifyPayment(paymentId, opts = {}) {
  const payment = mockPayments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'pending_verification') return null;
  payment.status = 'verified';
  payment.verified_by = opts.verifiedBy || 'Bendahara';
  payment.verified_at = new Date().toISOString();
  // Update bill status ke paid
  const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
  if (bill) {
    bill.status = 'paid';
  }
  return payment;
}

/**
 * Tolak pembayaran — ubah payment → rejected, bill kembali pending/overdue.
 * @param {string} paymentId
 * @param {{ rejectedBy: string, reason: string }} opts
 */
export function rejectPayment(paymentId, opts = {}) {
  const payment = mockPayments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'pending_verification') return null;
  payment.status = 'rejected';
  payment.rejected_by = opts.rejectedBy || 'Bendahara';
  payment.rejected_at = new Date().toISOString();
  payment.rejection_reason = opts.reason || '';
  // Bill kembali ke pending/overdue
  const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
  if (bill) {
    const dueDate = new Date(bill.due_date);
    const today = new Date();
    bill.status = today > dueDate ? 'overdue' : 'pending';
    bill.payment_id = null;
  }
  return payment;
}

/**
 * Revisi bukti pembayaran — warga upload ulang bukti transfer.
 * @param {string} paymentId
 * @param {{ receiptFile: string, note?: string }} opts
 */
export function revisePayment(paymentId, opts = {}) {
  const payment = mockPayments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'rejected') return null;
  payment.status = 'pending_verification';
  payment.receipt_file = opts.receiptFile || payment.receipt_file;
  if (opts.note) payment.metadata = { ...payment.metadata, note: opts.note };
  payment.revised_at = new Date().toISOString();
  // Bill kembali ke pending_verification
  const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
  if (bill) {
    bill.status = 'pending_verification';
    bill.payment_id = payment.id;
  }
  return payment;
}

export function updatePayment(paymentId, opts = {}) {
  const payment = mockPayments.find((p) => p.id === paymentId);
  if (!payment) return null;
  if (opts.amount !== undefined && opts.amount !== '') payment.amount = Number(opts.amount);
  if (opts.status) payment.status = opts.status;
  if (opts.method) {
    payment.method = opts.method;
    payment.provider = opts.method === 'qris' ? (payment.provider || mockSettings.qris_provider) : null;
    payment.metadata = {
      ...(payment.metadata || {}),
      provider: opts.method === 'qris' ? (payment.provider || mockSettings.qris_provider) : null,
    };
  }
  if (opts.paid_at) payment.paid_at = opts.paid_at;
  if (opts.note !== undefined) payment.metadata = { ...(payment.metadata || {}), note: opts.note };
  if (opts.file) {
    payment.receipt_file = opts.file.name || opts.file;
    payment.proof_file_name = payment.receipt_file;
  }
  if (opts.unit_id) {
    payment.unit_id = Number(opts.unit_id) || opts.unit_id;
    const oldBill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
    if (oldBill && String(oldBill.unit_id) !== String(opts.unit_id)) {
      const targetBill = mockIPLBills.find(b => String(b.unit_id) === String(opts.unit_id) && b.period === oldBill.period);
      if (targetBill) {
        payment.ipl_bill_id = targetBill.id;
        targetBill.payment_id = payment.id;
        targetBill.status = payment.status;
        oldBill.payment_id = null;
        oldBill.status = 'unpaid';
      } else {
        oldBill.unit_id = Number(opts.unit_id) || opts.unit_id;
      }
    }
  }

  const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
  if (bill) {
    if (opts.amount !== undefined && opts.amount !== '') {
      bill.amount = Number(opts.amount);
    }
    if (payment.status === 'completed' || payment.status === 'verified') {
      bill.status = 'paid';
      bill.late_fee = 0;
      bill.payment_id = payment.id;
    } else if (payment.status === 'cancelled') {
      const dueDate = new Date(bill.due_date);
      const today = new Date();
      bill.status = today > dueDate ? 'overdue' : 'pending';
      bill.payment_id = null;
    }
  }

  payment.updated_at = new Date().toISOString();
  return { ok: true, data: { payment } };
}

/**
 * Batalkan pembayaran — hapus pembayaran yang menggantung atau ditolak.
 * @param {string} paymentId
 */
export function cancelPayment(paymentId) {
  const payment = mockPayments.find((p) => p.id === paymentId);
  if (!payment) return null;
  // Hapus payment dari array
  const idx = mockPayments.findIndex((p) => p.id === paymentId);
  if (idx !== -1) mockPayments.splice(idx, 1);
  // Bill kembali ke pending/overdue
  const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
  if (bill) {
    const dueDate = new Date(bill.due_date);
    const today = new Date();
    bill.status = today > dueDate ? 'overdue' : 'pending';
    bill.payment_id = null;
  }
  return payment;
}

// Mock System Logs
export const mockLogSettings = {
  loginLogEnabled: true,
  accessLogEnabled: true,
  transactionLogEnabled: true,
};

export const mockLoginLogs = [
  { id: 'log-1', email: 'admin@palmvillage.id', timestamp: '2026-07-04T08:00:00Z', status: 'success', ip: '192.168.1.10' },
  { id: 'log-2', email: 'bendahara@palmvillage.id', timestamp: '2026-07-04T08:05:00Z', status: 'success', ip: '192.168.1.11' },
  { id: 'log-3', email: 'pengurus@palmvillage.id', timestamp: '2026-07-04T08:10:00Z', status: 'success', ip: '192.168.1.12' },
  { id: 'log-4', email: 'warga@palmvillage.id', timestamp: '2026-07-04T08:15:00Z', status: 'success', ip: '192.168.1.13' },
  { id: 'log-5', email: 'stranger@gmail.com', timestamp: '2026-07-04T09:00:00Z', status: 'failed', ip: '202.152.0.45' },
  { id: 'log-6', email: 'warga@palmvillage.id', timestamp: '2026-07-03T19:30:00Z', status: 'success', ip: '182.253.12.11' },
  { id: 'log-7', email: 'admin@palmvillage.id', timestamp: '2026-07-03T08:00:00Z', status: 'success', ip: '192.168.1.10' },
  { id: 'log-8', email: 'guest@palmvillage.id', timestamp: '2026-07-02T14:22:00Z', status: 'failed', ip: '110.138.54.98' },
];

export const mockAccessLogs = [
  { id: 'acc-1', userName: 'Pak Hendra (Admin)', page: '/users', timestamp: '2026-07-04T08:01:00Z' },
  { id: 'acc-2', userName: 'Budi Santoso (Bendahara)', page: '/expenses', timestamp: '2026-07-04T08:06:00Z' },
  { id: 'acc-3', userName: 'Ibu Ratna (Koordinator Lingkungan)', page: '/reports', timestamp: '2026-07-04T08:11:00Z' },
  { id: 'acc-4', userName: 'Siti Rahayu', page: '/payment-matrix', timestamp: '2026-07-04T08:16:00Z' },
  { id: 'acc-5', userName: 'Pak Hendra (Admin)', page: '/logs', timestamp: '2026-07-04T08:30:00Z' },
];

export const mockTransactionLogs = [
  { id: 'txn-1', userName: 'Budi Santoso (Bendahara)', action: 'Catat Pengeluaran', details: 'Honor petugas kebersihan', amount: 750000, timestamp: '2026-07-04T08:07:00Z' },
  { id: 'txn-2', userName: 'Siti Rahayu', action: 'Bayar IPL', details: 'Pelunasan IPL Blok A/02', amount: 500000, timestamp: '2026-07-04T08:18:00Z' },
  { id: 'txn-3', userName: 'Budi Santoso (Bendahara)', action: 'Catat Pembayaran', details: 'Pembayaran IPL Blok A/03 (Manual)', amount: 500000, timestamp: '2026-07-04T08:45:00Z' },
  { id: 'txn-4', userName: 'Pak Hendra (Admin)', action: 'Ubah Pengaturan', details: 'Perubahan tanggal jatuh tempo menjadi tgl 10', amount: null, timestamp: '2026-07-04T09:12:00Z' },
];



/**
 * Simulasi pengiriman Kuitansi Digital via Email
 */
export function sendEmailReceipt({ bill, unit, owner, occupant }) {
  const targetEmail = occupant?.email || owner?.email || `warga.${unit?.block || 'A'}${unit?.unit_number || '1'}@palmvillage.id`;
  const noKuitansi = `PV/IPL/${bill?.period || '2026'}/${bill?.id || '0'}`;
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        email: targetEmail,
        noKuitansi,
        message: `Kuitansi digital ${noKuitansi} berhasil dikirim ke email ${targetEmail}.`,
      });
    }, 600);
  });
}

/**
 * Mock Listing Pricing Catalogue (T10.3 / Demo Mode)
 */
export const mockListingPricing = [
  {
    id: 'mock-price-kos-regular',
    listing_type: 'room_vacancy',
    is_featured: false,
    duration_days: 30,
    price: 15000,
  },
  {
    id: 'mock-price-kos-featured',
    listing_type: 'room_vacancy',
    is_featured: true,
    duration_days: 30,
    price: 35000,
  },
  {
    id: 'mock-price-umkm-regular',
    listing_type: 'umkm',
    is_featured: false,
    duration_days: 30,
    price: 10000,
  },
  {
    id: 'mock-price-umkm-featured',
    listing_type: 'umkm',
    is_featured: true,
    duration_days: 30,
    price: 25000,
  },
];

/**
 * Mock Public Listings (T10.4 / Demo Mode)
 */
export const mockPublicListings = [
  {
    id: 'mock-listing-kos-1',
    tenant_id: 'demo-tenant-kos',
    unit_id: 1,
    posted_by: 'mem-kos-owner-1',
    type: 'room_vacancy',
    title: 'Kamar 101 - Kos Melati Harmoni',
    description: 'Kamar lantai 1 ukuran 3x4 meter, kamar mandi dalam, AC, kasur springbed, lemari pakaian, WiFi 50Mbps gratis.',
    category: 'Campur',
    price: 1200000,
    photos: ['https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80'],
    contact_phone: '081234567891',
    location_hint: 'Jl. Melati Raya No. 12, Sleman (Dekat Kampus)',
    is_featured: true,
    featured_until: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mock-listing-umkm-1',
    tenant_id: 'demo-tenant-rtrw',
    unit_id: null,
    posted_by: 'mem-rtrw-warga-1',
    type: 'umkm',
    title: 'Catering Berkah Barokah - Nasi Kotak & Syukuran',
    description: 'Menerima pesanan nasi kotak arisan, rapat RT, aqiqah, dan tumpeng syukuran. Menu higienis dan bersertifikat halal.',
    category: 'Kuliner & Makanan',
    price: 25000,
    photos: ['https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=600&q=80'],
    contact_phone: '081299887766',
    location_hint: 'Blok A3 No. 12, Palm Village RT 05',
    is_featured: false,
    featured_until: null,
    status: 'active',
    expires_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
