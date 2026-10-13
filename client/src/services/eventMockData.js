// Small, isolated event-finance fixture used only by demo mode.
// Keeping it outside mockData.js avoids changing the existing IPL/expense
// fixtures and makes event-scoped behavior testable without a backend.

const events = [
  {
    id: 'demo-event-a',
    event_code: 'EVT-DEMO-A',
    title: 'Kerja Bakti Lingkungan',
    description: 'Kegiatan kebersihan bersama warga perumahan.',
    event_date: '2026-08-09T07:00:00+07:00',
    end_date: '2026-08-09T12:00:00+07:00',
    location: 'Lapangan Kompleks',
    status: 'active',
    documentation_url: 'https://drive.google.com/drive/folders/demo-kerja-bakti',
    deleted_at: null,
  },
  {
    id: 'demo-event-b',
    event_code: 'EVT-DEMO-B',
    title: 'Perayaan HUT Kemerdekaan',
    description: 'Persiapan acara 17 Agustus.',
    event_date: '2026-08-17T15:00:00+07:00',
    end_date: null,
    location: 'Balai Warga',
    status: 'draft',
    documentation_url: '',
    deleted_at: null,
  },
];

const members = [
  {
    id: 'demo-member-a1',
    event_id: 'demo-event-a',
    profile_id: 'demo-admin',
    profile_name: 'Pak Hendra (Admin)',
    assignment_role: 'event_treasurer',
    custom_role_title: 'Bendahara Event',
    revoked_at: null,
  },
  {
    id: 'demo-member-a2',
    event_id: 'demo-event-a',
    profile_id: 'demo-pengurus',
    profile_name: 'Ibu Ratna (Koordinator Lingkungan)',
    assignment_role: 'event_leader',
    custom_role_title: 'Ketua Pelaksana',
    revoked_at: null,
  },
  {
    id: 'demo-member-a3',
    event_id: 'demo-event-a',
    profile_id: 'demo-warga',
    profile_name: 'Pak Budi (Warga)',
    assignment_role: 'coordinator_member',
    custom_role_title: 'Sie Konsumsi & Kebersihan',
    revoked_at: null,
  },
];

const incomes = [
  {
    id: 'demo-income-1',
    income_date: '2026-08-10',
    scope: 'general',
    event_id: null,
    category: 'Donasi Kebersihan',
    source_name: 'Pak Hendra (Warga Blok A-01)',
    amount: 150000,
    payment_method: 'bank_transfer',
    reference_number: 'TRX-DON-881',
    description: 'Donasi sukarela pengadaan tempat sampah taman.',
    receipt_file_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=800',
    receipt_file_name: 'bukti_transfer_donasi_taman.jpg',
    status: 'verified',
    verified_by: 'demo-admin',
    verified_at: '2026-08-10T10:30:00.000Z',
    rejection_reason: null,
    created_at: '2026-08-10T09:00:00.000Z',
    updated_at: '2026-08-10T10:30:00.000Z',
    deleted_at: null,
  },
  {
    id: 'demo-income-2',
    income_date: '2026-08-12',
    scope: 'event',
    event_id: 'demo-event-a',
    category: 'Pendaftaran Lomba',
    source_name: 'Ibu Ratna (Warga Blok B-03)',
    amount: 50000,
    payment_method: 'bank_transfer',
    reference_number: 'TRX-LOMBA-17A',
    description: 'Pendaftaran lomba mewarnai anak HUT RI.',
    receipt_file_url: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&q=80&w=800',
    receipt_file_name: 'bukti_transfer_lomba_anak.png',
    status: 'pending_verification',
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    created_at: '2026-08-12T14:20:00.000Z',
    updated_at: '2026-08-12T14:20:00.000Z',
    deleted_at: null,
  },
  {
    id: 'demo-income-3',
    income_date: '2026-08-14',
    scope: 'event',
    event_id: 'demo-event-a',
    category: 'Iuran Kegiatan',
    source_name: 'Pak Budi Santoso',
    amount: 100000,
    payment_method: 'qris',
    reference_number: 'NMD-982104921',
    description: 'Partisipasi konsumsi kerja bakti.',
    receipt_file_url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=800',
    receipt_file_name: 'qris_receipt_kerja_bakti.jpg',
    status: 'pending_verification',
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    created_at: '2026-08-14T11:00:00.000Z',
    updated_at: '2026-08-14T11:00:00.000Z',
    deleted_at: null,
  },
];
const expenses = [];

function activeEvent(event) {
  return !event.deleted_at;
}

export function listDemoEvents({ role, profileId, includeDeleted = false } = {}) {
  const visible = includeDeleted ? events : events.filter(activeEvent);
  if (role === 'admin' || role === 'bendahara' || role === 'admin_viewer') return visible.map((event) => ({ ...event }));
  if (!profileId) return [];
  const assignedIds = new Set(
    members.filter((member) => member.profile_id === profileId && !member.revoked_at).map((member) => member.event_id)
  );
  return visible.filter((event) => assignedIds.has(event.id)).map((event) => ({ ...event }));
}

export function getDemoEvent(eventId) {
  const event = events.find((item) => item.id === eventId && activeEvent(item));
  return event ? { ...event } : null;
}

export function getDemoMembers(eventId) {
  return members.filter((member) => member.event_id === eventId).map((member) => ({ ...member }));
}

export function getDemoAccess({ role, profileId } = {}) {
  const assigned = members
    .filter((member) => member.profile_id === profileId && !member.revoked_at)
    .map((member) => ({
      event_id: member.event_id,
      assignment_role: member.assignment_role,
      can_view: true,
      can_manage_finance: role === 'admin' || role === 'bendahara' || member.assignment_role === 'event_treasurer',
      can_manage_event: role === 'admin',
    }));

  return {
    global: {
      can_view_all_events: role === 'admin' || role === 'bendahara' || role === 'admin_viewer',
      can_manage_event: role === 'admin',
      can_manage_general_finance: role === 'admin' || role === 'bendahara',
    },
    events: assigned,
  };
}

export function listDemoIncomes({ eventId, scope, status } = {}) {
  return incomes
    .filter((income) => !income.deleted_at)
    .filter((income) => !scope || income.scope === scope)
    .filter((income) => !eventId || income.event_id === eventId)
    .filter((income) => !status || income.status === status)
    .map((income) => ({ ...income }));
}

export function createDemoIncome(payload) {
  const isWarga = payload.is_warga === true || payload.role === 'warga';
  const defaultStatus = isWarga ? 'pending_verification' : (payload.status || 'verified');
  const income = {
    id: `demo-income-${Date.now()}`,
    ...payload,
    amount: Number(payload.amount),
    status: defaultStatus,
    verified_by: defaultStatus === 'verified' ? (payload.recorded_by || 'demo-admin') : null,
    verified_at: defaultStatus === 'verified' ? new Date().toISOString() : null,
    rejection_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  incomes.unshift(income);
  return { ...income };
}

export function updateDemoIncome(id, payload) {
  const index = incomes.findIndex((income) => income.id === id && !income.deleted_at);
  if (index < 0) return null;
  incomes[index] = { ...incomes[index], ...payload, amount: Number(payload.amount !== undefined ? payload.amount : incomes[index].amount), updated_at: new Date().toISOString() };
  return { ...incomes[index] };
}

export function approveDemoIncome(id, { verifiedBy = 'Demo Admin', note = '' } = {}) {
  const index = incomes.findIndex((income) => income.id === id && !income.deleted_at);
  if (index < 0) return null;
  incomes[index] = {
    ...incomes[index],
    status: 'verified',
    verified_by: verifiedBy,
    verified_at: new Date().toISOString(),
    rejection_reason: null,
    verification_note: note,
    updated_at: new Date().toISOString(),
  };
  return { ...incomes[index] };
}

export function rejectDemoIncome(id, { rejectedBy = 'Demo Admin', reason = '' } = {}) {
  const index = incomes.findIndex((income) => income.id === id && !income.deleted_at);
  if (index < 0) return null;
  incomes[index] = {
    ...incomes[index],
    status: 'rejected',
    verified_by: rejectedBy,
    verified_at: new Date().toISOString(),
    rejection_reason: reason,
    updated_at: new Date().toISOString(),
  };
  return { ...incomes[index] };
}

export function deleteDemoIncome(id) {
  const income = incomes.find((item) => item.id === id && !item.deleted_at);
  if (!income) return null;
  income.deleted_at = new Date().toISOString();
  return { ...income };
}

export function getDemoEventReport(eventId) {
  const rows = listDemoIncomes({ eventId });
  const expenseRows = listDemoExpenses({ eventId });
  const totalIncome = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalExpense = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return {
    event: getDemoEvent(eventId),
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    transactionCount: rows.length + expenseRows.length,
    incomes: rows,
    expenses: expenseRows,
  };
}

export function listDemoExpenses({ eventId } = {}) {
  return expenses
    .filter((expense) => !expense.deleted_at && (!eventId || expense.event_id === eventId))
    .map((expense) => ({ ...expense }));
}

export function createDemoExpense(payload) {
  const expense = {
    id: `demo-event-expense-${Date.now()}`,
    ...payload,
    amount: Number(payload.amount),
    date: payload.date || payload.expense_date,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
  expenses.push(expense);
  return { ...expense };
}

export function updateDemoExpense(id, payload) {
  const index = expenses.findIndex((expense) => expense.id === id && !expense.deleted_at);
  if (index < 0) return null;
  expenses[index] = { ...expenses[index], ...payload, amount: Number(payload.amount), updated_at: new Date().toISOString() };
  return { ...expenses[index] };
}

export function deleteDemoExpense(id) {
  const expense = expenses.find((item) => item.id === id && !item.deleted_at);
  if (!expense) return null;
  expense.deleted_at = new Date().toISOString();
  return { ...expense };
}
