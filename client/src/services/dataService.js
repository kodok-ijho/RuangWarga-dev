/**
 * dataService.js
 *
 * Unified data access layer that routes to mock data (demo) or real API
 * (production) based on the VITE_DEMO_MODE environment variable.
 *
 * Components import from this file instead of directly from mockData.js
 * or apiClient.js. This avoids scattering IS_DEMO_MODE checks across
 * every page component.
 *
 * Pattern:
 *   export async function fetchSomething(token, params) {
 *     if (IS_DEMO) return demoImpl(params);
 *     return apiImpl(token, params);
 *   }
 *
 * Each function returns a consistent shape regardless of mode.
 */

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ── Lazy mock imports ────────────────────────────────────────────
// Only loaded when IS_DEMO is true, keeping production bundles lean.
async function getMockData() {
  return import('./mockData.js');
}

async function getEventMockData() {
  return import('./eventMockData.js');
}

// ── API imports ──────────────────────────────────────────────────
import { PortalApiError, portalApiPost, portalApiUpload } from './apiClient';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import {
  DEFAULT_IPL_SCHEMAS,
  getQrisProviderLabel,
  isPendingVerificationStatus,
  normalizePaymentStatus,
} from './dataHelpers';

// =====================================================================
// USER APPROVAL
// =====================================================================

export async function fetchPendingUsers(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const users = mock.getPendingRegistrations();
    return { users, count: users.length };
  }
  const data = await portalApiPost('/users/pending', { token });
  return {
    users: (data?.users || []).map((u) => ({ ...u, registered_at: u.created_at })),
    count: Number(data?.count || 0),
  };
}

export async function approveUser(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.approveRegistration(payload.profile_id, {
      full_name: payload.full_name,
      phone: payload.phone,
      unit_id: payload.unit_id,
      occupancy_status: payload.occupancy_status,
      role: payload.role,
      approved_by: payload.approved_by,
    });
    return { ok: true };
  }
  return portalApiPost('/users/approve', {
    token,
    body: {
      profile_id: payload.profile_id,
      full_name: payload.full_name,
      phone: payload.phone,
      role: payload.role,
      unit_id: payload.unit_id,
      occupancy_status: payload.occupancy_status,
      approval_note: payload.approval_note || '',
    },
  });
}

export async function rejectUser(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.rejectRegistration(payload.profile_id, payload.approval_note, payload.rejected_by, payload.decision);
    return { ok: true };
  }
  return portalApiPost('/users/reject', {
    token,
    body: {
      profile_id: payload.profile_id,
      approval_note: payload.approval_note,
      decision: payload.decision || 'rejected',
    },
  });
}

export async function unblockUser(token, profileId) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.unblockRegistration(profileId);
    return { ok: true };
  }
  return portalApiPost('/users/reject', {
    token,
    body: { profile_id: profileId, decision: 'unblock' },
  });
}

export async function fetchUsers(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getUserList();
  }
  const data = await portalApiPost('/users/list', { token });
  return data?.users || [];
}

export async function createUser(token, payload) {
  return createResident(token, payload);
}

export async function updateUser(token, id, payload) {
  return updateResident(token, id, payload);
}

export async function deactivateUser(token, id) {
  return deleteResident(token, id);
}

// =====================================================================
// DASHBOARD / HOME
// =====================================================================

export async function fetchDashboardData(token, { role, period, tenantId } = {}) {
  if (tenantId) {
    const { fetchTenantDashboardData } = await import('./tenantOperationalService.js');
    return fetchTenantDashboardData(tenantId, { role, period });
  }

  if (IS_DEMO) {
    const mock = await getMockData();
    return {
      report: mock.computeReport(period),
      pendingRegistrationCount: mock.isStaffRole(role) ? mock.getPendingRegistrations().length : 0,
      pendingPaymentCount: mock.isStaffRole(role) ? mock.getPendingPayments().length : 0,
    };
  }

  // Production: fetch real pending counts and report. Header calls this
  // without a period, so always provide a safe current-month default.
  const resolvedPeriod = period || new Date().toISOString().slice(0, 7);
  let pendingRegistrationCount = 0;
  let pendingPaymentCount = 0;
  let report = null;

  try {
    const { isStaffRole, isBendaharaOrAbove } = await import('./dataHelpers.js');
    
    // Fetch pending registrations (for staff)
    if (isStaffRole(role)) {
      try {
        const result = await portalApiPost('/users/pending', { token });
        pendingRegistrationCount = Number(result?.count || 0);
      } catch (err) {
        console.warn('Failed to load pending registrations for dashboard:', err);
      }
    }

    // Fetch pending payments count (for all staff roles: pengurus, bendahara, admin)
    if (isStaffRole(role)) {
      try {
        const payments = await fetchPayments(token);
        pendingPaymentCount = payments.filter((p) => isPendingVerificationStatus(p.status)).length;
        const [yearStr, monthStr] = resolvedPeriod.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (year && month) {
          const res = await fetchMonthlyFinance(token, { year, month });
          report = res?.report || null;
        }
      } catch (err) {
        console.warn('Failed to load monthly finance report for dashboard:', err);
      }
    }
  } catch (err) {
    console.error('Error in fetchDashboardData:', err);
  }

  return {
    report,
    pendingRegistrationCount,
    pendingPaymentCount,
  };
}

// =====================================================================
// UNITS
// =====================================================================

export async function fetchUnits(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockUnits.map((u) => ({
      ...u,
      _occupant: mock.getUnitOccupant(u.id) || null,
    }));
  }
  
  try {
    const [resUnitsData, residents] = await Promise.all([
      portalApiPost('/units/list', { token }),
      fetchResidents(token).catch(() => [])
    ]);
    
    const units = (resUnitsData?.units || []).filter(
      (u) => u.id !== 5 && u.block !== 'Z_DEMO' && !String(u.unit_number || '').includes('DEMO_HIDDEN')
    );
    
    return units.map((u) => {
      // Find occupant from approved residents
      const occupant = residents.find(
        (r) => r.unit_id === u.id && r.is_active
      ) || null;
      
      return {
        ...u,
        _occupant: occupant
      };
    });
  } catch (err) {
    console.error('Failed to fetch units with occupant data:', err);
    try {
      const resUnitsData = await portalApiPost('/units/list', { token });
      return resUnitsData?.units || [];
    } catch {
      return [];
    }
  }
}

export async function fetchUnitOccupant(token, unitId) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getUnitOccupant(unitId);
  }
  try {
    const residents = await fetchResidents(token);
    return residents.find((r) => r.unit_id === Number(unitId) && r.is_active) || null;
  } catch {
    return null;
  }
}

export async function upsertUnit(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const isEdit = !!payload.id;
    if (isEdit) {
      const idx = mock.mockUnits.findIndex((u) => u.id === payload.id);
      if (idx >= 0) {
        Object.assign(mock.mockUnits[idx], payload);
        return { ok: true, data: { unit: mock.mockUnits[idx] } };
      }
    } else {
      const newUnit = {
        ...payload,
        id: Date.now(),
      };
      mock.mockUnits.push(newUnit);
      return { ok: true, data: { unit: newUnit } };
    }
    return { ok: false, error: 'Not found' };
  }
  const data = await portalApiPost('/units/upsert', { token, body: payload });
  return { ok: true, data };
}

// =====================================================================
// RESIDENTS
// =====================================================================

export async function fetchResidents(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockProfiles.filter((p) => p.approval_status === 'approved');
  }
  const data = await portalApiPost('/residents/list', { token });
  return data?.residents || [];
}

export async function createResident(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const newProfile = {
      ...payload,
      id: 'p-' + Date.now(),
      approval_status: 'approved',
      is_active: payload.is_active ?? true,
    };
    mock.mockProfiles.push(newProfile);
    return { ok: true, data: { profile: newProfile } };
  }
  const data = await portalApiPost('/residents/create', { token, body: payload });
  return { ok: true, data };
}

export async function updateResident(token, id, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const idx = mock.mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      Object.assign(mock.mockProfiles[idx], payload);
      return { ok: true, data: { profile: mock.mockProfiles[idx] } };
    }
    return { ok: false, error: 'Not found' };
  }
  const data = await portalApiPost('/residents/update', { token, body: { id, ...payload } });
  return { ok: true, data };
}

export async function deleteResident(token, id) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const idx = mock.mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      mock.mockProfiles.splice(idx, 1);
      return { ok: true };
    }
    return { ok: false, error: 'Not found' };
  }
  await portalApiPost('/residents/delete', { token, body: { id } });
  return { ok: true };
}

export async function importResidentsCSV(token, residents, mode = 'upsert') {
  if (IS_DEMO) {
    const mock = await getMockData();
    if (mode === 'delete-insert') {
      const keepStaff = mock.mockProfiles.filter((p) => p.role !== 'warga');
      mock.mockProfiles.length = 0;
      mock.mockProfiles.push(...keepStaff, ...residents);
    } else {
      for (const m of residents) {
        const idx = mock.mockProfiles.findIndex(
          (p) =>
            (p.email && m.email && p.email.toLowerCase() === m.email.toLowerCase()) ||
            (p.full_name?.toLowerCase() === m.full_name?.toLowerCase() && p.unit_id === m.unit_id)
        );
        if (idx >= 0) {
          Object.assign(mock.mockProfiles[idx], m, { id: mock.mockProfiles[idx].id });
        } else {
          mock.mockProfiles.push(m);
        }
      }
    }
    return { ok: true, data: { imported_count: residents.length } };
  }
  const data = await portalApiPost('/residents/import-csv', { token, body: { residents, mode } });
  return { ok: true, data };
}

// =====================================================================
// SETTINGS
// =====================================================================

export async function fetchSettings(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockSettings;
  }
  try {
    const data = await portalApiPost('/settings/get', { token });
    try {
      const qris = await portalApiPost('/settings/qris/get', { token });
      return {
        ...data,
        ipl_schemas: Array.isArray(data?.ipl_schemas) && data.ipl_schemas.length > 0 ? data.ipl_schemas : DEFAULT_IPL_SCHEMAS,
        qris_enabled: qris?.qris_enabled ?? qris?.enabled ?? data?.qris_enabled ?? true,
        qris_provider: String(qris?.qris_provider || qris?.provider || data?.qris_provider || 'doku').toLowerCase(),
      };
    } catch {
      return {
        ...data,
        ipl_schemas: Array.isArray(data?.ipl_schemas) && data.ipl_schemas.length > 0 ? data.ipl_schemas : DEFAULT_IPL_SCHEMAS,
        qris_enabled: data?.qris_enabled ?? true,
        qris_provider: String(data?.qris_provider || 'doku').toLowerCase(),
      };
    }
  } catch (error) {
    console.warn('Failed to load settings (user may be warga/read-only); using safe defaults.', error);
    return {
      ipl_schemas: DEFAULT_IPL_SCHEMAS,
      qris_enabled: true,
      qris_provider: 'doku',
    };
  }
}

export async function fetchIPLSchemas(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getIPLSchemas();
  }
  try {
    const settings = await fetchSettings(token);
    if (Array.isArray(settings?.ipl_schemas) && settings.ipl_schemas.length > 0) {
      return settings.ipl_schemas;
    }
  } catch (error) {
    console.warn('Failed to load IPL schemas from settings; using default schemas.', error);
  }
  return DEFAULT_IPL_SCHEMAS;
}

export async function updateSettings(token, settingsData) {
  if (IS_DEMO) {
    const mock = await getMockData();
    Object.assign(mock.mockSettings, settingsData);
    return { ok: true };
  }
  const { qris_enabled, qris_provider, ...baseSettings } = settingsData || {};
  const hasBaseSettings = Object.keys(baseSettings).length > 0;
  const hasQrisSettings = qris_enabled !== undefined || qris_provider !== undefined;

  if (hasBaseSettings) {
    await portalApiPost('/settings/update', { token, body: baseSettings });
  }
  if (hasQrisSettings) {
    await portalApiPost('/settings/qris/update', {
      token,
      body: {
        ...(qris_enabled !== undefined ? { qris_enabled: !!qris_enabled } : {}),
        ...(qris_provider !== undefined ? { qris_provider: String(qris_provider).toLowerCase() } : {}),
      },
    });
  }
  return { ok: true };
}

export async function updatePaymentSmokeTestSettings(token, smokeTest) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.mockSettings.smoke_test = {
      ...(mock.mockSettings.smoke_test || {}),
      ...smokeTest,
    };
    return mock.mockSettings.smoke_test;
  }

  await portalApiPost('/settings/update', {
    token,
    body: { smoke_test: smokeTest },
  });
  return smokeTest;
}

export async function runPaymentSmokeTest(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const startedAt = new Date().toISOString();
    const result = {
      status: 'pass',
      source: 'manual',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: 420,
      notification_sent: false,
      checks: [
        { key: 'database', label: 'Database Supabase', status: 'pass', message: 'Konfigurasi dapat dibaca dan status dapat disimpan.' },
        { key: 'drive_upload', label: 'Upload Google Drive', status: 'pass', message: 'File smoke test berhasil diunggah.' },
        { key: 'drive_share', label: 'Izin bukti bayar', status: 'pass', message: 'Izin reader-by-link berhasil diterapkan.' },
        { key: 'drive_cleanup', label: 'Cleanup Google Drive', status: 'pass', message: 'File smoke test dihapus permanen.' },
      ],
    };
    mock.mockSettings.smoke_test = {
      ...(mock.mockSettings.smoke_test || {}),
      last_run: result,
    };
    return result;
  }

  return portalApiPost('/monitoring/payment-smoke/run', { token });
}

export async function generateBills(token, { period, dry_run, tenantId } = {}) {
  if (tenantId) {
    const { generateTenantBillingItems } = await import('./tenantOperationalService');
    return generateTenantBillingItems(tenantId, { period, dry_run });
  }

  if (IS_DEMO) {
    const mock = await getMockData();
    const existing = mock.mockIPLBills.filter(b => b.period === period);
    const mockUnits = mock.mockUnits;
    const schemas = mock.mockSettings.ipl_schemas;
    const due_day = mock.mockSettings.due_day;
    const due_date = `${period}-${String(due_day).padStart(2, '0')}`;
    
    const schemaKomplit = schemas.find(s => s.id === 'schema-komplit') || schemas[0];
    const schemaBasic = schemas.find(s => s.id === 'schema-basic') || schemas[1] || schemas[0];
    
    const preview = [];
    const skipped = [];
    
    mockUnits.forEach(unit => {
      const exists = existing.some(b => b.unit_id === unit.id);
      if (exists) {
        skipped.push({ unit_id: unit.id, block: unit.block, unit_number: unit.unit_number, reason: 'already_exists' });
        return;
      }
      
      const amount = unit.is_occupied ? schemaKomplit.components.reduce((s, c) => s + c.amount, 0) : schemaBasic.components.reduce((s, c) => s + c.amount, 0);
      const recipient = mock.getBillRecipient(unit.id);
      
      preview.push({
        unit_id: unit.id,
        resident_id: recipient?.id || null,
        period,
        amount,
        late_fee: 0,
        due_date,
        status: 'pending',
        notes: `Tagihan IPL Periode ${period}`,
        unit_info: `Blok ${unit.block}/${unit.unit_number}`,
        resident_name: recipient ? recipient.full_name : 'Belum Terdaftar/Kosong',
      });
    });
    
    if (!dry_run) {
      mock.mockIPLBills.push(...preview.map(p => ({ ...p, id: `bill-${Date.now()}-${p.unit_id}` })));
    }
    
    return {
      dry_run,
      period,
      total_preview: preview.length,
      preview,
      skipped_count: skipped.length,
      skipped,
    };
  }
  
  const data = await portalApiPost('/bills/generate', {
    token,
    body: { period, dry_run },
  });
  return data;
}

export async function fetchBillMatrix(token, year, opts = {}) {
  if (opts?.tenantId) {
    const { fetchTenantBillMatrix } = await import('./tenantOperationalService');
    const rows = await fetchTenantBillMatrix(opts.tenantId, year, opts);
    return normalizeBillMatrixRows(rows);
  }

  if (IS_DEMO) {
    const mock = await getMockData();
    return normalizeBillMatrixRows(mock.getBillMatrix(year, opts));
  }
  const body = { year };
  if (opts?.scopeUnitId !== undefined && opts.scopeUnitId !== null) {
    body.scopeUnitId = opts.scopeUnitId;
    body.unit_id = opts.scopeUnitId;
  }
  const data = await portalApiPost('/bills/matrix', { token, body });
  return normalizeBillMatrixRows(data?.matrix || []);
}

function toNumberOrOriginal(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
}

function normalizePaymentRecord(payment) {
  if (!payment) return payment;

  const metadata = parseMetadata(payment.metadata);
  let proofFileUrl =
    payment.proof_file_url ||
    payment.proofFileUrl ||
    payment.proof_url ||
    payment.receipt_file_url ||
    payment.receiptFileUrl ||
    payment.receipt_url ||
    payment.file_url ||
    payment.proof_file_path ||
    payment.proof_path ||
    payment.receipt_file_path ||
    payment.receipt_path ||
    payment.file_path ||
    metadata.proof_file_url ||
    metadata.receipt_file_url ||
    metadata.file_url ||
    metadata.drive_url ||
    metadata.proof_file_path ||
    metadata.proof_url ||
    '';

  let proofFileName =
    payment.proof_file_name ||
    payment.proofFileName ||
    payment.receipt_file_name ||
    payment.receiptFileName ||
    payment.receipt_file ||
    payment.receiptFile ||
    metadata.proof_file_name ||
    metadata.receipt_file_name ||
    '';

  if (!proofFileName && proofFileUrl) {
    const cleanUrl = String(proofFileUrl).split('?')[0];
    const segment = cleanUrl.split('/').pop();
    proofFileName = (segment && segment.includes('.')) ? segment : 'Bukti Transfer';
  }

  if (!proofFileUrl && proofFileName && (proofFileName.startsWith('http://') || proofFileName.startsWith('https://'))) {
    proofFileUrl = proofFileName;
  }

  const method = payment.method || payment.payment_method || payment.paymentMethod || metadata.method || '';
  const provider = String(
    payment.provider ||
    payment.qris_provider ||
    payment.gateway ||
    metadata.provider ||
    metadata.qris_provider ||
    metadata.gateway ||
    ''
  ).trim().toLowerCase();
  const rawStatus =
    payment.status ??
    payment.payment_status ??
    payment.paymentStatus ??
    payment.state ??
    metadata.status ??
    '';

  return {
    ...payment,
    ipl_bill_id:
      payment.ipl_bill_id ||
      payment.iplBillId ||
      payment.ipl_bill ||
      payment.bill_id ||
      payment.billId ||
      payment._bill?.id ||
      '',
    resident_id:
      payment.resident_id ||
      payment.residentId ||
      payment.resident ||
      payment._profile?.id ||
      '',
    unit_id:
      payment.unit_id ||
      payment.unitId ||
      payment._bill?.unit_id ||
      payment.ipl_bills?.unit_id ||
      '',
    period: payment.period || payment._bill?.period || payment.ipl_bills?.period || '',
    method,
    provider,
    status: normalizePaymentStatus(rawStatus, {
      method,
      hasProof: Boolean(proofFileUrl || proofFileName),
    }),
    paid_at:
      payment.paid_at ||
      payment.paidAt ||
      payment.completed_at ||
      payment.completedAt ||
      payment.verified_at ||
      payment.verifiedAt ||
      metadata.paid_at ||
      metadata.completed_at ||
      metadata.verified_at ||
      payment.created_at ||
      payment.updated_at ||
      '',
    metadata,
    proof_file_id:
      payment.proof_file_id ||
      payment.proofFileId ||
      payment.receipt_file_id ||
      payment.receiptFileId ||
      metadata.proof_file_id ||
      metadata.receipt_file_id ||
      '',
    proof_file_url: proofFileUrl,
    proof_file_name: proofFileName,
    receipt_file: payment.receipt_file || payment.receiptFile || proofFileName,
  };
}

const PAYMENT_STATUS_PRIORITY = {
  completed: 60,
  pending_verification: 50,
  pending: 40,
  draft: 30,
  rejected: 20,
  failed: 10,
  expired: 10,
  cancelled: 10,
  refunded: 10,
};

function paymentCreatedTimestamp(payment) {
  const value =
    payment?.created_at ||
    payment?.createdAt ||
    payment?.updated_at ||
    payment?.updatedAt ||
    '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function linkedPaymentId(payment) {
  return (
    payment?._bill?.payment_id ||
    payment?.ipl_bills?.payment_id ||
    payment?.bill?.payment_id ||
    null
  );
}

function comparePaymentPreference(left, right, preferredPaymentId = null) {
  const preferredId = preferredPaymentId ? String(preferredPaymentId) : '';
  const leftId = String(left?.id || '');
  const rightId = String(right?.id || '');

  const leftExplicit = preferredId && leftId === preferredId ? 1 : 0;
  const rightExplicit = preferredId && rightId === preferredId ? 1 : 0;
  if (leftExplicit !== rightExplicit) return rightExplicit - leftExplicit;

  const leftLinked = linkedPaymentId(left) && String(linkedPaymentId(left)) === leftId ? 1 : 0;
  const rightLinked = linkedPaymentId(right) && String(linkedPaymentId(right)) === rightId ? 1 : 0;
  if (leftLinked !== rightLinked) return rightLinked - leftLinked;

  const leftPriority = PAYMENT_STATUS_PRIORITY[left?.status] || 0;
  const rightPriority = PAYMENT_STATUS_PRIORITY[right?.status] || 0;
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;

  return paymentCreatedTimestamp(right) - paymentCreatedTimestamp(left);
}

export function selectPreferredPayment(records, preferredPaymentId = null) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return records
    .filter(Boolean)
    .map((payment) => normalizePaymentRecord(payment))
    .sort((left, right) => comparePaymentPreference(left, right, preferredPaymentId))[0] || null;
}

function extractPaymentList(result) {
  const candidates = [
    result,
    result?.payments,
    result?.items,
    result?.rows,
    result?.results,
    result?.data,
    result?.data?.payments,
    result?.data?.items,
    result?.data?.rows,
  ];
  return candidates.find((candidate) => Array.isArray(candidate)) || [];
}

const unitCollator = new Intl.Collator('id-ID', {
  numeric: true,
  sensitivity: 'base',
});

function normalizeBillMatrixRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const unit = {
        ...(row?.unit || {}),
        id: toNumberOrOriginal(row?.unit?.id),
        is_occupied: row?.unit?.is_occupied === false ? false : true,
        occupancy_status:
          row?.unit?.occupancy_status ||
          row?.resident?.occupancy_status ||
          (row?.unit?.is_occupied === false ? 'owner_vacant' : 'unknown'),
      };

      const resident = row?.resident
        ? {
            ...row.resident,
            unit_id:
              row.resident.unit_id !== undefined
                ? toNumberOrOriginal(row.resident.unit_id)
                : unit.id,
            occupancy_status: row.resident.occupancy_status || unit.occupancy_status,
          }
        : null;

      const residents = (Array.isArray(row?.residents) ? row.residents : resident ? [resident] : [])
        .filter((profile) => profile?.id || profile?.full_name)
        .map((profile) => ({
          ...profile,
          unit_id:
            profile.unit_id !== undefined
              ? toNumberOrOriginal(profile.unit_id)
              : unit.id,
          occupancy_status: profile.occupancy_status || unit.occupancy_status,
        }));

      const rawCells = Array.isArray(row?.cells) ? row.cells : [];
      const cells = rawCells.map((cell) => {
        if (!cell || !cell.bill) return cell;

        const bill = {
          ...cell.bill,
          unit_id: toNumberOrOriginal(cell.bill.unit_id ?? unit.id),
          amount: Number(cell.bill.amount || 0),
          late_fee: Number(cell.bill.late_fee || 0),
        };

        return {
          ...cell,
          status: cell.status || bill.status,
          bill,
          payment: normalizePaymentRecord(cell.payment),
        };
      });

      return { ...row, unit, resident: resident || residents[0] || null, residents, cells };
    })
    .sort((a, b) => {
      const blockCompare = unitCollator.compare(
        String(a.unit?.block || ''),
        String(b.unit?.block || '')
      );
      if (blockCompare !== 0) return blockCompare;

      const unitCompare = unitCollator.compare(
        String(a.unit?.unit_number || ''),
        String(b.unit?.unit_number || '')
      );
      if (unitCompare !== 0) return unitCompare;

      return Number(a.unit?.id || 0) - Number(b.unit?.id || 0);
    });
}

// =====================================================================
// PAYMENTS
// =====================================================================

export async function submitManualPayment(token, { bill_id, method, amount, file, proof_file, note, paid_at, tenantId, memberId } = {}) {
  if (tenantId) {
    const { submitTenantPayment } = await import('./tenantOperationalService');
    return submitTenantPayment(tenantId, {
      billId: bill_id,
      method: method || 'bank_transfer',
      amount,
      proofFile: file || proof_file,
      note,
      paidAt: paid_at,
      memberId,
      isStaff: false,
    });
  }

  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.recordResidentPayment([bill_id], { method, receiptFile: file || proof_file, note });
  }
  
  if (file) {
    return portalApiUpload('/payments/manual/submit', {
      token,
      file,
      fields: { bill_id, method, amount, note, paid_at }
    });
  } else {
    return portalApiPost('/payments/manual/submit', {
      token,
      body: { bill_id, method, amount, proof_file, note, paid_at }
    });
  }
}

export async function createCashPayment(token, { bill_id, amount, file, note, paid_at, recorderRole, tenantId, memberId, verifiedBy } = {}) {
  if (tenantId) {
    const { submitTenantPayment } = await import('./tenantOperationalService');
    return submitTenantPayment(tenantId, {
      billId: bill_id,
      method: 'cash',
      amount,
      proofFile: file,
      note,
      paidAt: paid_at,
      memberId,
      isStaff: true,
      verifiedBy,
    });
  }

  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.recordManualPayment(bill_id, {
      method: 'cash',
      paidAt: paid_at,
      note,
      receiptFile: file,
      recorderRole,
      amount,
    });
  }
  
  if (file) {
    return portalApiUpload('/payments/cash/create', {
      token,
      file,
      fields: { bill_id, amount, note, paid_at }
    });
  } else {
    return portalApiPost('/payments/cash/create', {
      token,
      body: { bill_id, amount, note, paid_at }
    });
  }
}

export async function approveManualPayment(token, { payment_id, note, tenantId, verifiedBy } = {}) {
  if (tenantId) {
    const { verifyTenantPayment } = await import('./tenantOperationalService');
    return verifyTenantPayment(tenantId, payment_id, { verifiedBy, note });
  }
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.verifyPayment(payment_id, { verifiedBy: verifiedBy || 'Demo Staff', note });
  }
  return portalApiPost('/payments/manual/approve', {
    token,
    body: { payment_id, note }
  });
}

export async function rejectManualPayment(token, { payment_id, note, tenantId, rejectedBy } = {}) {
  if (tenantId) {
    const { rejectTenantPayment } = await import('./tenantOperationalService');
    return rejectTenantPayment(tenantId, payment_id, { rejectedBy, reason: note });
  }
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.rejectPayment(payment_id, { rejectedBy: rejectedBy || 'Demo Staff', reason: note });
  }
  return portalApiPost('/payments/manual/reject', {
    token,
    body: { payment_id, note }
  });
}

export async function updatePayment(token, { payment_id, unit_id, amount, method, paid_at, note, file, status, tenantId } = {}) {
  if (tenantId) {
    const { updateTenantPayment } = await import('./tenantOperationalService');
    return updateTenantPayment(tenantId, payment_id, { unit_id, amount, method, paid_at, note });
  }
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.updatePayment(payment_id, { unit_id, amount, method, paid_at, note, file, status });
  }

  const fields = { payment_id, amount, method, paid_at, note };
  if (unit_id !== undefined && unit_id !== null && unit_id !== '') {
    fields.unit_id = unit_id;
  }
  if (status) {
    fields.status = status;
  }

  if (file) {
    return portalApiUpload('/payments/update', {
      token,
      file,
      fields,
    });
  }
  return portalApiPost('/payments/update', {
    token,
    body: fields,
  });
}

export async function fetchPayments(token, opts = {}) {
  if (opts?.tenantId) {
    const { fetchTenantPayments } = await import('./tenantOperationalService');
    return fetchTenantPayments(opts.tenantId, opts);
  }

  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockPayments;
  }

  let rawPayments = [];
  try {
    const body = {};
    if (opts?.scopeUnitId !== undefined && opts.scopeUnitId !== null) {
      body.scopeUnitId = opts.scopeUnitId;
      body.unit_id = opts.scopeUnitId;
    }
    const result = await portalApiPost('/payments/list', { token, body });
    rawPayments = extractPaymentList(result);
  } catch (err) {
    rawPayments = [];
  }

  // Fallback direct Supabase query if API returned empty
  if (!Array.isArray(rawPayments) || rawPayments.length === 0) {
    try {
      let query = supabase.from('payments').select('*, ipl_bills(*), profiles(*)');
      if (opts?.scopeUnitId) {
        query = query.eq('ipl_bills.unit_id', opts.scopeUnitId);
      }
      const { data: supaPayments } = await query;
      if (Array.isArray(supaPayments) && supaPayments.length > 0) {
        rawPayments = supaPayments;
      }
    } catch {
      // ignore fallback error
    }
  }

  return (rawPayments || []).map(p => ({
    ...normalizePaymentRecord(p),
    _bill: p.ipl_bills || p.bill || p._bill,
    _profile: p.profiles || p.profile || p._profile,
  })).sort((left, right) => comparePaymentPreference(left, right));
}

export async function fetchPaymentByBillId(token, billId, billContext = {}) {
  if (!billId && !billContext?.period) return null;
  if (IS_DEMO) {
    const mock = await getMockData();
    const p = mock.mockPayments.find(item =>
      (billId && String(item.ipl_bill_id) === String(billId)) ||
      (billContext?.period && item._bill?.period === billContext.period && String(item._bill?.unit_id) === String(billContext.unit_id))
    );
    return p ? normalizePaymentRecord(p) : null;
  }

  // Strategy 1: /payments/list with bill_id directly
  if (billId) {
    try {
      const result = await portalApiPost('/payments/list', {
        token,
        body: { bill_id: billId, ipl_bill_id: billId },
      });
      const list = extractPaymentList(result);
      const matches = list.filter(p =>
        String(p.ipl_bill_id) === String(billId) ||
        String(p.bill_id) === String(billId)
      );
      const found = selectPreferredPayment(matches, billContext.payment_id);
      if (found) return normalizePaymentRecord(found);
    } catch { /* try next */ }
  }

  // Strategy 2: /payments/list with scopeUnitId
  if (billContext.unit_id) {
    try {
      const result = await portalApiPost('/payments/list', {
        token,
        body: { scopeUnitId: billContext.unit_id, unit_id: billContext.unit_id },
      });
      const list = extractPaymentList(result);
      const matches = list.filter(p =>
        (billId && (String(p.ipl_bill_id) === String(billId) || String(p.bill_id) === String(billId))) ||
        (billContext.period && p._bill?.period === billContext.period)
      );
      const found = selectPreferredPayment(matches, billContext.payment_id);
      if (found) return normalizePaymentRecord(found);
    } catch { /* try next */ }
  }

  // Strategy 3: /payments/list with period
  if (billContext.period && billContext.unit_id) {
    try {
      const result = await portalApiPost('/payments/list', {
        token,
        body: { period: billContext.period, unit_id: billContext.unit_id },
      });
      const list = extractPaymentList(result);
      const found = selectPreferredPayment(list, billContext.payment_id);
      if (found) return found;
    } catch { /* try next */ }
  }

  // Strategy 4: Direct Supabase with Bearer token (app_jwt as Authorization header)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co';
  const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY;

  const authedClient = (token && supabaseUrl && supabaseBrowserKey)
    ? createClient(supabaseUrl, supabaseBrowserKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    : supabase;

  if (billId) {
    try {
      const { data: supaPayments } = await authedClient
        .from('payments')
        .select('*, ipl_bills(*), profiles(*)')
        .eq('ipl_bill_id', billId)
        .order('created_at', { ascending: false });

      const supaPayment = selectPreferredPayment(supaPayments, billContext.payment_id);
      if (supaPayment) {
        return normalizePaymentRecord({
          ...supaPayment,
          _bill: supaPayment.ipl_bills,
          _profile: supaPayment.profiles,
        });
      }
    } catch {}
  }

  if (billContext.unit_id && billContext.period) {
    try {
      const { data: supaPayments } = await authedClient
        .from('payments')
        .select('*, ipl_bills!inner(*), profiles(*)')
        .eq('ipl_bills.unit_id', billContext.unit_id)
        .eq('ipl_bills.period', billContext.period);

      if (Array.isArray(supaPayments) && supaPayments.length > 0) {
        const supaPayment = selectPreferredPayment(supaPayments, billContext.payment_id);
        return normalizePaymentRecord({
          ...supaPayment,
          _bill: supaPayment.ipl_bills,
          _profile: supaPayment.profiles,
        });
      }
    } catch {}
  }

  return null;
}


function normalizeQrisProvider(provider) {
  const value = String(provider || import.meta.env.VITE_QRIS_DEFAULT_PROVIDER || 'doku').trim().toLowerCase();
  return value === 'midtrans' ? 'midtrans' : 'doku';
}

function qrisRoute(provider, suffix) {
  if (normalizeQrisProvider(provider) === 'doku') {
    if (suffix === 'status') {
      return '/payments/qris/doku/inquiry';
    }
    return `/payments/qris/doku/${suffix}`;
  }
  return `/payments/qris/${suffix}`;
}

// Create one QRIS checkout. Ownership and amount are resolved by the API.
export async function createQrisPayment(token, { bill_ids, provider } = {}) {
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) {
    throw new Error('Pilih minimal satu tagihan untuk dibayar via QRIS.');
  }
  const normalizedProvider = normalizeQrisProvider(provider);

  if (IS_DEMO) {
    return {
      token: null,
      redirect_url: null,
      provider: normalizedProvider,
      provider_label: getQrisProviderLabel(normalizedProvider),
      parent_order_id: `DEMO-QRIS-${Date.now()}`,
      base_amount: 0,
      qris_fee_amount: 0,
      qris_fee_rate: 0.007,
      total_amount: 0,
      bills: bill_ids.map((id) => ({ id })),
      demo: true,
    };
  }

  const data = await portalApiPost(qrisRoute(normalizedProvider, 'create'), {
    token,
    body: { bill_ids, provider: normalizedProvider },
  });

  const resolvedProvider = normalizeQrisProvider(data?.provider || normalizedProvider);
  const totalAmount = Number(data?.total_amount ?? data?.total ?? 0);
  const baseAmount = Number(data?.base_amount ?? (data?.qris_fee_amount ? totalAmount - Number(data?.qris_fee_amount) : Math.round(totalAmount / 1.007)));
  const feeAmount = Number(data?.qris_fee_amount ?? (totalAmount - baseAmount));

  return {
    ...data,
    provider: resolvedProvider,
    provider_label: data?.provider_label || getQrisProviderLabel(resolvedProvider),
    base_amount: baseAmount,
    qris_fee_amount: feeAmount,
    qris_fee_rate: 0.007,
    total_amount: totalAmount,
    bills: Array.isArray(data?.bills) ? data.bills : [],
  };
}

// Create one QRIS checkout for Non-IPL / Donasi / Kegiatan.
export async function createNonIplQrisPayment(token, { amount, base_amount, qris_fee_amount, description, category, provider } = {}) {
  const base = Number(base_amount || amount || 0);
  if (!base || base <= 0) {
    throw new Error('Nominal pembayaran harus lebih dari 0.');
  }
  const fee = Number(qris_fee_amount || Math.ceil(base * 0.007));
  const total = base + fee;
  const normalizedProvider = normalizeQrisProvider(provider || 'doku');

  if (IS_DEMO) {
    return {
      provider: normalizedProvider,
      provider_label: getQrisProviderLabel(normalizedProvider),
      parent_order_id: `DEMO-NONIPL-${Date.now()}`,
      base_amount: base,
      qris_fee_amount: fee,
      qris_fee_rate: 0.007,
      total_amount: total,
      qr_content: `00020101021226550012COM.DOKU.WWW011893600899000010181002061018100303UKE51440014ID.CO.QRIS.WWW0215ID10265631295470303UKE5204864153033605407${total.toFixed(2)}5802ID5921Palm Village - Social6005BOGOR61051691462440703A015033DEMO-NONIPL-${Date.now()}6304ABCD`,
      demo: true,
    };
  }

  const data = await portalApiPost(qrisRoute(normalizedProvider, 'create'), {
    token,
    body: {
      amount: base,
      base_amount: base,
      description: description || category || 'Non-IPL Palm Village',
      category,
      provider: normalizedProvider
    },
  });

  const resolvedProvider = normalizeQrisProvider(data?.provider || normalizedProvider);
  const totalAmount = Number(data?.total_amount ?? total);
  const resolvedBase = Number(data?.base_amount ?? base);
  const resolvedFee = Number(data?.qris_fee_amount ?? (totalAmount - resolvedBase));

  return {
    ...data,
    provider: resolvedProvider,
    provider_label: data?.provider_label || getQrisProviderLabel(resolvedProvider),
    base_amount: resolvedBase,
    qris_fee_amount: resolvedFee,
    qris_fee_rate: 0.007,
    total_amount: totalAmount,
    qr_content: data?.qr_content || data?.raw?.qrContent || '',
    parent_order_id: data?.parent_order_id || data?.order_id || '',
    doku_reference_no: data?.doku_reference_no || data?.raw?.referenceNo || '',
  };
}

// Reconcile the checkout against the active QRIS provider on the server. The
// frontend never decides that a QRIS payment is completed by itself.
export async function verifyQrisPayment(token, { parent_order_id, provider } = {}) {
  const parentOrderId = String(parent_order_id || '').trim();
  if (!parentOrderId) {
    throw new Error('Order ID pembayaran QRIS tidak tersedia.');
  }
  const normalizedProvider = normalizeQrisProvider(provider);

  if (IS_DEMO) {
    return {
      parent_order_id: parentOrderId,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      payment_type: 'qris',
      provider: normalizedProvider,
    };
  }

  return portalApiPost(qrisRoute(normalizedProvider, 'status'), {
    token,
    body: { parent_order_id: parentOrderId, provider: normalizedProvider },
  });
}

function isEmptyOkResponse(error) {
  return error instanceof PortalApiError
    && error.code === 'INVALID_API_RESPONSE'
    && error.status === 200;
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isSupabaseJwt(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.iss === 'string' && payload.iss.includes('.supabase.co/auth/v1');
}

function getAuthedSupabaseClient(token) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co';
  const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseBrowserKey) return supabase;
  return createClient(supabaseUrl, supabaseBrowserKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

function monthKeyFromDate(value) {
  if (!value) return '';
  return String(value).slice(0, 7);
}

function billTotal(bill) {
  return Number(bill?.amount || 0) + Number(bill?.late_fee || 0);
}

function mapBillDetail(bill, profileMap = {}, unitProfilesMap = {}) {
  const payment = Array.isArray(bill.payments)
    ? bill.payments.find((item) => item.status === 'completed') || bill.payments[0]
    : null;
  const unitId = bill.unit_id;
  const unit = bill.units || {};
  const residentName =
    bill.profiles?.full_name ||
    (unitId && unitProfilesMap[unitId] && unitProfilesMap[unitId].length > 0 ? unitProfilesMap[unitId].join(' / ') : '') ||
    (unit.owner_id && profileMap[unit.owner_id] ? profileMap[unit.owner_id].full_name : '') ||
    '-';
  return {
    billId: bill.id,
    unit_id: bill.unit_id,
    unitNumber: unit.unit_number || '-',
    block: unit.block || '-',
    residentName: residentName !== '-' ? residentName : '— Belum Ada Penghuni —',
    amount: billTotal(bill),
    status: bill.status,
    paidAt: payment?.paid_at || null,
  };
}

function mapCashPayment(payment, profileMap = {}, unitProfilesMap = {}) {
  const bill = payment.ipl_bills || {};
  const unit = bill.units || {};
  const unitId = bill.unit_id;
  let metadata = payment.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch (e) { metadata = {}; }
  }
  const metaName = metadata.customerName || metadata.customer || metadata.payer_name || metadata.payer || metadata.recorded_by;
  const residentName =
    payment.profiles?.full_name ||
    (unitId && unitProfilesMap[unitId] && unitProfilesMap[unitId].length > 0 ? unitProfilesMap[unitId].join(' / ') : '') ||
    (unit.owner_id && profileMap[unit.owner_id] ? profileMap[unit.owner_id].full_name : '') ||
    (metaName && typeof metaName === 'string' && metaName.trim() ? metaName.trim() : '') ||
    '-';
  return {
    paymentId: payment.id,
    paidAt: payment.paid_at,
    amount: Number(payment.amount || 0),
    method: payment.method,
    unitId: bill.unit_id || null,
    block: unit.block || '-',
    unitNumber: unit.unit_number || '-',
    residentName,
    period: bill.period || '-',
    recordedBy: payment.recorded_by || metadata.recorded_by || metadata.payer || null,
  };
}

async function fetchMonthlyFinanceFromSupabase(token, { year, month }) {
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const { start, end } = monthRange(year, month);
  const client = getAuthedSupabaseClient(token);

  const [billsRes, paymentsRes, expensesRes, profilesRes, unitsRes] = await Promise.all([
    client
      .from('ipl_bills')
      .select('*, units(id, block, unit_number, owner_id), profiles!ipl_bills_resident_id_fkey(full_name), payments!payments_ipl_bill_id_fkey(id, status, paid_at)')
      .eq('period', period),
    client
      .from('payments')
      .select('*, ipl_bills!payments_ipl_bill_id_fkey(period, unit_id, units(id, block, unit_number, owner_id)), profiles!payments_resident_id_fkey(full_name)')
      .eq('status', 'completed')
      .gte('paid_at', `${start}T00:00:00+07:00`)
      .lt('paid_at', `${end}T00:00:00+07:00`)
      .order('paid_at', { ascending: false }),
    client
      .from('expenses')
      .select('*')
      .gte('expense_date', start)
      .lt('expense_date', end)
      .is('deleted_at', null)
      .order('expense_date', { ascending: true }),
    client
      .from('profiles')
      .select('id, full_name, unit_id, role')
      .is('deleted_at', null),
    client
      .from('units')
      .select('id, block, unit_number, owner_id'),
  ]);

  const error = billsRes.error || paymentsRes.error || expensesRes.error;
  if (error) throw error;

  const isDemoUnit = (u) => !u || u.id === 5 || u.block === 'Z_DEMO' || String(u.block || '').includes('DEMO') || String(u.unit_number || '').includes('DEMO_HIDDEN');
  const validUnits = (unitsRes.data || []).filter((u) => !isDemoUnit(u));
  const validUnitIds = new Set(validUnits.map((u) => u.id));

  const allProfiles = (profilesRes.data || []).filter((p) => p.role !== 'admin_viewer');
  const profileMap = Object.fromEntries(allProfiles.map((p) => [p.id, p]));
  const unitProfilesMap = {};
  allProfiles.forEach((p) => {
    if (p.unit_id && p.full_name && validUnitIds.has(p.unit_id)) {
      if (!unitProfilesMap[p.unit_id]) {
        unitProfilesMap[p.unit_id] = [];
      }
      unitProfilesMap[p.unit_id].push(p.full_name.trim());
    }
  });

  const bills = (billsRes.data || []).filter((bill) => validUnitIds.has(bill.unit_id));
  const paidBills = bills.filter((bill) => bill.status === 'paid');
  const totalBilled = bills.reduce((sum, bill) => sum + billTotal(bill), 0);
  const totalCollected = paidBills.reduce((sum, bill) => sum + billTotal(bill), 0);
  const byBlockMap = {};

  bills.forEach((bill) => {
    const block = bill.units?.block || '-';
    if (!byBlockMap[block]) {
      byBlockMap[block] = { block, billed: 0, collected: 0, count: 0, paid: 0 };
    }
    byBlockMap[block].billed += billTotal(bill);
    byBlockMap[block].count += 1;
    if (bill.status === 'paid') {
      byBlockMap[block].collected += billTotal(bill);
      byBlockMap[block].paid += 1;
    }
  });

  const report = {
    period,
    billCount: bills.length,
    paidCount: paidBills.length,
    totalBilled,
    totalCollected,
    totalOutstanding: totalBilled - totalCollected,
    collectionRate: totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0,
    byBlock: Object.values(byBlockMap).sort((a, b) => String(a.block).localeCompare(String(b.block), 'id-ID', { numeric: true })),
    details: bills.map((b) => mapBillDetail(b, profileMap, unitProfilesMap)).sort((a, b) => {
      const blockCompare = String(a.block || '').localeCompare(String(b.block || ''), 'id-ID', { numeric: true });
      if (blockCompare !== 0) return blockCompare;
      return String(a.unitNumber || '').localeCompare(String(b.unitNumber || ''), 'id-ID', { numeric: true });
    }),
  };

  return {
    report,
    expenses: (expensesRes.data || []).map((expense) => ({
      ...expense,
      date: expense.expense_date,
      amount: Number(expense.amount || 0),
    })),
    cashPayments: (paymentsRes.data || [])
      .filter((p) => {
        const bill = p.ipl_bills || {};
        return validUnitIds.has(bill.unit_id);
      })
      .map((p) => mapCashPayment(p, profileMap, unitProfilesMap)),
  };
}

async function fetchRunningBalanceFromSupabase(token, { year, month }) {
  const client = getAuthedSupabaseClient(token);
  const startYear = 2026;
  const startMonth = 7;
  const { end } = monthRange(year, month);
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;

  const [paymentsRes, expensesRes] = await Promise.all([
    client
      .from('payments')
      .select('id, amount, paid_at')
      .eq('status', 'completed')
      .gte('paid_at', `${start}T00:00:00+07:00`)
      .lt('paid_at', `${end}T00:00:00+07:00`),
    client
      .from('expenses')
      .select('id, amount, expense_date')
      .gte('expense_date', start)
      .lt('expense_date', end)
      .is('deleted_at', null),
  ]);

  const error = paymentsRes.error || expensesRes.error;
  if (error) throw error;

  const paymentsByMonth = {};
  (paymentsRes.data || []).forEach((payment) => {
    const key = monthKeyFromDate(payment.paid_at);
    if (!paymentsByMonth[key]) paymentsByMonth[key] = { total: 0, count: 0 };
    paymentsByMonth[key].total += Number(payment.amount || 0);
    paymentsByMonth[key].count += 1;
  });

  const expensesByMonth = {};
  (expensesRes.data || []).forEach((expense) => {
    const key = monthKeyFromDate(expense.expense_date);
    if (!expensesByMonth[key]) expensesByMonth[key] = { total: 0, count: 0 };
    expensesByMonth[key].total += Number(expense.amount || 0);
    expensesByMonth[key].count += 1;
  });

  const chain = [];
  let openingBalance = 15000000;
  let cursorYear = startYear;
  let cursorMonth = startMonth;

  while (cursorYear < year || (cursorYear === year && cursorMonth <= month)) {
    const period = `${cursorYear}-${String(cursorMonth).padStart(2, '0')}`;
    const income = paymentsByMonth[period] || { total: 0, count: 0 };
    const expense = expensesByMonth[period] || { total: 0, count: 0 };
    const closingBalance = openingBalance + income.total - expense.total;
    chain.push({
      period,
      year: cursorYear,
      month: cursorMonth,
      openingBalance,
      totalIncome: income.total,
      totalExpense: expense.total,
      closingBalance,
      incomeCount: income.count,
      expenseCount: expense.count,
    });
    openingBalance = closingBalance;
    cursorMonth += 1;
    if (cursorMonth > 12) {
      cursorMonth = 1;
      cursorYear += 1;
    }
  }

  return { chain };
}

export async function fetchRunningBalance(token, { year, month, tenantId } = {}) {
  if (tenantId) {
    const { fetchTenantRunningBalance } = await import('./tenantOperationalService');
    return fetchTenantRunningBalance(tenantId, { year, month });
  }
  if (IS_DEMO) {
    const mock = await getMockData();
    return { chain: mock.computeRunningBalance(year, month) };
  }
  try {
    return await portalApiPost('/reports/running-balance', {
      token,
      body: { year, month }
    });
  } catch (error) {
    if (isEmptyOkResponse(error)) {
      if (!isSupabaseJwt(token)) {
        throw new PortalApiError('API saldo berjalan mengembalikan response kosong. Token portal tidak dapat dipakai langsung ke Supabase.', {
          code: 'REPORT_API_EMPTY_RESPONSE',
        });
      }
      console.warn('Running balance API returned an empty 200 response; falling back to Supabase.');
      return fetchRunningBalanceFromSupabase(token, { year, month });
    }
    throw error;
  }
}

export async function fetchMonthlyFinance(token, { year, month, tenantId } = {}) {
  if (tenantId) {
    const { fetchTenantMonthlyFinance } = await import('./tenantOperationalService');
    return fetchTenantMonthlyFinance(tenantId, { year, month });
  }
  if (IS_DEMO) {
    const mock = await getMockData();
    const period = `${year}-${String(month).padStart(2, '0')}`;
    return {
      report: mock.computeReport(period),
      expenses: mock.getExpensesForPeriod(period),
      cashPayments: mock.getPaymentsByMonth(year, month)
    };
  }
  try {
    return await portalApiPost('/reports/monthly-finance', {
      token,
      body: { year, month }
    });
  } catch (error) {
    if (isEmptyOkResponse(error)) {
      if (!isSupabaseJwt(token)) {
        throw new PortalApiError('API laporan keuangan mengembalikan response kosong. Token portal tidak dapat dipakai langsung ke Supabase.', {
          code: 'REPORT_API_EMPTY_RESPONSE',
        });
      }
      console.warn('Monthly finance API returned an empty 200 response; falling back to Supabase.');
      try {
        return await fetchMonthlyFinanceFromSupabase(token, { year, month });
      } catch (fallbackError) {
        console.warn('Monthly finance Supabase fallback failed:', fallbackError);
        throw new PortalApiError('API laporan kosong dan fallback Supabase gagal memuat data laporan.', {
          code: 'REPORT_FALLBACK_FAILED',
          details: fallbackError,
        });
      }
    }
    throw error;
  }
}

// =====================================================================
// EVENTS & EVENT FINANCE
// =====================================================================

export async function fetchEvents(token, { role, profileId, includeDeleted = false } = {}) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.listDemoEvents({ role, profileId, includeDeleted });
  }
  try {
    const result = await portalApiPost('/events/list', {
      token,
      body: { include_deleted: includeDeleted },
    });
    return result?.events || [];
  } catch (error) {
    // Some deployed n8n list workflows return an empty webhook body with
    // HTTP 200 when there are no rows. Treat that as an empty event list;
    // authentication, network, and non-200 API errors must still surface.
    if (error instanceof PortalApiError && error.code === 'INVALID_API_RESPONSE' && error.status === 200) {
      console.warn('Events API returned an empty 200 response; treating it as an empty list.');
      return [];
    }
    throw error;
  }
}

export async function fetchEventDetail(token, eventId) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.getDemoEvent(eventId);
  }
  const result = await portalApiPost('/events/detail', {
    token,
    body: { event_id: eventId },
  });
  return result?.event || result;
}

export async function createEvent(token, payload) {
  if (IS_DEMO) {
    // Demo mode remains read-only for the event fixture; production is the
    // source of truth for event creation and assignment changes.
    return { ...payload, id: `demo-event-${Date.now()}` };
  }
  const result = await portalApiPost('/events/create', { token, body: payload });
  return result?.event || result;
}

export async function updateEvent(token, eventId, payload) {
  if (IS_DEMO) return { id: eventId, ...payload };
  const result = await portalApiPost('/events/update', {
    token,
    body: { event_id: eventId, ...payload },
  });
  return result?.event || result;
}

export async function deleteEvent(token, eventId) {
  if (IS_DEMO) return { id: eventId, deleted_at: new Date().toISOString() };
  return portalApiPost('/events/delete', {
    token,
    body: { event_id: eventId },
  });
}

export async function fetchEventMembers(token, eventId) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.getDemoMembers(eventId);
  }
  const result = await portalApiPost('/events/members/list', {
    token,
    body: { event_id: eventId },
  });
  return result?.members || [];
}

export async function assignEventMember(token, payload) {
  if (IS_DEMO) return { ...payload, id: `demo-member-${Date.now()}` };
  const result = await portalApiPost('/events/members/assign', { token, body: payload });
  return result?.member || result;
}

export async function revokeEventMember(token, assignmentId, note = '') {
  if (IS_DEMO) return { id: assignmentId, revoked_at: new Date().toISOString() };
  return portalApiPost('/events/members/revoke', {
    token,
    body: { assignment_id: assignmentId, note },
  });
}

export async function fetchMyEventAccess(token, { profileId, role } = {}) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.getDemoAccess({ profileId, role });
  }
  try {
    return await portalApiPost('/events/my-access', { token, body: {} });
  } catch (error) {
    // Keep the events page usable when the legacy access workflow responds
    // with an empty HTTP 200 body for a user with no assignments.
    if (error instanceof PortalApiError && error.code === 'INVALID_API_RESPONSE' && error.status === 200) {
      console.warn('Event access API returned an empty 200 response; treating it as no access.');
      return { global: {}, events: [] };
    }
    throw error;
  }
}

export async function fetchNonIplIncomes(token, filters = {}) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.listDemoIncomes(filters);
  }
  const result = await portalApiPost('/incomes/list', { token, body: filters });
  return result?.incomes || [];
}

export async function createNonIplIncome(token, { file, ...payload }) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.createDemoIncome({ ...payload, receipt_file_name: file?.name || null });
  }
  if (file) {
    return portalApiUpload('/incomes/create', {
      token,
      file,
      fields: payload,
    });
  }
  return portalApiPost('/incomes/create', { token, body: payload });
}

export async function updateNonIplIncome(token, incomeId, { file, ...payload }) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.updateDemoIncome(incomeId, { ...payload, receipt_file_name: file?.name || undefined });
  }
  if (file) {
    return portalApiUpload('/incomes/update', {
      token,
      file,
      fields: { income_id: incomeId, ...payload },
    });
  }
  return portalApiPost('/incomes/update', {
    token,
    body: { income_id: incomeId, ...payload },
  });
}

export async function approveNonIplIncome(token, { income_id, note = '' }) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.approveDemoIncome(income_id, { verifiedBy: 'Staff / Pengurus', note });
  }
  return portalApiPost('/incomes/update', {
    token,
    body: {
      income_id,
      status: 'verified',
      verification_note: note,
    },
  });
}

export async function rejectNonIplIncome(token, { income_id, reason = '' }) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.rejectDemoIncome(income_id, { rejectedBy: 'Staff / Pengurus', reason });
  }
  return portalApiPost('/incomes/update', {
    token,
    body: {
      income_id,
      status: 'rejected',
      rejection_reason: reason,
    },
  });
}

export async function deleteNonIplIncome(token, incomeId) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.deleteDemoIncome(incomeId);
  }
  return portalApiPost('/incomes/delete', {
    token,
    body: { income_id: incomeId },
  });
}

export async function fetchEventFinanceReport(token, { eventId, from, to, category } = {}) {
  if (IS_DEMO) {
    const mock = await getEventMockData();
    return mock.getDemoEventReport(eventId);
  }
  const result = await portalApiPost('/reports/event-finance', {
    token,
    body: { event_id: eventId, from, to, category },
  });
  return result?.report || result;
}

// =====================================================================
// PROFILE
// =====================================================================

/**
 * Update the current user's profile (production mode).
 * Sends editable fields to n8n backend which persists to Supabase.
 * Demo mode is handled directly in AuthContext (no API call needed).
 */
export async function updateProfileApi(token, { full_name, phone, avatar_url }) {
  return portalApiPost('/profile/update', {
    token,
    body: { full_name, phone, avatar_url },
  });
}

// =====================================================================
// EXPENSES
// =====================================================================

export async function fetchExpenses(token, filters = {}) {
  if (filters?.tenantId) {
    const { fetchTenantExpenses } = await import('./tenantOperationalService');
    return fetchTenantExpenses(filters.tenantId, filters);
  }

  if (IS_DEMO) {
    if (filters.scope === 'event' || filters.event_id) {
      const eventMock = await getEventMockData();
      return eventMock.listDemoExpenses({ eventId: filters.event_id });
    }
    const mock = await getMockData();
    const expenses = mock.mockExpenses || [];
    if (!filters.scope && !filters.event_id) {
      const eventMock = await getEventMockData();
      return [...expenses, ...eventMock.listDemoExpenses()];
    }
    return expenses.filter((expense) => (
      (!filters.scope || (expense.scope || 'general') === filters.scope)
      && (!filters.event_id || expense.event_id === filters.event_id)
    ));
  }
  const result = await portalApiPost('/expenses/list', { token, body: filters });
  if (!Array.isArray(result?.expenses)) {
    throw new PortalApiError('Respons daftar pengeluaran tidak memiliki format yang valid.', {
      code: 'INVALID_EXPENSES_RESPONSE',
      status: 200,
      details: result,
    });
  }
  return result.expenses;
}

export async function createExpense(token, {
  date,
  category,
  amount,
  description,
  file,
  scope = 'general',
  event_id = null,
  tenantId = null,
  recordedBy = null,
} = {}) {
  if (tenantId) {
    const { createTenantExpense } = await import('./tenantOperationalService');
    return createTenantExpense(tenantId, { date, category, amount, description, file, recordedBy });
  }

  if (IS_DEMO) {
    if (scope === 'event') {
      const eventMock = await getEventMockData();
      return eventMock.createDemoExpense({ date, category, amount, description, scope, event_id, receipt_file: file ? file.name : null });
    }
    const mock = await getMockData();
    return mock.addExpense({
      date,
      category,
      amount,
      description,
      scope,
      event_id,
      receipt_file: file ? file.name : null,
    });
  }

  const financeFields = { expense_date: date, category, amount, description };
  if (scope !== 'general' || event_id) {
    financeFields.scope = scope;
    financeFields.event_id = event_id;
  }

  if (file) {
    return portalApiUpload('/expenses/create', {
      token,
      file,
      fields: financeFields
    });
  } else {
    return portalApiPost('/expenses/create', {
      token,
      body: financeFields
    });
  }
}

export async function updateExpense(token, id, {
  date,
  category,
  amount,
  description,
  file,
  scope = 'general',
  event_id = null,
  tenantId = null,
} = {}) {
  if (tenantId) {
    const { updateTenantExpense } = await import('./tenantOperationalService');
    return updateTenantExpense(tenantId, id, { date, category, amount, description, file });
  }

  if (IS_DEMO) {
    if (scope === 'event') {
      const eventMock = await getEventMockData();
      return eventMock.updateDemoExpense(id, { date, category, amount, description, scope, event_id, receipt_file: file ? file.name : null });
    }
    const mock = await getMockData();
    return mock.updateExpense(id, {
      date,
      category,
      amount,
      description,
      scope,
      event_id,
      receipt_file: file ? file.name : null,
    });
  }

  const financeFields = { expense_id: id, expense_date: date, category, amount, description };
  if (scope !== 'general' || event_id) {
    financeFields.scope = scope;
    financeFields.event_id = event_id;
  }

  if (file) {
    return portalApiUpload('/expenses/update', {
      token,
      file,
      fields: financeFields
    });
  } else {
    return portalApiPost('/expenses/update', {
      token,
      body: financeFields
    });
  }
}

export async function deleteExpense(token, id, opts = {}) {
  if (opts?.tenantId) {
    const { deleteTenantExpense } = await import('./tenantOperationalService');
    return deleteTenantExpense(opts.tenantId, id);
  }

  if (IS_DEMO) {
    if (String(id).startsWith('demo-event-expense-')) {
      const eventMock = await getEventMockData();
      return eventMock.deleteDemoExpense(id);
    }
    const mock = await getMockData();
    return mock.deleteExpense(id);
  }
  return portalApiPost('/expenses/delete', {
    token,
    body: { expense_id: id }
  });
}

export async function fetchAuditLogs(token, filters = {}) {
  if (IS_DEMO) {
    const mock = await getMockData();
    // Transform mock login logs
    const loginLogsMapped = (mock.mockLoginLogs || []).map((l) => ({
      id: l.id,
      created_at: l.timestamp,
      actor_email: l.email,
      actor_name: l.email.split('@')[0],
      action: l.status === 'success' ? 'login.success' : 'login.failed',
      entity_type: 'auth',
      entity_id: null,
      metadata: { status: l.status, ip: l.ip },
      ip_address: l.ip,
    }));

    // Transform mock access logs
    const accessLogsMapped = (mock.mockAccessLogs || []).map((a) => {
      const actorEmail = a.userName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@palmvillage.id';
      return {
        id: a.id,
        created_at: a.timestamp,
        actor_email: actorEmail,
        actor_name: a.userName,
        action: 'page.view',
        entity_type: 'navigation',
        entity_id: a.page,
        metadata: { page: a.page },
        ip_address: '192.168.1.1',
      };
    });

    // Transform mock transaction logs
    const transactionLogsMapped = (mock.mockTransactionLogs || []).map((t) => {
      const actorEmail = t.userName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@palmvillage.id';
      const actionKey = t.action === 'Catat Pengeluaran' ? 'expense.create' : (t.action === 'Bayar IPL' ? 'payment.submit' : (t.action === 'Catat Pembayaran' ? 'payment.approve' : 'settings.update'));
      const entityKey = t.action === 'Catat Pengeluaran' ? 'expense' : (t.action === 'Ubah Pengaturan' ? 'settings' : 'payment');
      return {
        id: t.id,
        created_at: t.timestamp,
        actor_email: actorEmail,
        actor_name: t.userName,
        action: actionKey,
        entity_type: entityKey,
        entity_id: t.id,
        metadata: { details: t.details, amount: t.amount },
        ip_address: '192.168.1.2',
      };
    });

    // Combine all
    let allLogs = [...loginLogsMapped, ...accessLogsMapped, ...transactionLogsMapped];

    // Apply filters
    const { action, search, limit = 100, offset = 0 } = filters;

    if (action) {
      allLogs = allLogs.filter((l) => l.action === action);
    }

    if (search) {
      const q = search.toLowerCase();
      allLogs = allLogs.filter((l) =>
        (l.actor_email || '').toLowerCase().includes(q) ||
        (l.actor_name || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.entity_type || '').toLowerCase().includes(q)
      );
    }

    // Sort descending by date
    allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalCount = allLogs.length;
    const sliced = allLogs.slice(offset, offset + limit);

    return {
      logs: sliced,
      total_count: totalCount,
    };
  }

  // Production path: hit /logs/list n8n endpoint
  return portalApiPost('/logs/list', {
    token,
    body: filters,
  });
}

// =====================================================================
// MODE CHECK EXPORT
// =====================================================================

export { IS_DEMO };

