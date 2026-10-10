/**
 * payments.js
 * Matriks tagihan bulanan dan lifecycle pembayaran (submit, verifikasi, tolak, update).
 */

import { supabase, IS_DEMO } from './shared';
import { fetchTenantUnits } from './members';

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
      _bill: {
        id: bill.id,
        period: bill.period,
        amount: Number(bill.amount || 0),
        unit_id: bill.unit_id,
        status: bill.status,
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
    .select('id, amount, late_fee, member_id, status')
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
  let resolvedProofUrl = proofUrl || '';
  let proofFileName = proofFile?.name || (typeof proofFile === 'string' ? proofFile : '');
  let isProofUploaded = Boolean(resolvedProofUrl);

  if (proofFile && typeof proofFile === 'object' && proofFile.size) {
    try {
      const ext = (proofFile.name || '').split('.').pop() || 'jpg';
      const storagePath = `payments/${tenantId}/${billId}_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('payment-proofs')
        .upload(storagePath, proofFile, { upsert: true });

      if (!uploadErr && uploadData?.path) {
        const { data: pubUrl } = supabase.storage
          .from('payment-proofs')
          .getPublicUrl(uploadData.path);
        resolvedProofUrl = pubUrl?.publicUrl || '';
        isProofUploaded = Boolean(resolvedProofUrl);
      } else {
        resolvedProofUrl = '';
        isProofUploaded = false;
      }
    } catch {
      resolvedProofUrl = '';
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
    proof_url: resolvedProofUrl || null,
    paid_at: paidAt || new Date().toISOString(),
    metadata: {
      note: note || '',
      proof_file_name: proofFileName,
      proof_stored: isProofUploaded,
      submitted_at: new Date().toISOString(),
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
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] submitTenantPayment error:', payErr);
    throw payErr;
  }

  // 4. Update status billing_items
  const nextBillStatus = initialStatus === 'completed' ? 'paid' : 'pending_verification';
  const { error: billUpdateErr } = await supabase
    .from('billing_items')
    .update({
      status: nextBillStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', billId);

  if (billUpdateErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] submitTenantPayment bill update error:', billUpdateErr);
    // Rollback: Hapus pembayaran yang ter-insert agar tidak terjadi state inkonsisten
    if (insertedPayment?.id) {
      await supabase
        .from('payments')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', insertedPayment.id);
    }
    throw billUpdateErr;
  }

  return insertedPayment;
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