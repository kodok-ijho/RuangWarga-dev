/**
 * dataHelpers.js
 *
 * Mode-agnostic utility functions for formatting, labels, and role checks.
 * These are safe to import in both demo and production modes because they
 * contain no mock data — only pure helper logic.
 *
 * Components should import helpers from here instead of from mockData.js
 * when they only need formatting/label utilities.
 */

// ── STATUS PENGHUNI ──────────────────────────────────────────────
export const OCCUPANCY_STATUS = {
  owner_occupied: 'Tetap / Owner - Dihuni',
  owner_vacant: 'Tetap / Owner - Tidak Dihuni',
  owner_rented: 'Tetap / Owner - Dikontrakkan',
  tenant: 'Kontrak',
};

// ── FORMATTING ───────────────────────────────────────────────────
export function formatRupiah(amount) {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatShort(amount) {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
  return formatRupiah(amount);
}

export function formatPeriod(period) {
  if (!period) return '-';
  const [y, m] = period.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(m, 10) - 1] || m} ${y}`;
}

export function formatPeriodShort(period) {
  if (!period || typeof period !== 'string' || !period.includes('-')) return String(period || '-');
  const [y, m] = period.split('-');
  const monthsLong = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const monthName = monthsLong[parseInt(m, 10) - 1] || m;
  return `${monthName} ${y}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${datePart} ${timePart}`;
}


// ── BILL STATUS ──────────────────────────────────────────────────
export function billStatusLabel(status) {
  const map = {
    pending: 'Belum Bayar',
    paid: 'Lunas',
    overdue: 'Terlambat',
    partial: 'Sebagian',
    waiting_verification: 'Menunggu Verifikasi',
    pending_verification: 'Menunggu Verifikasi',
    rejected: 'Ditolak',
    cancelled: 'Dibatalkan',
    failed: 'Gagal',
    expired: 'Kedaluwarsa',
  };
  return map[status] || status;
}

export function billStatusColor(status) {
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-red-100 text-red-700',
    partial: 'bg-blue-100 text-blue-700',
    waiting_verification: 'bg-purple-100 text-purple-700',
    pending_verification: 'bg-orange-100 text-orange-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    failed: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
}

// ── ROLE HELPERS ─────────────────────────────────────────────────
// Keep payment status values consistent across API response shapes.
export function normalizePaymentStatus(status, { method = '', hasProof = false } = {}) {
  const value = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['completed', 'success', 'successful', 'paid', 'verified'].includes(value)) {
    return 'verified';
  }
  if (
    [
      'pending_verification',
      'waiting_verification',
      'awaiting_verification',
      'submitted',
      'menunggu_verifikasi',
    ].includes(value)
  ) {
    return 'pending_verification';
  }
  if (['rejected', 'declined', 'denied'].includes(value)) {
    return 'rejected';
  }
  // Older transfer records can remain `pending` after proof upload.
  if (value === 'pending' && String(method).toLowerCase() === 'bank_transfer' && hasProof) {
    return 'pending_verification';
  }
  return status || '';
}

export function isPendingVerificationStatus(status, options) {
  return normalizePaymentStatus(status, options) === 'pending_verification';
}

// `admin_viewer` is a local/demo read-only overlay, not a database role. Keep
// the production hierarchy limited to the four canonical Supabase roles.
const ROLE_HIERARCHY = ['warga', 'pengurus', 'bendahara', 'admin'];
const READ_ONLY_ROLES = new Set(['admin_viewer']);

export function hasMinRole(userRole, minRole) {
  const minimumIndex = ROLE_HIERARCHY.indexOf(minRole);
  if (minimumIndex < 0) return false;
  if (userRole === 'admin_viewer') return true;
  const userIndex = ROLE_HIERARCHY.indexOf(userRole);
  return userIndex >= minimumIndex;
}

export function canModifyData(role) {
  return ROLE_HIERARCHY.includes(role) && !READ_ONLY_ROLES.has(role);
}

export function isStaffRole(role) {
  return hasMinRole(role, 'pengurus');
}

export function isBendaharaOrAbove(role) {
  return hasMinRole(role, 'bendahara');
}

export function canViewFinancialReports(role) {
  return ['pengurus', 'bendahara', 'admin', 'admin_viewer'].includes(role);
}

export function canViewPaymentMatrix(role) {
  return Boolean(role);
}

export function isAdminRole(role) {
  return role === 'admin';
}

export function isAdminViewerRole(role) {
  return role === 'admin_viewer';
}

export function canViewResidents(role) {
  return ROLE_HIERARCHY.includes(role) || isAdminViewerRole(role);
}

export function canManageResidents(role, isReadOnly = false) {
  return hasMinRole(role, 'pengurus') && !isReadOnly && role !== 'admin_viewer';
}

export function canViewHouses(role) {
  return ROLE_HIERARCHY.includes(role) || isAdminViewerRole(role);
}

export function canManageHouses(role, isReadOnly = false) {
  return role === 'admin' && !isReadOnly;
}

export function canViewEvents(role) {
  return hasMinRole(role, 'pengurus');
}

export function canViewIncomes(role) {
  return hasMinRole(role, 'pengurus');
}

export function canViewUsers(role) {
  return hasMinRole(role, 'pengurus');
}

export function canViewUserApproval(role) {
  return hasMinRole(role, 'pengurus');
}

export function canManageUsers(role, isReadOnly = false) {
  return role === 'admin' && !isReadOnly;
}

export function canViewPaymentVerification(role) {
  return hasMinRole(role, 'bendahara');
}

export function canViewSettings(role) {
  return hasMinRole(role, 'pengurus');
}

export function canManageSettings(role, isReadOnly = false) {
  return role === 'admin' && !isReadOnly;
}

export function canManagePaymentSchemas(role, isReadOnly = false) {
  return hasMinRole(role, 'bendahara') && !isReadOnly;
}

const PAYMENT_ROLES = ['warga', 'pengurus', 'bendahara', 'admin'];

export function getQrisProviderLabel(provider) {
  const value = String(provider || 'doku').trim().toLowerCase();
  const map = {
    midtrans: 'Midtrans',
    doku: 'DOKU',
  };
  return map[value] || 'DOKU';
}

export function canUseQrisPayment(role, { qrisEnabled = false, isReadOnly = false } = {}) {
  if (!qrisEnabled) return false;
  if (isReadOnly) {
    return role === 'admin' || role === 'admin_viewer';
  }
  return PAYMENT_ROLES.includes(role);
}

export function getPaymentMethodAvailability(role, { qrisEnabled = false, isReadOnly = false } = {}) {
  return {
    canTransfer: !isReadOnly && PAYMENT_ROLES.includes(role),
    canCash: !isReadOnly && ['bendahara', 'admin'].includes(role),
    canQris: canUseQrisPayment(role, { qrisEnabled, isReadOnly }),
  };
}

export function canViewExpenses(role) {
  return hasMinRole(role, 'pengurus');
}

export function canManageGeneralExpenses(role, isReadOnly = false) {
  return hasMinRole(role, 'bendahara') && !isReadOnly;
}

export function canViewLogs(role) {
  return hasMinRole(role, 'admin');
}

export function roleLabel(role, tenantType = 'rt_rw') {
  if (tenantType === 'kelas') {
    const kelasMap = {
      warga: 'Siswa / Wali Murid',
      anggota: 'Siswa / Wali Murid',
      pengurus: 'Staf Pengajar',
      bendahara: 'Bendahara Kelas',
      admin: 'Pengajar / Pengelola',
      admin_viewer: 'Admin Viewer',
    };
    return kelasMap[role] || role || '-';
  }
  if (tenantType === 'kos') {
    const kosMap = {
      warga: 'Penyewa',
      anggota: 'Penyewa',
      pengurus: 'Pengelola Kos',
      bendahara: 'Bendahara Kos',
      admin: 'Pemilik Kos',
      admin_viewer: 'Admin Viewer',
    };
    return kosMap[role] || role || '-';
  }
  if (tenantType === 'arisan') {
    const arisanMap = {
      warga: 'Peserta Arisan',
      anggota: 'Peserta Arisan',
      pengurus: 'Pengurus Arisan',
      bendahara: 'Bendahara Arisan',
      admin: 'Ketua / Admin Arisan',
      admin_viewer: 'Admin Viewer',
    };
    return arisanMap[role] || role || '-';
  }
  const map = { warga: 'Warga', anggota: 'Warga', pengurus: 'Pengurus RT/RW', bendahara: 'Bendahara', admin: 'Ketua RT/RW / Admin', admin_viewer: 'Admin Viewer' };
  return map[role] || role || '-';
}

export function roleColor(role) {
  const normalized = String(role || '').toLowerCase();
  const map = {
    admin: 'bg-purple-100 text-purple-700 border-purple-200',
    admin_viewer: 'bg-slate-100 text-slate-700 border-slate-200',
    bendahara: 'bg-teal-100 text-teal-700 border-teal-200',
    pengurus: 'bg-blue-100 text-blue-700 border-blue-200',
    warga: 'bg-forest-100 text-forest-700 border-forest-200',
    anggota: 'bg-forest-100 text-forest-700 border-forest-200',
  };
  return map[normalized] || 'bg-amber-100 text-amber-800 border-amber-200';
}

// ── OCCUPANCY STATUS ─────────────────────────────────────────────
export function occupancyStatusLabel(status, tenantType = 'rt_rw') {
  if (tenantType === 'kos') {
    const kosMap = {
      tenant: 'Penyewa Aktif',
      owner_occupied: 'Pemilik / Pengelola',
      owner_rented: 'Kamar Tersewa',
      owner_vacant: 'Kamar Kosong',
      checkout: 'Selesai / Checkout',
      booking: 'Dipesan / Booking',
    };
    return kosMap[status] || OCCUPANCY_STATUS[status] || status || '-';
  }
  if (tenantType === 'kelas') {
    const kelasMap = {
      tenant: 'Siswa Terdaftar',
      student: 'Siswa Terdaftar',
      active: 'Siswa Terdaftar',
      owner_occupied: 'Pengajar / Wali Kelas',
      owner_rented: 'Slot Terisi',
      owner_vacant: 'Slot Terbuka',
      checkout: 'Lulus / Selesai',
      completed: 'Lulus / Selesai',
      alumni: 'Lulus / Alumni',
      booking: 'Calon Siswa / Dipesan',
    };
    return kelasMap[status] || OCCUPANCY_STATUS[status] || status || '-';
  }
  if (tenantType === 'arisan') {
    const arisanMap = {
      tenant: 'Peserta Aktif',
      owner_occupied: 'Ketua Arisan',
      owner_rented: 'Slot Terisi',
      owner_vacant: 'Slot Terbuka',
      checkout: 'Selesai / Keluar',
      booking: 'Calon Peserta',
    };
    return arisanMap[status] || OCCUPANCY_STATUS[status] || status || '-';
  }
  return OCCUPANCY_STATUS[status] || status || '-';
}

export function occupancyStatusColor(status) {
  const map = {
    owner_occupied: 'bg-emerald-100 text-emerald-700',
    owner_vacant: 'bg-amber-100 text-amber-700',
    owner_rented: 'bg-blue-100 text-blue-700',
    tenant: 'bg-indigo-100 text-indigo-700',
    checkout: 'bg-gray-100 text-gray-600',
    booking: 'bg-amber-100 text-amber-800',
  };
  return map[status] || 'bg-gray-100 text-gray-500';
}

// ── IPL SCHEMA HELPERS ───────────────────────────────────────────
export const DEFAULT_IPL_SCHEMAS = [
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
];

export function computeSchemaAmount(schema) {
  if (!schema || !schema.components) return 0;
  return schema.components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function getSchemaById(schemas, schemaId) {
  const list = (schemas && schemas.length > 0) ? schemas : DEFAULT_IPL_SCHEMAS;
  return list.find((s) => s.id === schemaId) || list[0];
}

// ── MONTH CONSTANTS ──────────────────────────────────────────────
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
