/**
 * payments.js
 * Matriks tagihan bulanan dan lifecycle pembayaran (submit, verifikasi, tolak, update).
 */

import { supabase, IS_DEMO } from './shared';
import { fetchTenantUnits } from './members';
import { uploadTenantFile } from '../fileStorageService';

/**
 * Mengambil dan membentuk matriks tagihan multi-bulan (12 periode) generik untuk sebuah tenant
 * @param {string} tenantId - UUID tenant
 * @param {number} year - Tahun buku (misal 2026 -> Jul 2026 s/d Jun 2027)
 * @param {object} opts - { scopeUnitId }
 */
export async function fetchTenantBillMatrix(tenantId, year = 2026, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.getBillMatrix(year, opts);
  }

  // 1. Tentukan 12 periode tahun buku (Juli YYYY s/d Juni YYYY+1)
  const periods = [
    `${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`,
    `${year + 1}-01`, `${year + 1}-02`, `${year + 1}-03`, `${year + 1}-04`, `${year + 1}-05`, `${year + 1}-06`
  ];

  // 2. Ambil units
  let units = await fetchTenantUnits(tenantId);
  if (opts.scopeUnitId) {
    units = units.filter((u) => Number(u.id) === Number(opts.scopeUnitId));
  }

  // 3. Ambil approved members
  const { data: members } = await supabase
    .from('tenant_members')
    .select('id, unit_id, full_name, phone, occupancy_status, tenant_role_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved');

  const unitMemberMap = new Map();
  (members || []).forEach((m) => {
    if (m.unit_id) unitMemberMap.set(m.unit_id, m);
  });

  // 4. Ambil billing_items untuk rentang 12 periode ini
  let billQuery = supabase
    .from('billing_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('period', periods);

  if (opts.scopeUnitId) {
    billQuery = billQuery.eq('unit_id', opts.scopeUnitId);
  }

  const { data: bills } = await billQuery;
  const billMap = new Map();
  const billIds = [];
  (bills || []).forEach((b) => {
    billMap.set(`${b.unit_id}_${b.period}`, b);
    billIds.push(b.id);
  });

  // 5. Ambil payments jika ada billIds
  const paymentMap = new Map();
  if (billIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('billing_item_id', billIds);

    (payments || []).forEach((p) => {
      paymentMap.set(p.billing_item_id, p);
    });
  }

  // 6. Susun struktur baris matriks sesuai format konsisten PortalWarga
  const rows = units.map((unit) => {
    const resident = unitMemberMap.get(unit.id) || null;

    const cells = periods.map((period) => {
      const bill = billMap.get(`${unit.id}_${period}`) || null;
      const payment = bill ? paymentMap.get(bill.id) || null : null;

      return {
        period,
        status: bill ? bill.status : 'none',
        bill: bill
          ? {
              ...bill,
              unit_id: unit.id,
              amount: Number(bill.amount || 0),
              late_fee: Number(bill.late_fee || 0),
            }
          : null,
        payment: payment || null,
      };
    });

    return {
      unit: {
        id: unit.id,
        label: unit.label,
        block: unit.metadata?.block || unit.label,
        unit_number: unit.metadata?.unit_number || '',
        is_occupied: Boolean(resident),
        occupancy_status: resident?.occupancy_status || (resident ? 'owner_occupied' : 'owner_vacant'),
        occupant_phone: unit.metadata?.occupant?.phone || null,
      },
      resident,
      residents: resident ? [resident] : [],
      cells,
    };
  });

  return rows;
}

/**
 * Mengambil daftar pembayaran tenant generik (payments + billing_items + members + units)
 * @param {string} tenantId - UUID tenant
 * @param {object} opts - { status }
 */
export async function fetchTenantPayments(tenantId, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.mockPayments;
  }

  let query = supabase
    .from('payments')
    .select(`
      id,
      tenant_id,
      billing_item_id,
      member_id,
      amount,
      method,
      transaction_id,
      status,
      proof_url,
      verified_by,
      verified_at,
      paid_at,
      metadata,
      created_at,
      updated_at,
      billing_items:billing_item_id (
        id,
        period,
        amount,
        late_fee,
        unit_id,
        status,
        program_id,
        metadata,
        program:tenant_programs(id, name),
        tenant_units:unit_id (
          id,
          label,
          metadata
        )
      ),
      tenant_members:member_id (
        id,
        full_name,
        phone,
        tenant_role_id,
        occupancy_status
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantPayments error:', error);
    throw error;
  }

  return (data || []).map((p) => {
    const bill = p.billing_items || {};
    const unit = bill.tenant_units || {};
    const member = p.tenant_members || {};
    const meta = p.metadata || {};
    const billMeta = bill.metadata || {};
    const program = bill.program || null;
    const programId = bill.program_id || billMeta.program_id || meta.program_id || null;
    const programName =
      program?.name ||
      billMeta.program_name ||
      meta.program_name ||
      null;

    const proofFileUrl = p.proof_url || meta.proof_file_url || meta.proof_url || '';
    const proofFileName =
      meta.proof_file_name ||
      meta.receipt_file ||
      (proofFileUrl ? proofFileUrl.split('/').pop().split('?')[0] : '');

    return {
      ...p,
      id: p.id,
      tenant_id: p.tenant_id,
      billing_item_id: p.billing_item_id || bill.id || '',
      resident_id: p.member_id || member.id || '',
      unit_id: bill.unit_id || unit.id || '',
      period: bill.period || meta.period || '',
      amount: Number(p.amount ?? bill.amount ?? 0),
      method: p.method || 'bank_transfer',
      status: p.status === 'completed' ? 'verified' : p.status,
      paid_at: p.paid_at || p.created_at,
      verified_by: meta.verified_by_name || p.verified_by || '',
      verified_at: p.verified_at,
      rejection_reason: meta.rejection_reason || '',
      proof_file_url: proofFileUrl,
      proof_file_name: proofFileName,
      receipt_file: proofFileName,
      metadata: meta,
      program_id: programId,
      program_name: programName,
      _bill: {
        id: bill.id,
        period: bill.period,
        amount: Number(bill.amount || 0),
        unit_id: bill.unit_id,
        status: bill.status,
        program_id: programId,
        metadata: billMeta,
        program,
      },
      _profile: member.id ? member : null,
      _unit: unit.id
        ? {
            id: unit.id,
            label: unit.label,
            block: unit.metadata?.block || unit.label,
            unit_number: unit.metadata?.unit_number || '',
          }
        : null,
    };
  });
}

/**
 * Memverifikasi / menyetujui pembayaran manual (bank_transfer/cash) untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { verifiedBy, note }
 */
export async function verifyTenantPayment(tenantId, paymentId, { verifiedBy, note } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    const payment = mock.verifyPayment(paymentId, { verifiedBy, note });
    return {
      success: true,
      paymentId,
      status: 'verified',
      payment: payment || { id: paymentId, status: 'verified', verified_by: verifiedBy },
    };
  }

  const { data: currentPayment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, billing_item_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] verifyTenantPayment fetch error:', fetchErr);
    throw fetchErr;
  }

  const updatedMetadata = {
    ...(currentPayment.metadata || {}),
    verified_by_name: verifiedBy || 'Pengurus',
    verification_note: note || '',
  };

  const { error: payErr } = await supabase
    .from('payments')
    .update({
      status: 'completed',
      verified_at: new Date().toISOString(),
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', paymentId);

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] verifyTenantPayment update error:', payErr);
    throw payErr;
  }

  if (currentPayment.billing_item_id) {
    const { error: billErr } = await supabase
      .from('billing_items')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', currentPayment.billing_item_id);

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] verifyTenantPayment billing update error:', billErr);
      throw billErr;
    }
  }

  return { success: true, paymentId, status: 'completed' };
}

/**
 * Menolak bukti pembayaran manual untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { rejectedBy, reason }
 */
export async function rejectTenantPayment(tenantId, paymentId, { rejectedBy, reason } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    const payment = mock.rejectPayment(paymentId, { rejectedBy, reason });
    return {
      success: true,
      paymentId,
      status: 'rejected',
      payment: payment || { id: paymentId, status: 'rejected', rejected_by: rejectedBy, rejection_reason: reason },
    };
  }

  const { data: currentPayment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, billing_item_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantPayment fetch error:', fetchErr);
    throw fetchErr;
  }

  const updatedMetadata = {
    ...(currentPayment.metadata || {}),
    rejected_by_name: rejectedBy || 'Pengurus',
    rejection_reason: reason || '',
    rejected_at: new Date().toISOString(),
  };

  const { error: payErr } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', paymentId);

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantPayment update error:', payErr);
    throw payErr;
  }

  if (currentPayment.billing_item_id) {
    const { error: billErr } = await supabase
      .from('billing_items')
      .update({
        status: 'unpaid',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', currentPayment.billing_item_id);

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] rejectTenantPayment billing update error:', billErr);
      throw billErr;
    }
  }

  return { success: true, paymentId, status: 'rejected' };
}

/**
 * Mengajukan pembayaran manual (transfer / tunai) untuk tenant.
 * Membuat baris di tabel payments dengan status 'pending_verification' (atau 'completed' jika dibuat oleh staff/cash)
 * dan memperbarui status billing_items ke 'pending_verification'.
 */
export async function submitTenantPayment(tenantId, {
  billId,
  method = 'bank_transfer',
  amount,
  proofFile,
  proofUrl,
  note,
  paidAt,
  memberId,
  isStaff = false,
  verifiedBy = null,
} = {}) {
  if (!tenantId || !billId) {
    throw new Error('Tenant ID dan Bill ID wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    try {
      const { getDemoProgramDues } = await import('./programDues');
      const demoDues = getDemoProgramDues(tenantId);
      const dueBill = demoDues.find((d) => d.id === billId);
      if (dueBill) {
        dueBill.status = isStaff || method === 'cash' ? 'paid' : 'pending_verification';
        const paymentRecord = {
          id: `demo-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          billing_item_id: billId,
          status: isStaff || method === 'cash' ? 'completed' : 'pending',
          method,
          proof_url: proofFile?.name || (typeof proofFile === 'string' ? proofFile : 'demo-proof.jpg'),
          paid_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          metadata: { note: note || '' },
        };
        dueBill.payments = paymentRecord;
        dueBill.latestPayment = paymentRecord;
        dueBill.updated_at = new Date().toISOString();
        return paymentRecord;
      }
    } catch {
      // lanjut ke mockData jika bukan iuran acara
    }

    const mock = await import('../mockData');
    return mock.recordResidentPayment([billId], {
      method,
      receiptFile: proofFile?.name || (typeof proofFile === 'string' ? proofFile : null),
      note,
    });
  }

  // 1. Ambil detail tagihan untuk memastikan nominal dan status
  const { data: bill, error: billFetchErr } = await supabase
    .from('billing_items')
    .select('id, amount, late_fee, member_id, status, program_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .single();

  if (billFetchErr || !bill) {
    throw new Error('Tagihan tidak ditemukan untuk tenant ini.');
  }

  // BLOCKER 1: Jangan percaya nominal payment dari client
  // Obligation aktual: amount + applicable late fee
  const expectedAmount = Number(bill.amount || 0) + Number(bill.late_fee || 0);

  if (amount !== undefined && amount !== null && amount !== '') {
    const clientAmount = Number(amount);
    if (clientAmount !== expectedAmount) {
      throw new Error(`Nominal pembayaran (${clientAmount}) tidak sesuai dengan total tagihan wajib (${expectedAmount}).`);
    }
  }

  const paymentAmount = expectedAmount;

  const initialStatus = isStaff && method === 'cash' ? 'completed' : 'pending_verification';

  // 2. Upload bukti transfer jika berupa File (dengan tracking integritas penyimpanan)
  let resolvedProofPath = proofUrl || '';
  let proofFileName = proofFile?.name || (typeof proofFile === 'string' ? proofFile : '');
  let isProofUploaded = Boolean(resolvedProofPath);

  if (proofFile && typeof proofFile === 'object' && proofFile.size) {
    try {
      const uploadedPath = await uploadTenantFile({
        kind: 'payment_proof',
        tenantId,
        billingItemId: billId,
        file: proofFile,
      });

      if (!uploadedPath) {
        if (!isStaff && method === 'bank_transfer') {
          throw new Error('Bukti transfer gagal diunggah. Coba lagi.');
        }
        resolvedProofPath = '';
        isProofUploaded = false;
      } else {
        resolvedProofPath = uploadedPath;
        isProofUploaded = true;
      }
    } catch (err) {
      if (!isStaff && method === 'bank_transfer') {
        if (err?.status === 413 || err?.status === 415) {
          throw err;
        }
        throw err instanceof Error && err.message === 'Bukti transfer gagal diunggah. Coba lagi.'
          ? err
          : new Error('Bukti transfer gagal diunggah. Coba lagi.');
      }
      resolvedProofPath = '';
      isProofUploaded = false;
    }
  }

  // 3. Insert record ke payments
  const paymentPayload = {
    tenant_id: tenantId,
    billing_item_id: billId,
    member_id: memberId || bill.member_id || null,
    amount: paymentAmount,
    method: method || 'bank_transfer',
    status: initialStatus,
    proof_url: resolvedProofPath || null,
    paid_at: paidAt || new Date().toISOString(),
    metadata: {
      note: note || '',
      proof_file_name: proofFileName,
      proof_path: resolvedProofPath || null,
      proof_stored: isProofUploaded,
      submitted_at: new Date().toISOString(),
      ...(bill?.program_id ? { program_id: bill.program_id } : {}),
      ...(bill?.metadata?.bill_type ? { bill_type: bill.metadata.bill_type } : {}),
      ...(bill?.metadata?.program_name ? { program_name: bill.metadata.program_name } : {}),
      ...(verifiedBy ? { verified_by_name: verifiedBy } : {}),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedPayment, error: payErr } = await supabase
    .from('payments')
    .insert([paymentPayload])
    .select()
    .single();

  if (payErr) {
    if (payErr.code === '23505') {
      throw new Error('Tagihan ini sudah dibayar atau sedang diverifikasi.');
    }
    if (payErr.code === '22023') {
      throw new Error('Nominal tidak sesuai tagihan.');
    }
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] submitTenantPayment error:', payErr);
    throw payErr;
  }

  return insertedPayment;
}

/**
 * Mengajukan pembayaran transfer oleh anggota untuk tagihan tertentu (PANITIA-2.2).
 * Pembungkus submitTenantPayment dengan method: 'bank_transfer', isStaff: false.
 * Bukti wajib diunggah (JPG/PNG/WebP/PDF <= 5 MB).
 *
 * @param {string} tenantId
 * @param {object} params
 * @param {string} params.billId
 * @param {File|object|string} params.proofFile
 * @param {string} [params.note]
 * @param {string} [params.memberId]
 */
export async function submitMemberTransfer(tenantId, { billId, proofFile, note, memberId } = {}) {
  if (!tenantId || !billId) {
    throw new Error('Tenant ID dan Bill ID wajib disertakan.');
  }

  if (!proofFile) {
    throw new Error('Bukti transfer wajib diunggah.');
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  if (typeof proofFile === 'object' && proofFile !== null) {
    if (proofFile.size !== undefined && proofFile.size > MAX_SIZE) {
      throw new Error('Ukuran file bukti maksimal 5 MB.');
    }
    const name = (proofFile.name || '').toLowerCase();
    const type = (proofFile.type || '').toLowerCase();
    const hasValidExt = ALLOWED_EXTS.some((ext) => name.endsWith(ext));
    const hasValidMime = ALLOWED_MIMES.includes(type);
    if ((name || type) && !hasValidExt && !hasValidMime) {
      throw new Error('Format file bukti harus berupa JPG, PNG, WebP, atau PDF.');
    }
  } else if (typeof proofFile === 'string') {
    const trimmed = proofFile.trim();
    if (!trimmed) {
      throw new Error('Bukti transfer wajib diunggah.');
    }
    const lower = trimmed.toLowerCase();
    const hasValidExt = ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
    if (!hasValidExt) {
      throw new Error('Format file bukti harus berupa JPG, PNG, WebP, atau PDF.');
    }
  }

  return submitTenantPayment(tenantId, {
    billId,
    method: 'bank_transfer',
    proofFile,
    note,
    memberId,
    isStaff: false,
  });
}

/**
 * Memperbarui rincian pembayaran untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { unit_id, amount, method, paid_at, note }
 */
export async function updateTenantPayment(tenantId, paymentId, { unit_id, amount, method, paid_at, note } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.updatePayment(paymentId, { unit_id, amount, method, paid_at, note });
  }

  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (amount !== undefined && amount !== null && amount !== '') updateFields.amount = Number(amount);
  if (method) updateFields.method = method;
  if (paid_at) updateFields.paid_at = paid_at;

  const { data: current, error: fetchErr } = await supabase
    .from('payments')
    .select('id, metadata, billing_item_id')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) throw fetchErr;

  if (note !== undefined) {
    updateFields.metadata = {
      ...(current.metadata || {}),
      note: String(note).trim(),
    };
  }

  const { data, error } = await supabase
    .from('payments')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantPayment error:', error);
    throw error;
  }

  if (unit_id && current.billing_item_id) {
    await supabase
      .from('billing_items')
      .update({ unit_id, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', current.billing_item_id);
  }

  return data;
}