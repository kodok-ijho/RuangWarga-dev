/**
 * finance.js
 * Pengeluaran kas, agregasi keuangan bulanan, saldo berjalan, kewajiban warga, dan dashboard operasional.
 */

import { supabase, IS_DEMO } from './shared';
import {
  fetchTenantUnits,
  fetchTenantMembers,
  fetchPendingTenantMembers,
} from './members';
import {
  fetchTenantPayments,
  fetchTenantBillMatrix,
} from './payments';
import {
  getTenantOpeningBalance,
  fetchTenantFinancialRecords,
} from '../finance/financialRepository';
import {
  aggregatePeriodCashFlow,
  buildContiguousBalanceChain,
} from '../finance/financialAggregation';
import { getReportingPeriodRange } from '../finance/financialDateResolver';
import { buildCanonicalExpenseReceiptPath } from '../../utils/storagePolicy';

/**
 * Mengambil daftar pengeluaran kas tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} filters - { category, month }
 */
export async function fetchTenantExpenses(tenantId, filters = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.mockExpenses || [];
  }

  let query = supabase
    .from('expenses')
    .select('id, tenant_id, category, amount, description, receipt_url, recorded_by, metadata, expense_date, is_date_proxy, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantExpenses error:', error);
    throw error;
  }

  return (data || []).map((exp) => {
    const canonicalExpenseDate = exp.expense_date || '';
    const receiptFile = exp.receipt_url ? exp.receipt_url.split('/').pop().split('?')[0] : '';
    return {
      ...exp,
      amount: Number(exp.amount || 0),
      date: canonicalExpenseDate,
      expense_date: canonicalExpenseDate,
      receipt_file_url: exp.receipt_url || '',
      file_url: exp.receipt_url || '',
      receipt_file: receiptFile,
    };
  });
}

/**
 * Mencatat pengeluaran baru untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { date, category, amount, description, file, recordedBy }
 */
export async function createTenantExpense(tenantId, { date, category, amount, description, file, recordedBy } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.addExpense({
      date,
      category,
      amount,
      description,
      receipt_file: file ? (file.name || file) : null,
    });
  }

  const expenseDate = date || new Date().toISOString().substring(0, 10);
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Nominal pengeluaran harus berupa angka lebih besar dari 0.');
  }

  let receiptPath = null;
  if (file && typeof file === 'object' && (file.size || file.name)) {
    try {
      const storagePath = buildCanonicalExpenseReceiptPath({
        tenantId,
        expenseDate,
        fileName: file.name || 'receipt.jpg',
      });
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('expense-receipts')
        .upload(storagePath, file, { upsert: false });

      if (uploadErr) {
        // eslint-disable-next-line no-console
        console.error('[tenantOperationalService] Upload receipt error:', uploadErr);
        throw uploadErr;
      }
      receiptPath = uploadData?.path || storagePath;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] Failed to upload receipt to expense-receipts:', err);
      throw err;
    }
  } else if (typeof file === 'string' && file) {
    receiptPath = file;
  }

  const payload = {
    tenant_id: tenantId,
    category: category || 'Lain-lain',
    amount: numAmount,
    description: description ? description.trim() : null,
    receipt_url: receiptPath,
    recorded_by: recordedBy || null,
    expense_date: expenseDate,
    metadata: {
      date: expenseDate,
      file_name: file ? (file.name || (typeof file === 'string' ? file : null)) : null,
    },
  };

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantExpense error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui pengeluaran tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} expenseId - UUID expense
 * @param {object} param2 - { date, category, amount, description, file }
 */
export async function updateTenantExpense(tenantId, expenseId, { date, category, amount, description, file } = {}) {
  if (!tenantId || !expenseId) throw new Error('tenantId dan expenseId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.updateExpense(expenseId, {
      date,
      category,
      amount,
      description,
      receipt_file: file ? (file.name || file) : null,
    });
  }

  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (category) updateFields.category = category;
  if (amount !== undefined && amount !== '') {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Nominal pengeluaran harus berupa angka lebih besar dari 0.');
    }
    updateFields.amount = numAmount;
  }
  if (description !== undefined) updateFields.description = description ? description.trim() : null;

  if (date) {
    updateFields.expense_date = date;
    updateFields.metadata = { date };
  }

  if (file && typeof file === 'object' && (file.size || file.name)) {
    const expenseDate = date || new Date().toISOString().substring(0, 10);
    const storagePath = buildCanonicalExpenseReceiptPath({
      tenantId,
      expenseDate,
      fileName: file.name || 'receipt.jpg',
    });
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('expense-receipts')
      .upload(storagePath, file, { upsert: false });

    if (uploadErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] Upload receipt error on update:', uploadErr);
      throw uploadErr;
    }
    updateFields.receipt_url = uploadData?.path || storagePath;
  } else if (typeof file === 'string' && file) {
    updateFields.receipt_url = file;
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantExpense error:', error);
    throw error;
  }

  return data;
}

/**
 * Menghapus pengeluaran tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} expenseId - UUID expense
 */
export async function deleteTenantExpense(tenantId, expenseId) {
  if (!tenantId || !expenseId) throw new Error('tenantId dan expenseId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.deleteExpense(expenseId);
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', expenseId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] deleteTenantExpense error:', error);
    throw error;
  }

  return { success: true, id: expenseId };
}

/**
 * Mengambil ringkasan laporan keuangan bulanan tenant secara canonical cash-basis.
 * Sub-Gate: 8.1-C5 (Service Layer Additive Migration)
 * 
 * Pipeline:
 * 1. financialDateResolver.getReportingPeriodRange(year, month)
 * 2. financialRepository.getTenantOpeningBalance({ tenantId, beforeDate, signal })
 * 3. financialRepository.fetchTenantFinancialRecords({ tenantId, startDate, endDate, signal })
 * 4. financialAggregation.aggregatePeriodCashFlow({ openingBalanceMinorUnits, records, periodRange })
 * 5. Returns additive compatibility shape
 * 
 * @param {string} tenantId - UUID tenant (wajib)
 * @param {object} param1 - { year, month }
 * @param {object} [options] - { signal, client }
 */
export async function fetchTenantMonthlyFinance(tenantId, { year, month }, options = {}) {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('tenantId wajib disertakan dan harus berupa string yang valid.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const baseReport = mock.computeReport(period);
    const expenses = mock.getExpensesForPeriod(period);
    const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalIncome = Number(baseReport?.totalCollected || 0);
    const netIncome = totalIncome - totalExpense;
    return {
      report: {
        ...baseReport,
        period,
        total_income: totalIncome,
        total_expense: totalExpense,
        net_income: netIncome,
        cash_inflow: totalIncome,
        cash_outflow: totalExpense,
        balance: netIncome,
        opening_balance: 0,
        closing_balance: netIncome,
        unresolved_count: 0,
      },
      expenses,
      cashPayments: mock.getPaymentsByMonth(year, month),
      nonIplIncomes: [],
      unresolvedPayments: [],
    };
  }

  const { signal, client } = options;
  const { periodStr, periodStartCalendar, periodEndCalendarExclusive } = getReportingPeriodRange(year, month);

  // 1. Authoritative opening balance sebelum periodStartCalendar via RPC
  const openingBalanceMinorUnits = await getTenantOpeningBalance({
    tenantId,
    beforeDate: periodStartCalendar,
    signal,
    client,
  });

  // 2. Authoritative bounded period records [periodStartCalendar, periodEndCalendarExclusive)
  const financialData = await fetchTenantFinancialRecords({
    tenantId,
    startDate: periodStartCalendar,
    endDate: periodEndCalendarExclusive,
    signal,
    client,
  });

  // 3. Pure cash-basis aggregation via C2 engine
  const summary = aggregatePeriodCashFlow({
    openingBalanceMinorUnits,
    records: financialData.records,
    periodRange: { periodStartCalendar, periodEndCalendarExclusive },
  });

  const toRupiah = (minorUnits) => Number((minorUnits / 100).toFixed(2));

  // 4. Map to consumer-compatible response shapes
  const mappedExpenses = (financialData.expenses || [])
    .filter((e) => e.isRecognizedCash)
    .map((e) => {
      const raw = e.raw || {};
      return {
        ...raw,
        id: e.id,
        amount: toRupiah(e.amountMinorUnits),
        date: e.canonicalDate,
        expense_date: e.canonicalDate,
        category: e.category,
        description: e.description,
      };
    });

  const mappedPayments = (financialData.payments || [])
    .filter((p) => p.isRecognizedCash)
    .map((p) => {
      const raw = p.raw || {};
      return {
        ...raw,
        id: p.id,
        amount: toRupiah(p.amountMinorUnits),
        paid_at: raw.paid_at,
        canonicalDate: p.canonicalDate,
        status: p.status,
        method: raw.method,
        billing_items: raw.billing_items,
      };
    });

  const mappedNonIpl = (financialData.nonIplIncomes || [])
    .filter((i) => i.isRecognizedCash)
    .map((i) => {
      const raw = i.raw || {};
      return {
        ...raw,
        id: i.id,
        amount: toRupiah(i.amountMinorUnits),
        date: i.canonicalDate,
        income_date: i.canonicalDate,
        category: i.category,
        description: i.description,
      };
    });

  const mappedUnresolved = (financialData.unresolvedPayments || []).map((p) => {
    const raw = p.raw || {};
    return {
      ...raw,
      id: p.id,
      amount: toRupiah(p.amountMinorUnits),
      status: p.status,
      canonicalDate: null,
      isUnresolved: true,
      unresolvedReason: p.unresolvedReason,
    };
  });

  return {
    report: {
      period: periodStr,
      total_income: toRupiah(summary.inflowMinorUnits),
      total_expense: toRupiah(summary.outflowMinorUnits),
      net_income: toRupiah(summary.netMinorUnits),
      cash_inflow: toRupiah(summary.inflowMinorUnits),
      cash_outflow: toRupiah(summary.outflowMinorUnits),
      balance: toRupiah(summary.netMinorUnits),
      opening_balance: toRupiah(summary.openingBalanceMinorUnits),
      closing_balance: toRupiah(summary.closingBalanceMinorUnits),
      unresolved_count: summary.unresolvedCount,
      // Formatted display strings
      inflowFormatted: summary.inflowFormatted,
      outflowFormatted: summary.outflowFormatted,
      netFormatted: summary.netFormatted,
      openingBalanceFormatted: summary.openingBalanceFormatted,
      closingBalanceFormatted: summary.closingBalanceFormatted,
    },
    expenses: mappedExpenses,
    cashPayments: mappedPayments,
    nonIplIncomes: mappedNonIpl,
    unresolvedPayments: mappedUnresolved,
  };
}

/**
 * Mengambil saldo kas berjalan tenant secara berurutan dan berkesinambungan (running balance chain).
 * Sub-Gate: 8.1-C5 (Service Layer Additive Migration)
 * 
 * Guarantee:
 * Opening(M) === Closing(M - 1)
 * 
 * @param {string} tenantId - UUID tenant (wajib)
 * @param {object} param1 - { year, month, startYear, startMonth, monthsCount }
 * @param {object} [options] - { signal, client }
 */
export async function fetchTenantRunningBalance(tenantId, { year, month, startYear, startMonth, monthsCount } = {}, options = {}) {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('tenantId wajib disertakan dan harus berupa string yang valid.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return { chain: mock.computeRunningBalance(year, month) };
  }

  const { signal, client } = options;

  const targetYear = Number(year);
  const targetMonth = Number(month);

  if (isNaN(targetYear) || isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    throw new Error(`Parameter tahun (${year}) dan bulan (${month}) tidak valid.`);
  }

  let fromYear, fromMonth;
  if (startYear && startMonth) {
    fromYear = Number(startYear);
    fromMonth = Number(startMonth);
  } else if (monthsCount && Number.isInteger(monthsCount) && monthsCount > 0) {
    let count = monthsCount;
    fromYear = targetYear;
    fromMonth = targetMonth;
    while (count > 1) {
      fromMonth -= 1;
      if (fromMonth < 1) {
        fromMonth = 12;
        fromYear -= 1;
      }
      count -= 1;
    }
  } else {
    fromYear = targetMonth >= 7 ? targetYear : targetYear - 1;
    fromMonth = 7;
  }

  const periodRanges = [];
  let curY = fromYear;
  let curM = fromMonth;

  while (curY < targetYear || (curY === targetYear && curM <= targetMonth)) {
    const range = getReportingPeriodRange(curY, curM);
    periodRanges.push({
      ...range,
      year: curY,
      month: curM,
    });
    curM += 1;
    if (curM > 12) {
      curM = 1;
      curY += 1;
    }
  }

  if (periodRanges.length === 0) {
    const range = getReportingPeriodRange(targetYear, targetMonth);
    periodRanges.push({
      ...range,
      year: targetYear,
      month: targetMonth,
    });
  }

  const firstRange = periodRanges[0];
  const lastRange = periodRanges[periodRanges.length - 1];

  // 1. Ambil opening balance awal untuk periode pertama via database RPC
  const initialOpeningBalanceMinorUnits = await getTenantOpeningBalance({
    tenantId,
    beforeDate: firstRange.periodStartCalendar,
    signal,
    client,
  });

  // 2. Ambil seluruh transaksi dalam bentang [firstRange.start, lastRange.endExclusive)
  const financialData = await fetchTenantFinancialRecords({
    tenantId,
    startDate: firstRange.periodStartCalendar,
    endDate: lastRange.periodEndCalendarExclusive,
    signal,
    client,
  });

  // 3. Bangun contiguous balance chain menggunakan engine C2
  const chainResult = buildContiguousBalanceChain({
    initialOpeningBalanceMinorUnits,
    periodRanges,
    records: financialData.records,
  });

  const toRupiah = (minorUnits) => Number((minorUnits / 100).toFixed(2));

  // 4. Adaptasi shape kompatibilitas consumer
  const mappedChain = chainResult.chain.map((entry) => {
    const opening = toRupiah(entry.openingBalanceMinorUnits);
    const closing = toRupiah(entry.closingBalanceMinorUnits);
    const income = toRupiah(entry.inflowMinorUnits);
    const expense = toRupiah(entry.outflowMinorUnits);
    const net = toRupiah(entry.netMinorUnits);

    return {
      period: entry.period,
      year: entry.year,
      month: entry.month,
      openingBalance: opening,
      totalIncome: income,
      totalExpense: expense,
      closingBalance: closing,
      incomeCount: entry.incomeCount,
      expenseCount: entry.expenseCount,
      unresolvedCount: entry.unresolvedCount,
      // Additive compatibility aliases (snake_case / legacy)
      opening_balance: opening,
      closing_balance: closing,
      total_income: income,
      total_expense: expense,
      income,
      expense,
      balance: net,
    };
  });

  return {
    chain: mappedChain,
    finalClosingBalance: toRupiah(chainResult.finalClosingBalanceMinorUnits),
    totalInflow: toRupiah(chainResult.totalInflowMinorUnits),
    totalOutflow: toRupiah(chainResult.totalOutflowMinorUnits),
    totalUnresolvedCount: chainResult.totalUnresolvedCount,
  };
}

export function resolveCitizenObligationAndUnit({
  units = [],
  members = [],
  billMatrix = [],
  resolvedPeriod,
  userId,
  userEmail,
  unitId,
  isDemo = false,
  demoProfiles = [],
  demoUnits = [],
}) {
  let matchedUnitId = unitId || null;
  let matchedUnitLabel = null;

  if (isDemo) {
    if (!matchedUnitId && (userId || userEmail)) {
      const p = (demoProfiles || []).find((mp) => mp.id === userId || mp.email === userEmail);
      if (p && p.unit_id) {
        matchedUnitId = p.unit_id;
      }
    }
    if (matchedUnitId) {
      const u = (demoUnits || []).find((mu) => Number(mu.id) === Number(matchedUnitId));
      if (u) {
        matchedUnitLabel = `Blok ${u.block} No. ${u.unit_number}`;
      }
    }
  } else {
    // Production / Supabase mode
    if (!matchedUnitId && (userId || userEmail)) {
      const m = (members || []).find(
        (mem) => (userId && (mem.user_id === userId || mem.id === userId)) || (userEmail && (mem.email === userEmail || mem.phone === userEmail))
      );
      if (m) {
        matchedUnitId = m.unit_id;
        matchedUnitLabel = m.tenant_units?.label || null;
      }
    }
    if (matchedUnitId && !matchedUnitLabel) {
      const u = (units || []).find((un) => Number(un.id) === Number(matchedUnitId));
      if (u) {
        matchedUnitLabel = u.label || null;
      }
    }
  }

  // Cari kewajiban (obligation) untuk matchedUnitId pada periode resolvedPeriod
  let myObligation = null;
  if (matchedUnitId) {
    const row = (billMatrix || []).find(
      (r) => r.unit?.id === matchedUnitId || Number(r.unit?.id) === Number(matchedUnitId)
    );
    const targetCell = row?.cells?.find(
      (c) => c?.period === resolvedPeriod || c?.bill?.period === resolvedPeriod
    );

    if (targetCell?.bill) {
      const bill = targetCell.bill;
      const payment = targetCell.payment;

      let status = 'unpaid';
      if (
        payment?.status === 'pending' ||
        payment?.status === 'pending_verification' ||
        bill.status === 'pending'
      ) {
        status = 'pending';
      } else if (
        payment?.status === 'verified' ||
        payment?.status === 'approved' ||
        bill.status === 'paid'
      ) {
        status = 'paid';
      } else if (bill.status === 'unpaid') {
        status = 'unpaid';
      } else {
        status = bill.status || 'unpaid';
      }

      myObligation = {
        id: bill.id,
        period: bill.period || resolvedPeriod,
        amount: Number(bill.amount),
        status,
        dueDate: bill.due_date || null,
        payment: payment || null,
      };
    }
  }

  return {
    myUnit: matchedUnitLabel,
    myObligation,
  };
}

/**
 * Mengambil ringkasan data operasional & dashboard tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} options - { role, period, userId, userEmail, unitId }
 */
export async function fetchTenantDashboardData(
  tenantId,
  { role = 'admin', period, userId, userEmail, unitId } = {}
) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const resolvedPeriod = period || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = resolvedPeriod.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    const [units, members, pendingMembers, pendingPayments, monthlyFinance, billMatrix] = await Promise.all([
      fetchTenantUnits(tenantId),
      fetchTenantMembers(tenantId),
      fetchPendingTenantMembers(tenantId),
      fetchTenantPayments(tenantId, { status: 'pending' }),
      fetchTenantMonthlyFinance(tenantId, { year, month }),
      fetchTenantBillMatrix(tenantId, year),
    ]);

    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === 'active' || u.is_occupied).length;
    const vacantUnits = totalUnits - occupiedUnits;

    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let billCount = 0;

    (billMatrix || []).forEach((row) => {
      const targetCell = row.cells?.find((c) => c?.bill?.period === resolvedPeriod) || row.cells?.[0];
      if (targetCell?.bill) {
        billCount++;
        const amt = Number(targetCell.bill.amount || 0);
        totalBilled += amt;
        if (targetCell.status === 'paid' || targetCell.bill.status === 'paid') {
          totalCollected += amt;
        } else {
          totalOutstanding += amt;
        }
      }
    });

    if (billCount === 0 && totalUnits > 0) {
      billCount = totalUnits;
    }

    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    const { mockProfiles, mockUnits } = await import('../mockData');
    const { myUnit, myObligation } = resolveCitizenObligationAndUnit({
      units,
      members,
      billMatrix,
      resolvedPeriod,
      userId,
      userEmail,
      unitId,
      isDemo: true,
      demoProfiles: mockProfiles,
      demoUnits: mockUnits,
    });

    return {
      period: resolvedPeriod,
      year,
      month,
      pendingRegistrationCount: pendingMembers.length,
      pendingPaymentCount: pendingPayments.length,
      units: {
        total: totalUnits,
        occupied: occupiedUnits,
        vacant: vacantUnits,
      },
      members: {
        total: members.length,
      },
      finance: {
        totalIncome: monthlyFinance.report?.total_income || 0,
        totalExpense: monthlyFinance.report?.total_expense || 0,
        netCashflow: monthlyFinance.report?.net_income || 0,
      },
      billing: {
        totalBilled,
        totalCollected,
        totalOutstanding,
        billCount,
        collectionRate,
      },
      recentPayments: pendingPayments.slice(0, 5),
      myUnit,
      myObligation,
    };
  }

  // Production Mode dengan Supabase
  const [units, members, pendingMembers, pendingPayments, monthlyFinance, billMatrix] = await Promise.all([
    fetchTenantUnits(tenantId).catch(() => []),
    fetchTenantMembers(tenantId).catch(() => []),
    fetchPendingTenantMembers(tenantId).catch(() => []),
    fetchTenantPayments(tenantId, { status: 'pending' }).catch(() => []),
    fetchTenantMonthlyFinance(tenantId, { year, month }).catch(() => ({ report: {} })),
    fetchTenantBillMatrix(tenantId, year).catch(() => []),
  ]);

  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.status === 'active').length;
  const vacantUnits = totalUnits - occupiedUnits;

  let totalBilled = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let billCount = 0;

  (billMatrix || []).forEach((row) => {
    const targetCell = row.cells?.find((c) => c?.bill?.period === resolvedPeriod) || row.cells?.[0];
    if (targetCell?.bill) {
      billCount++;
      const amt = Number(targetCell.bill.amount || 0);
      totalBilled += amt;
      if (targetCell.status === 'paid' || targetCell.bill.status === 'paid') {
        totalCollected += amt;
      } else {
        totalOutstanding += amt;
      }
    }
  });

  if (billCount === 0 && totalUnits > 0) {
    billCount = totalUnits;
  }

  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  const { myUnit, myObligation } = resolveCitizenObligationAndUnit({
    units,
    members,
    billMatrix,
    resolvedPeriod,
    userId,
    userEmail,
    unitId,
    isDemo: false,
  });

  return {
    period: resolvedPeriod,
    year,
    month,
    pendingRegistrationCount: pendingMembers.length,
    pendingPaymentCount: pendingPayments.length,
    units: {
      total: totalUnits,
      occupied: occupiedUnits,
      vacant: vacantUnits,
    },
    members: {
      total: members.length,
    },
    finance: {
      totalIncome: monthlyFinance.report?.total_income || 0,
      totalExpense: monthlyFinance.report?.total_expense || 0,
      netCashflow: monthlyFinance.report?.net_income || 0,
    },
    billing: {
      totalBilled,
      totalCollected,
      totalOutstanding,
      billCount,
      collectionRate,
    },
    recentPayments: pendingPayments.slice(0, 5),
    myUnit,
    myObligation,
  };
}