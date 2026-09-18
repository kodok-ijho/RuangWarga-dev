import { useState, useMemo, useEffect, useCallback } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell as PieCell, Legend,
  AreaChart, Area
} from 'recharts';
import {
  AiOutlinePaperClip,
  AiOutlinePrinter,
  AiOutlineDownload,
  AiOutlineReload,
  AiOutlineSearch,
  AiOutlineFilter,
  AiOutlineEye,
  AiOutlineClose,
} from 'react-icons/ai';
import Papa from 'papaparse';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useTenantTemplate } from '../hooks/useTenantTemplate';
import { useToast } from '../hooks/useToast';
import {
  MONTHS_LONG,
  formatRupiah,
  formatDate,
  formatPeriodShort,
  billStatusLabel,
  canViewFinancialReports,
} from '../services/dataHelpers';
import {
  fetchRunningBalance,
  fetchMonthlyFinance,
  fetchNonIplIncomes,
  fetchEvents,
} from '../services/dataService';
import Modal from '../components/Modal';
import { FinancialOverviewHero } from '../components/finance';

const PIE_COLORS = ['#1a3d2e', '#d4af37', '#e2c462'];
const FISCAL_YEAR_START = 2026;
const YEARLY_REQUEST_CONCURRENCY = 3;

function getGoogleDriveThumbnail(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }
  return null;
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function getExpenseAttachmentUrl(expense) {
  return (
    expense?.receipt_file_url ||
    expense?.receipt_url ||
    expense?.file_url ||
    expense?.attachment_url ||
    expense?.receipt_file ||
    ''
  );
}

function getAttachmentThumbnailUrl(url) {
  if (!isHttpUrl(url)) return '';
  return getGoogleDriveThumbnail(url) || url;
}

function normalizeMonthlyFinance(value) {
  const data = value?.data || value;
  if (!data || typeof data !== 'object' || !data.report || typeof data.report !== 'object') {
    throw new Error('Data laporan keuangan dari API tidak lengkap.');
  }
  if (!Array.isArray(data.expenses) || !Array.isArray(data.cashPayments)) {
    throw new Error('Detail pemasukan atau pengeluaran dari API tidak valid.');
  }
  return data;
}

function normalizeRunningBalance(value) {
  const data = value?.data || value;
  if (!data || !Array.isArray(data.chain)) {
    throw new Error('Data saldo berjalan dari API tidak valid.');
  }
  return data.chain;
}

function isReportApiEmptyResponse(error) {
  return error?.code === 'REPORT_API_EMPTY_RESPONSE';
}

function sumAmounts(items = []) {
  return items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
}

function createPeriod(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildMonthlyFallbackChain(finData, year, month, openingBalance = 15000000) {
  const expenses = Array.isArray(finData?.expenses) ? finData.expenses : [];
  const cashPayments = Array.isArray(finData?.cashPayments) ? finData.cashPayments : [];
  const totalIncome = cashPayments.length > 0
    ? sumAmounts(cashPayments)
    : Number(finData?.report?.totalCollected || 0);
  const totalExpense = sumAmounts(expenses);

  return [{
    period: createPeriod(year, month),
    year,
    month,
    openingBalance,
    totalIncome,
    totalExpense,
    closingBalance: openingBalance + totalIncome - totalExpense,
    incomeCount: cashPayments.length,
    expenseCount: expenses.length,
  }];
}

function buildYearlyFallbackChain(financeByPeriod, periods, openingBalance = 15000000) {
  let runningBalance = openingBalance;

  return periods.map(({ year, month }) => {
    const finData = financeByPeriod[createPeriod(year, month)];
    const chainItem = buildMonthlyFallbackChain(finData, year, month, runningBalance)[0];
    runningBalance = chainItem.closingBalance;
    return chainItem;
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export default function Reports() {
  const params = useParams();
  const { role, session } = useAuth();
  const { currentTenant, userTenants } = useTenant();
  const activeTenantId = params.tenantId || currentTenant?.id || userTenants?.[0]?.id || null;
  const template = useTenantTemplate(currentTenant?.type || 'rt_rw');
  const toast = useToast();

  const years = useMemo(() => {
    const lastYear = Math.max(new Date().getFullYear() + 2, FISCAL_YEAR_START + 2);
    return Array.from(
      { length: lastYear - FISCAL_YEAR_START + 1 },
      (_, index) => FISCAL_YEAR_START + index
    );
  }, []);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [reportType, setReportType] = useState('monthly'); // 'monthly' | 'yearly' | 'non_ipl'
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // States to hold reports data
  const [report, setReport] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [nonIplIncomes, setNonIplIncomes] = useState([]);
  const [events, setEvents] = useState([]);
  const [runningChain, setRunningChain] = useState([]);

  // Non-IPL filter states
  const [nonIplScopeFilter, setNonIplScopeFilter] = useState('all'); // 'all' | 'general' | 'event'
  const [nonIplCategoryFilter, setNonIplCategoryFilter] = useState('all');
  const [nonIplSearch, setNonIplSearch] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  // Cash IPL payments sorting & search states
  const [cashSortField, setCashSortField] = useState('paidAt'); // 'paidAt' | 'unit' | 'residentName' | 'period' | 'amount' | 'method'
  const [cashSortOrder, setCashSortOrder] = useState('desc'); // 'asc' | 'desc'
  const [cashSearch, setCashSearch] = useState('');

  const handleCashSort = (field) => {
    if (cashSortField === field) {
      setCashSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCashSortField(field);
      setCashSortOrder('asc');
    }
  };

  const period = `${year}-${String(month).padStart(2, '0')}`;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      if (reportType === 'monthly' || reportType === 'non_ipl') {
        const [finRes, nonIplRes, eventsRes] = await Promise.all([
          fetchMonthlyFinance(session?.access_token, { year, month, tenantId: activeTenantId }),
          fetchNonIplIncomes(session?.access_token, {
            from: `${year}-${String(month).padStart(2, '0')}-01`,
            to: `${year}-${String(month).padStart(2, '0')}-31`,
          }).catch(() => []),
          fetchEvents(session?.access_token).catch(() => []),
        ]);
        const finData = normalizeMonthlyFinance(finRes);
        setReport(finData.report);
        setExpenses(finData.expenses);
        setCashPayments(finData.cashPayments);
        setNonIplIncomes(Array.isArray(nonIplRes) && nonIplRes.length > 0 ? nonIplRes : (finData.nonIplIncomes || []));
        setEvents(Array.isArray(eventsRes) ? eventsRes : []);

        try {
          const balRes = await fetchRunningBalance(session?.access_token, { year, month, tenantId: activeTenantId });
          setRunningChain(normalizeRunningBalance(balRes));
        } catch (balanceError) {
          if (!isReportApiEmptyResponse(balanceError)) {
            throw balanceError;
          }
          setRunningChain(buildMonthlyFallbackChain(finData, year, month));
        }
      } else {
        // Yearly mode: July Y to June Y+1
        const monthsOfFiscalYear = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
        const periods = monthsOfFiscalYear.map((m) => ({
          year: m >= 7 ? year : year + 1,
          month: m
        }));

        const [results, nonIplYearlyRes, eventsRes] = await Promise.all([
          mapWithConcurrency(periods, YEARLY_REQUEST_CONCURRENCY, ({ year: y, month: m }) => {
            return fetchMonthlyFinance(session?.access_token, { year: y, month: m, tenantId: activeTenantId });
          }),
          fetchNonIplIncomes(session?.access_token, {
            from: `${year}-07-01`,
            to: `${year + 1}-06-30`,
          }).catch(() => []),
          fetchEvents(session?.access_token).catch(() => []),
        ]);

        setNonIplIncomes(Array.isArray(nonIplYearlyRes) ? nonIplYearlyRes : []);
        setEvents(Array.isArray(eventsRes) ? eventsRes : []);

        // Aggregate 12 months data
        let totalBilled = 0;
        let totalCollected = 0;
        let paidCount = 0;
        let billCount = 0;
        const byBlockMap = {};
        const aggregatedDetails = [];
        const aggregatedExpenses = [];
        const aggregatedPayments = [];
        const financeByPeriod = {};

        results.forEach((res, index) => {
          const data = normalizeMonthlyFinance(res);
          const periodInfo = periods[index];
          financeByPeriod[createPeriod(periodInfo.year, periodInfo.month)] = data;
          const rep = data.report || {};
          
          totalBilled += Number(rep.totalBilled || 0);
          totalCollected += Number(rep.totalCollected || 0);
          paidCount += Number(rep.paidCount || 0);
          billCount += Number(rep.billCount || 0);

          if (rep.byBlock) {
            rep.byBlock.forEach((b) => {
              if (!byBlockMap[b.block]) {
                byBlockMap[b.block] = { block: b.block, collected: 0, billed: 0 };
              }
              byBlockMap[b.block].collected += Number(b.collected || 0);
              byBlockMap[b.block].billed += Number(b.billed || 0);
            });
          }

          if (rep.details) {
            aggregatedDetails.push(...rep.details);
          }
          if (data.expenses) {
            aggregatedExpenses.push(...data.expenses);
          }
          if (data.cashPayments) {
            aggregatedPayments.push(...data.cashPayments);
          }
        });

        // Group details by unit so that the unit list has unique rows showing yearly summary
        const groupedDetailsMap = {};
        aggregatedDetails.forEach((d) => {
          const key = `${d.block}-${d.unitNumber}`;
          if (!groupedDetailsMap[key]) {
            groupedDetailsMap[key] = {
              unitId: d.unit_id,
              unitNumber: d.unitNumber,
              block: d.block,
              residentName: d.residentName,
              amount: 0,
              paidCount: 0,
              billedCount: 0,
            };
          }
          groupedDetailsMap[key].amount += d.amount;
          groupedDetailsMap[key].billedCount += 1;
          if (d.status === 'paid') {
            groupedDetailsMap[key].paidCount += 1;
          }
        });

        const groupedDetails = Object.values(groupedDetailsMap).map((d) => {
          let statusLabel = 'Belum Bayar';
          if (d.paidCount === d.billedCount) {
            statusLabel = 'paid'; // Lunas
          } else if (d.paidCount > 0) {
            statusLabel = 'partially_paid'; // Bayar Sebagian (Custom status for yearly)
          } else {
            statusLabel = 'pending'; // Belum Bayar
          }
          return {
            unit_id: d.unitId,
            unitNumber: d.unitNumber,
            block: d.block,
            residentName: d.residentName,
            amount: d.amount,
            status: statusLabel,
            paidAt: null, // Multiple payments, so null
            paidCount: d.paidCount,
            billedCount: d.billedCount
          };
        });

        // Sort details by block/unit
        groupedDetails.sort((a, b) => {
          const blockCompare = String(a.block || '').localeCompare(String(b.block || ''), 'id-ID', { numeric: true, sensitivity: 'base' });
          if (blockCompare !== 0) return blockCompare;
          return String(a.unitNumber || '').localeCompare(String(b.unitNumber || ''), 'id-ID', { numeric: true, sensitivity: 'base' });
        });

        const totalOutstanding = totalBilled - totalCollected;
        const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
        const byBlock = Object.values(byBlockMap).sort((a, b) => a.block.localeCompare(b.block));

        setReport({
          billCount,
          paidCount,
          totalBilled,
          totalCollected,
          totalOutstanding,
          collectionRate,
          byBlock,
          details: groupedDetails
        });

        // Sort expenses and payments by date
        aggregatedExpenses.sort((a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime());
        aggregatedPayments.sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());

        setExpenses(aggregatedExpenses);
        setCashPayments(aggregatedPayments);

        try {
          // Fetch running balance up to the end of the fiscal year (June Y+1) to get the correct balance chain
          const balRes = await fetchRunningBalance(session?.access_token, { year: year + 1, month: 6 });
          setRunningChain(normalizeRunningBalance(balRes));
        } catch (balanceError) {
          if (!isReportApiEmptyResponse(balanceError)) {
            throw balanceError;
          }
          setRunningChain(buildYearlyFallbackChain(financeByPeriod, periods));
        }
      }
    } catch (err) {
      setLoadError(err.message || 'Gagal memuat data laporan keuangan.');
      toast.error(err.message || 'Gagal memuat data laporan keuangan.');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, year, month, reportType, toast]);

  useEffect(() => {
    if (canViewFinancialReports(role)) {
      loadData();
    }
  }, [loadData, role]);

  const periodLabel = useMemo(() => {
    if (reportType === 'monthly' || reportType === 'non_ipl') {
      return `${MONTHS_LONG[month - 1]} ${year}`;
    }
    return `Juli ${year} - Juni ${year + 1}`;
  }, [reportType, year, month]);

  const eventNameMap = useMemo(() => {
    const map = {};
    (events || []).forEach((ev) => {
      if (ev && ev.id) map[ev.id] = ev.name || ev.title || 'Event';
    });
    return map;
  }, [events]);

  const nonIplCategories = useMemo(() => {
    const cats = new Set();
    (nonIplIncomes || []).forEach((i) => {
      if (i && i.category) cats.add(i.category);
    });
    return Array.from(cats);
  }, [nonIplIncomes]);

  const filteredNonIplIncomes = useMemo(() => {
    return (nonIplIncomes || []).filter((item) => {
      if (nonIplScopeFilter !== 'all' && item.scope !== nonIplScopeFilter) return false;
      if (nonIplCategoryFilter !== 'all' && item.category !== nonIplCategoryFilter) return false;
      if (nonIplSearch.trim()) {
        const q = nonIplSearch.toLowerCase();
        const matchSource = String(item.source_name || '').toLowerCase().includes(q);
        const matchDesc = String(item.description || '').toLowerCase().includes(q);
        const matchCat = String(item.category || '').toLowerCase().includes(q);
        const matchEvent = item.event_id && String(eventNameMap[item.event_id] || '').toLowerCase().includes(q);
        if (!matchSource && !matchDesc && !matchCat && !matchEvent) return false;
      }
      return true;
    });
  }, [nonIplIncomes, nonIplScopeFilter, nonIplCategoryFilter, nonIplSearch, eventNameMap]);

  const nonIplSummary = useMemo(() => {
    const list = nonIplIncomes || [];
    const total = list.reduce((s, i) => s + Number(i.amount || 0), 0);
    const generalTotal = list.filter((i) => i.scope !== 'event').reduce((s, i) => s + Number(i.amount || 0), 0);
    const eventTotal = list.filter((i) => i.scope === 'event').reduce((s, i) => s + Number(i.amount || 0), 0);
    const qrisTotal = list.filter((i) => i.payment_method === 'qris').reduce((s, i) => s + Number(i.amount || 0), 0);
    const transferTotal = list.filter((i) => i.payment_method === 'bank_transfer').reduce((s, i) => s + Number(i.amount || 0), 0);
    const cashTotal = list.filter((i) => i.payment_method === 'cash').reduce((s, i) => s + Number(i.amount || 0), 0);

    const categoryMap = {};
    list.forEach((i) => {
      const cat = i.category || 'Lainnya';
      categoryMap[cat] = (categoryMap[cat] || 0) + Number(i.amount || 0);
    });
    const categoryChartData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

    const methodPieData = [
      { name: 'QRIS', value: qrisTotal, color: '#10b981' },
      { name: 'Transfer', value: transferTotal, color: '#3b82f6' },
      { name: 'Tunai', value: cashTotal, color: '#d4af37' },
    ].filter((p) => p.value > 0);

    return {
      total,
      generalTotal,
      eventTotal,
      qrisTotal,
      transferTotal,
      cashTotal,
      count: list.length,
      categoryChartData,
      methodPieData,
    };
  }, [nonIplIncomes]);

  const sortedCashPayments = useMemo(() => {
    let list = (Array.isArray(cashPayments) ? [...cashPayments] : []).filter((p) => {
      const blockStr = String(p.block || '').toUpperCase();
      const numStr = String(p.unitNumber || '').toUpperCase();
      if (blockStr === 'Z_DEMO' || blockStr.includes('DEMO') || numStr.includes('DEMO_HIDDEN') || p.unitId === 5) {
        return false;
      }
      return true;
    });

    if (cashSearch.trim()) {
      const q = cashSearch.toLowerCase();
      list = list.filter((p) => {
        const unitStr = `${p.block || ''}/${p.unitNumber || ''}`.toLowerCase();
        const resStr = String(p.residentName || '').toLowerCase();
        const periodStr = String(p.period || '').toLowerCase();
        const methodStr = String(p.method || '').toLowerCase();
        const amountStr = String(p.amount || '');
        return (
          unitStr.includes(q) ||
          resStr.includes(q) ||
          periodStr.includes(q) ||
          methodStr.includes(q) ||
          amountStr.includes(q)
        );
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (cashSortField === 'paidAt') {
        const aTime = new Date(a.paidAt || 0).getTime();
        const bTime = new Date(b.paidAt || 0).getTime();
        cmp = aTime - bTime;
      } else if (cashSortField === 'unit') {
        const aBlock = String(a.block || '');
        const bBlock = String(b.block || '');
        const blockCmp = aBlock.localeCompare(bBlock, 'id-ID', { numeric: true });
        if (blockCmp !== 0) {
          cmp = blockCmp;
        } else {
          cmp = String(a.unitNumber || '').localeCompare(String(b.unitNumber || ''), 'id-ID', { numeric: true });
        }
      } else if (cashSortField === 'residentName') {
        cmp = String(a.residentName || '').localeCompare(String(b.residentName || ''), 'id-ID');
      } else if (cashSortField === 'period') {
        cmp = String(a.period || '').localeCompare(String(b.period || ''));
      } else if (cashSortField === 'amount') {
        cmp = Number(a.amount || 0) - Number(b.amount || 0);
      } else if (cashSortField === 'method') {
        cmp = String(a.method || '').localeCompare(String(b.method || ''));
      }
      return cashSortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [cashPayments, cashSortField, cashSortOrder, cashSearch]);

  // Running Balance dan Rincian untuk periode terpilih
  const activeBalance = useMemo(() => {
    if (reportType === 'monthly' || reportType === 'non_ipl') {
      const periodStr = `${year}-${String(month).padStart(2, '0')}`;
      const matched = runningChain.find(item => item.period === periodStr);
      return matched || {
        period: periodStr,
        year,
        month,
        openingBalance: 15000000,
        totalIncome: 0,
        totalExpense: 0,
        closingBalance: 15000000,
        incomeCount: 0,
        expenseCount: 0,
      };
    } else {
      // Yearly: July Y to June Y+1
      const startPeriod = `${year}-07`;
      const endPeriod = `${year + 1}-06`;
      
      const startMonthData = runningChain.find(item => item.period === startPeriod);
      const endMonthData = runningChain.find(item => item.period === endPeriod);
      
      // Sum incomes and expenses within range
      let totalIncome = 0;
      let totalExpense = 0;
      runningChain.forEach(item => {
        if (item.period >= startPeriod && item.period <= endPeriod) {
          totalIncome += Number(item.totalIncome || 0);
          totalExpense += Number(item.totalExpense || 0);
        }
      });
      
      const opening = startMonthData ? startMonthData.openingBalance : 15000000;
      const closing = endMonthData ? endMonthData.closingBalance : (opening + totalIncome - totalExpense);

      return {
        period: `${year}/${year+1}`,
        year,
        month: 0,
        openingBalance: opening,
        totalIncome,
        totalExpense,
        closingBalance: closing,
        incomeCount: 0,
        expenseCount: 0,
      };
    }
  }, [runningChain, year, month, reportType]);

  const totalCashIn = activeBalance.totalIncome;
  const totalExpenses = activeBalance.totalExpense;
  // New finance fields are optional so the existing IPL report contract and
  // baseline remain unchanged until the backend starts returning them.
  const iplIncome = Number(activeBalance.iplIncome ?? activeBalance.ipl_income ?? report?.iplIncome ?? report?.ipl_income ?? totalCashIn);
  const nonIplGeneralIncome = Number(activeBalance.nonIplGeneralIncome ?? activeBalance.non_ipl_general_income ?? report?.nonIplGeneralIncome ?? report?.non_ipl_general_income ?? 0);
  const eventIncome = Number(activeBalance.eventIncome ?? activeBalance.event_income ?? report?.eventIncome ?? report?.event_income ?? 0);
  const eventExpense = Number(activeBalance.eventExpense ?? activeBalance.event_expense ?? report?.eventExpense ?? report?.event_expense ?? 0);
  const hasFinanceBreakdown = [nonIplGeneralIncome, eventIncome, eventExpense].some((value) => value !== 0)
    || activeBalance.iplIncome != null || activeBalance.ipl_income != null;
  const netBalance = totalCashIn - totalExpenses;
  const openingBalance = activeBalance.openingBalance;
  const closingBalance = activeBalance.closingBalance;

  // Data tren untuk AreaChart
  const trenData = useMemo(() => {
    if (reportType === 'monthly') {
      return runningChain.map((item) => {
        const [y, m] = item.period.split('-');
        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return {
          name: `${monthsShort[parseInt(m) - 1]} ${y.substring(2)}`,
          Pemasukan: item.totalIncome,
          Pengeluaran: item.totalExpense,
          Saldo: item.closingBalance,
        };
      });
    } else {
      const startPeriod = `${year}-07`;
      const endPeriod = `${year + 1}-06`;
      const filtered = runningChain.filter(item => item.period >= startPeriod && item.period <= endPeriod);
      return filtered.map((item) => {
        const [y, m] = item.period.split('-');
        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return {
          name: `${monthsShort[parseInt(m) - 1]} ${y.substring(2)}`,
          Pemasukan: item.totalIncome,
          Pengeluaran: item.totalExpense,
          Saldo: item.closingBalance,
        };
      });
    }
  }, [runningChain, year, reportType]);

  // Data untuk bar chart per blok
  const blockData = useMemo(() => {
    if (!report || !report.byBlock) return [];
    return report.byBlock.map((b) => ({
      name: `Blok ${b.block}`,
      Terkumpul: b.collected,
      Tunggakan: b.billed - b.collected,
    }));
  }, [report]);

  // Data untuk pie chart lunas/belum
  const pieData = useMemo(() => {
    if (!report) return [];
    return [
      { name: 'Lunas', value: report.paidCount, color: '#1a3d2e' },
      { name: 'Belum/Tunggakan', value: report.billCount - report.paidCount, color: '#d4af37' },
    ];
  }, [report]);

  // Daftar bulan: tampilkan 12 bulan penuh
  const availableMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Financial reports are visible to koordinator, bendahara, admin, and admin viewer.
  if (!canViewFinancialReports(role)) {
    return <Navigate to="/" replace />;
  }

  const handleExportCSV = () => {
    if (reportType === 'non_ipl') {
      handleExportNonIplCSV();
      return;
    }
    if (!report) return;
    const isYearly = reportType === 'yearly';
    const header = isYearly 
      ? ['Unit', 'Blok', 'Penghuni', 'Total Billed', 'Bulan Lunas', 'Status']
      : ['Unit', 'Blok', 'Penghuni', 'Jumlah', 'Status', 'Tanggal Bayar'];
      
    const rows = report.details.map((d) => {
      if (isYearly) {
        return [
          d.unitNumber, 
          d.block, 
          d.residentName, 
          d.amount, 
          `${d.paidCount}/${d.billedCount}`, 
          d.status === 'paid' ? 'Lunas' : d.status === 'partially_paid' ? 'Bayar Sebagian' : 'Belum Bayar'
        ];
      } else {
        return [
          d.unitNumber, 
          d.block, 
          d.residentName, 
          d.amount, 
          billStatusLabel(d.status), 
          d.paidAt ? formatDate(d.paidAt) : '-'
        ];
      }
    });
    const csv = Papa.unparse({
      fields: header,
      data: [
        ...rows,
        [],
        ['Ringkasan', '', '', '', '', ''],
        ['Total Tagihan', '', '', '', '', report.totalBilled],
        ['Total Terkumpul', '', '', '', '', report.totalCollected],
        ['Tunggakan', '', '', '', '', report.totalOutstanding],
        ['% Koleksi', '', '', '', '', report.collectionRate.toFixed(1) + '%'],
      ],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan_ipl_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV IPL berhasil di-export.');
  };

  const handleExportNonIplCSV = () => {
    if (!filteredNonIplIncomes.length) {
      toast.info('Tidak ada data pemasukan non-IPL untuk diekspor.');
      return;
    }
    const header = ['Tanggal', 'Lingkup', 'Event', 'Kategori', 'Sumber / Pembayar', 'Keterangan', 'Metode', 'Status', 'Jumlah (Rp)'];
    const rows = filteredNonIplIncomes.map((i) => [
      formatDate(i.income_date || i.date),
      i.scope === 'event' ? 'Kegiatan Event' : 'Kas Umum',
      i.event_id ? (eventNameMap[i.event_id] || i.event_id) : '-',
      i.category || '-',
      i.source_name || '-',
      i.description || '-',
      methodLabel(i.payment_method),
      i.status === 'verified' ? 'Terverifikasi' : i.status === 'rejected' ? 'Ditolak' : 'Menunggu Verifikasi',
      Number(i.amount || 0)
    ]);
    const csv = Papa.unparse({
      fields: header,
      data: [
        ...rows,
        [],
        ['Ringkasan', '', '', '', '', '', '', '', ''],
        ['Total Pemasukan Non-IPL', '', '', '', '', '', '', '', nonIplSummary.total],
        ['Kas Umum', '', '', '', '', '', '', '', nonIplSummary.generalTotal],
        ['Pemasukan Event', '', '', '', '', '', '', '', nonIplSummary.eventTotal],
        ['Metode QRIS', '', '', '', '', '', '', '', nonIplSummary.qrisTotal],
        ['Metode Transfer', '', '', '', '', '', '', '', nonIplSummary.transferTotal],
        ['Metode Tunai', '', '', '', '', '', '', '', nonIplSummary.cashTotal],
      ],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan_pemasukan_non_ipl_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV Pemasukan Non-IPL berhasil di-export.');
  };

  const handlePrint = () => {
    toast.info('Membuka dialog print/PDF...');
    setTimeout(() => window.print(), 300);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-t-transparent"></div>
        <p className="text-xs text-slate-500 font-medium">Memuat data laporan keuangan...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pv-card p-8 text-center space-y-4 border border-red-200 bg-red-50/50">
        <p className="text-sm text-red-600 font-semibold">{loadError}</p>
        <button onClick={loadData} className="pv-btn-primary mx-auto text-xs font-semibold px-4 py-2">
          <AiOutlineReload /> Coba Lagi
        </button>
      </div>
    );
  }

  if (!report && reportType !== 'non_ipl') {
    return (
      <div className="pv-card p-8 text-center text-slate-500 text-sm">
        Tidak ada data laporan keuangan untuk periode ini.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Tab Selector */}
      <div className="no-print flex flex-wrap border-b border-slate-200 mb-4 gap-1">
        <button
          onClick={() => setReportType('monthly')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            reportType === 'monthly'
              ? 'border-forest-800 text-forest-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📊 Laporan Kas & IPL
        </button>
        <button
          onClick={() => setReportType('non_ipl')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            reportType === 'non_ipl'
              ? 'border-forest-800 text-forest-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🏷️ Laporan Pemasukan Non-IPL & Donasi
        </button>
        <button
          onClick={() => setReportType('yearly')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            reportType === 'yearly'
              ? 'border-forest-800 text-forest-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📆 Laporan Tahunan (Juli - Juni)
        </button>
      </div>

      {/* Header & filter */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {reportType === 'non_ipl'
              ? 'Laporan Pemasukan Non-IPL & Donasi'
              : reportType === 'yearly'
              ? 'Laporan Keuangan Tahunan'
              : 'Laporan Keuangan Kas & IPL'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Periode: <span className="font-semibold text-slate-700">{periodLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reportType !== 'yearly' && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="pv-input w-auto text-xs py-1.5"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>{MONTHS_LONG[m - 1]}</option>
              ))}
            </select>
          )}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="pv-input w-auto text-xs py-1.5"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {reportType === 'yearly' ? `Tahun Buku ${y}/${y + 1}` : y}
              </option>
            ))}
          </select>
          <button onClick={handlePrint} className="pv-btn-ghost text-xs">
            <AiOutlinePrinter /> PDF
          </button>
          <button
            onClick={reportType === 'non_ipl' ? handleExportNonIplCSV : handleExportCSV}
            className="pv-btn-ghost text-xs"
          >
            <AiOutlineDownload /> CSV {reportType === 'non_ipl' ? 'Non-IPL' : ''}
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAMPILAN KHUSUS: LAPORAN PEMASUKAN NON-IPL & DONASI           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {reportType === 'non_ipl' ? (
        <div className="space-y-5">
          {/* Summary Cards Non-IPL */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Ringkasan Pemasukan Non-IPL ({periodLabel})
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard
                label="Total Pemasukan Non-IPL"
                value={formatRupiah(nonIplSummary.total)}
                icon="💰"
                color="bg-white border border-slate-200 text-slate-900 shadow-xs"
              />
              <SummaryCard
                label="Kas Umum (General)"
                value={formatRupiah(nonIplSummary.generalTotal)}
                icon="🏛️"
                color="bg-white border border-slate-200 text-blue-700 shadow-xs"
              />
              <SummaryCard
                label="Kegiatan / Event"
                value={formatRupiah(nonIplSummary.eventTotal)}
                icon="🎪"
                color="bg-white border border-slate-200 text-purple-700 shadow-xs"
              />
              <SummaryCard
                label="Total Transaksi"
                value={`${nonIplSummary.count} Transaksi`}
                icon="🧾"
                color="bg-white border border-slate-200 text-emerald-700 shadow-xs"
              />
            </div>
          </div>

          {/* Breakdown Metode Pembayaran */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="pv-card p-4 flex items-center justify-between border border-slate-200 bg-white shadow-xs">
              <div>
                <p className="text-xs text-slate-500 font-semibold">💳 QRIS (DOKU Production)</p>
                <p className="text-base font-extrabold text-slate-900 mt-1">{formatRupiah(nonIplSummary.qrisTotal)}</p>
              </div>
              <span className="pv-badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">QRIS</span>
            </div>
            <div className="pv-card p-4 flex items-center justify-between border border-slate-200 bg-white shadow-xs">
              <div>
                <p className="text-xs text-slate-500 font-semibold">🏦 Transfer Bank</p>
                <p className="text-base font-extrabold text-slate-900 mt-1">{formatRupiah(nonIplSummary.transferTotal)}</p>
              </div>
              <span className="pv-badge bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">Transfer</span>
            </div>
            <div className="pv-card p-4 flex items-center justify-between border border-slate-200 bg-white shadow-xs">
              <div>
                <p className="text-xs text-slate-500 font-semibold">💵 Tunai / Kasir</p>
                <p className="text-base font-extrabold text-slate-900 mt-1">{formatRupiah(nonIplSummary.cashTotal)}</p>
              </div>
              <span className="pv-badge bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">Tunai</span>
            </div>
          </div>

          {/* Visual Charts Non-IPL */}
          {nonIplSummary.count > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="pv-card p-5 lg:col-span-2 border border-slate-200 bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-4">
                  Pemasukan per Kategori
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={nonIplSummary.categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    />
                    <Tooltip
                      formatter={(v) => formatRupiah(v)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="value" name="Nominal (Rp)" fill="#1a3d2e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="pv-card p-5 border border-slate-200 bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-4">
                  Distribusi Metode Bayar
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={nonIplSummary.methodPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {nonIplSummary.methodPieData.map((entry, i) => (
                        <PieCell key={`cell-${i}`} fill={['#1a3d2e', '#d4af37', '#3b82f6', '#10b981'][i % 4]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatRupiah(v)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="pv-card p-4 no-print flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                <button
                  onClick={() => setNonIplScopeFilter('all')}
                  className={`px-3 py-1.5 font-bold transition-colors ${
                    nonIplScopeFilter === 'all' ? 'bg-forest-800 text-gold-400' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Semua Lingkup
                </button>
                <button
                  onClick={() => setNonIplScopeFilter('general')}
                  className={`px-3 py-1.5 font-bold transition-colors border-l border-slate-200 ${
                    nonIplScopeFilter === 'general' ? 'bg-forest-800 text-gold-400' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  🏛️ Kas Umum
                </button>
                <button
                  onClick={() => setNonIplScopeFilter('event')}
                  className={`px-3 py-1.5 font-bold transition-colors border-l border-slate-200 ${
                    nonIplScopeFilter === 'event' ? 'bg-forest-800 text-gold-400' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  🎪 Event / Kegiatan
                </button>
              </div>

              {nonIplCategories.length > 0 && (
                <select
                  value={nonIplCategoryFilter}
                  onChange={(e) => setNonIplCategoryFilter(e.target.value)}
                  className="pv-input w-auto text-xs py-1.5 border-slate-200"
                >
                  <option value="all">Semua Kategori</option>
                  {nonIplCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="relative">
              <AiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input
                type="text"
                placeholder="Cari pembayar / keterangan / event..."
                value={nonIplSearch}
                onChange={(e) => setNonIplSearch(e.target.value)}
                className="pv-input text-xs pl-8 py-1.5 w-full md:w-64 border-slate-200"
              />
            </div>
          </div>

          {/* Tabel Rincian Non-IPL */}
          <div className="pv-card overflow-hidden border border-slate-200">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Rincian Transaksi Pemasukan Non-IPL & Donasi — {periodLabel}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Daftar transaksi penerimaan di luar tagihan iuran IPL warga.
                </p>
              </div>
              <span className="text-xs text-slate-600 font-semibold">
                {filteredNonIplIncomes.length} Transaksi
              </span>
            </div>

            {filteredNonIplIncomes.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                Belum ada transaksi pemasukan non-IPL yang sesuai dengan kriteria filter pada {periodLabel}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100/90 border-b border-slate-200 text-xs uppercase text-slate-700 font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Tgl Masuk</th>
                      <th className="px-4 py-3 text-left">Lingkup / Event</th>
                      <th className="px-4 py-3 text-left">Kategori</th>
                      <th className="px-4 py-3 text-left">Sumber / Pembayar</th>
                      <th className="px-4 py-3 text-left">Keterangan</th>
                      <th className="px-4 py-3 text-center">Metode</th>
                      <th className="px-4 py-3 text-center">Bukti</th>
                      <th className="px-4 py-3 text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNonIplIncomes.map((item) => {
                      const attachmentUrl = getIncomeAttachmentUrl(item);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap font-medium">
                            {formatDate(item.income_date || item.date)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {item.scope === 'event' ? (
                              <span className="pv-badge bg-purple-50 text-purple-700 border border-purple-200">
                                🎪 {item.event_id ? (eventNameMap[item.event_id] || 'Event') : 'Event'}
                              </span>
                            ) : (
                              <span className="pv-badge bg-blue-50 text-blue-700 border border-blue-200">
                                🏛️ Kas Umum
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-900 font-bold">
                            {item.category || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-900 font-semibold">
                            {item.source_name || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">
                            {item.description || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <span className={`pv-badge ${methodBadgeColor(item.payment_method)}`}>
                              {methodLabel(item.payment_method)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {attachmentUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(attachmentUrl)}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                                title="Lihat Bukti Transfer"
                              >
                                <AiOutlinePaperClip /> Foto
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                            + {formatRupiah(item.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td colSpan={7} className="px-4 py-3 text-slate-700 text-xs uppercase tracking-wider">
                        TOTAL PEMASUKAN NON-IPL TAMPIL
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-extrabold text-base whitespace-nowrap">
                        {formatRupiah(filteredNonIplIncomes.reduce((s, i) => s + Number(i.amount || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────── */
        /* TAMPILAN STANDARD: LAPORAN KAS & IPL (BULANAN / TAHUNAN)    */
        /* ─────────────────────────────────────────────────────────── */
        <>
          {report.billCount === 0 ? (
            <div className="pv-card p-10 text-center text-slate-400 text-sm border border-slate-200">
              Tidak ada data tagihan untuk periode {periodLabel}.
            </div>
          ) : (
            <>
              {/* Section A: Alur Kas (Running Balance) */}
              <FinancialOverviewHero
                openingBalance={openingBalance}
                totalIncome={totalCashIn}
                totalExpense={totalExpenses}
                closingBalance={closingBalance}
                periodLabel={periodLabel}
                onPrint={handlePrint}
                onExportCsv={handleExportCSV}
              />

              {hasFinanceBreakdown && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <SummaryCard label="Pemasukan IPL" value={formatRupiah(iplIncome)} icon="IPL" color="bg-white border border-slate-200 text-emerald-700 shadow-xs" />
                  <SummaryCard label="Non-IPL Umum" value={formatRupiah(nonIplGeneralIncome)} icon="UM" color="bg-white border border-slate-200 text-blue-700 shadow-xs" />
                  <SummaryCard label="Pemasukan Event" value={formatRupiah(eventIncome)} icon="EV" color="bg-white border border-slate-200 text-purple-700 shadow-xs" />
                  <SummaryCard label="Pengeluaran Event" value={formatRupiah(eventExpense)} icon="EX" color="bg-white border border-slate-200 text-red-700 shadow-xs" />
                </div>
              )}

              {/* Section B: Kinerja Tagihan IPL (Koleksi) */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Koleksi Tagihan IPL</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SummaryCard label="Total Tagihan" value={formatRupiah(report.totalBilled)} icon="📋" color="bg-white border border-slate-200 text-slate-900 shadow-xs" />
                  <SummaryCard label="Terkumpul" value={formatRupiah(report.totalCollected)} icon="✅" color="bg-white border border-slate-200 text-emerald-700 shadow-xs" />
                  <SummaryCard label="Tunggakan" value={formatRupiah(report.totalOutstanding)} icon="⏳" color="bg-white border border-slate-200 text-amber-700 shadow-xs" />
                  <SummaryCard label="% Koleksi" value={`${report.collectionRate.toFixed(1)}%`} icon="📊" color="bg-white border border-slate-200 text-blue-700 shadow-xs" />
                </div>
              </div>

              {/* Grafik Tren Running Balance */}
              <div className="pv-card p-5 border border-slate-200 bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-4">
                  Tren Arus Kas & Saldo Kumulatif (Sejak Jul 2026)
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={trenData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    />
                    <Tooltip 
                      formatter={(v) => formatRupiah(v)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="Pemasukan" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" />
                    <Area type="monotone" dataKey="Pengeluaran" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpense)" />
                    <Area type="monotone" dataKey="Saldo" stroke="#d4af37" fillOpacity={1} fill="url(#colorBalance)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Grafik Kinerja Lainnya */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Bar chart per blok */}
                <div className="pv-card p-5 lg:col-span-2 border border-slate-200 bg-white">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">
                    Koleksi Tagihan per Blok
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={blockData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                      />
                      <Tooltip
                        formatter={(v) => formatRupiah(v)}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Terkumpul" fill="#1a3d2e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Tunggakan" fill="#d4af37" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie chart lunas/belum */}
                <div className="pv-card p-5 border border-slate-200 bg-white">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">
                    Status Pembayaran Tagihan IPL
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ value }) => value}
                        labelLine={false}
                      >
                        {pieData.map((entry, i) => (
                          <PieCell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, n) => [`${v} tagihan`, n]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabel Histori Running Balance Kumulatif */}
              <div className="pv-card overflow-hidden border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-sm font-bold text-slate-900">
                    Histori Running Balance (Sejak Juli 2026)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Perkembangan saldo kas dari bulan ke bulan secara runut. Saldo Akhir otomatis bergulir menjadi Saldo Awal bulan berikutnya.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/90 text-xs uppercase text-slate-700 font-bold tracking-wider">
                        <th className="px-4 py-3 text-left">Periode</th>
                        <th className="px-4 py-3 text-right">Saldo Awal</th>
                        <th className="px-4 py-3 text-right">Pemasukan (+)</th>
                        <th className="px-4 py-3 text-right">Pengeluaran (-)</th>
                        <th className="px-4 py-3 text-right">Saldo Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {runningChain.map((item) => {
                        const isSelectedMonth = item.year === year && item.month === month;
                        return (
                          <tr 
                            key={item.period} 
                            className={`hover:bg-slate-50/80 transition-colors ${isSelectedMonth ? 'bg-amber-50/40 font-bold' : ''}`}
                          >
                            <td className="px-4 py-2.5 text-slate-900 whitespace-nowrap">
                              {formatPeriodLabel(item.period)}
                              {isSelectedMonth && (
                                <span className="ml-2 pv-badge bg-gold-500 text-forest-900 text-[9px] font-bold">Bulan Ini</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap font-medium">
                              {formatRupiah(item.openingBalance)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-emerald-700 whitespace-nowrap font-extrabold">
                              + {formatRupiah(item.totalIncome)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-red-600 whitespace-nowrap font-bold">
                              - {formatRupiah(item.totalExpense)}
                            </td>
                            <td className={`px-4 py-2.5 text-right whitespace-nowrap font-extrabold ${item.closingBalance >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                              {formatRupiah(item.closingBalance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Laporan B: Kas Masuk IPL (basis tanggal pembayaran) ── */}
              <div className="pv-card overflow-hidden border border-slate-200">
                <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Rincian Kas Masuk IPL — {periodLabel}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Berdasarkan tanggal pembayaran, tanpa memandang periode tagihan IPL yang dilunasi. Klik judul kolom untuk mengurutkan.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 self-end md:self-auto">
                    <div className="relative">
                      <AiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <input
                        type="text"
                        placeholder="Cari unit / penghuni / periode..."
                        value={cashSearch}
                        onChange={(e) => setCashSearch(e.target.value)}
                        className="pv-input text-xs pl-7 pr-7 py-1.5 w-48 md:w-56 border-slate-200"
                      />
                      {cashSearch && (
                        <button
                          type="button"
                          onClick={() => setCashSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                        >
                          <AiOutlineClose />
                        </button>
                      )}
                    </div>
                    <span className="pv-badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs whitespace-nowrap font-bold">
                      {sortedCashPayments.length} {cashSearch ? `dari ${cashPayments.length}` : ''} Transaksi
                    </span>
                  </div>
                </div>
                {sortedCashPayments.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-sm">
                    {cashSearch
                      ? `Tidak ada transaksi pembayaran yang cocok dengan pencarian "${cashSearch}".`
                      : `Belum ada pembayaran IPL yang tercatat pada ${periodLabel}.`}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/90 text-xs uppercase text-slate-700 font-bold tracking-wider">
                          <th
                            onClick={() => handleCashSort('paidAt')}
                            className="px-4 py-3 text-left cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                            title="Urutkan berdasarkan Tanggal Bayar"
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <span>Tgl Bayar</span>
                              {cashSortField === 'paidAt' ? (
                                <span className="text-gold-600 font-bold">{cashSortOrder === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">↕</span>
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleCashSort('unit')}
                            className="px-4 py-3 text-left cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                            title="Urutkan berdasarkan Blok / Nomor Unit"
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <span>Unit</span>
                              {cashSortField === 'unit' ? (
                                <span className="text-gold-600 font-bold">{cashSortOrder === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">↕</span>
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleCashSort('residentName')}
                            className="px-4 py-3 text-left cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                            title="Urutkan berdasarkan Nama Penghuni"
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <span>Penghuni</span>
                              {cashSortField === 'residentName' ? (
                                <span className="text-gold-600 font-bold">{cashSortOrder === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">↕</span>
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleCashSort('period')}
                            className="px-4 py-3 text-left cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                            title="Urutkan berdasarkan Periode IPL"
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <span>Periode IPL</span>
                              {cashSortField === 'period' ? (
                                <span className="text-gold-600 font-bold">{cashSortOrder === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">↕</span>
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleCashSort('amount')}
                            className="px-4 py-3 text-right cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                            title="Urutkan berdasarkan Jumlah Nominal"
                          >
                            <div className="inline-flex items-center justify-end gap-1.5 w-full">
                              <span>Jumlah</span>
                              {cashSortField === 'amount' ? (
                                <span className="text-gold-600 font-bold">{cashSortOrder === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">↕</span>
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleCashSort('method')}
                            className="px-4 py-3 text-center cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                            title="Urutkan berdasarkan Metode Pembayaran"
                          >
                            <div className="inline-flex items-center justify-center gap-1.5 w-full">
                              <span>Metode</span>
                              {cashSortField === 'method' ? (
                                <span className="text-gold-600 font-bold">{cashSortOrder === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">↕</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedCashPayments.map((p) => (
                          <tr key={p.paymentId} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap font-medium">
                              {formatDate(p.paidAt)}
                            </td>
                            <td className="px-4 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                              {p.block}/{p.unitNumber}
                            </td>
                            <td className="px-4 py-2.5 text-slate-900 font-semibold">{p.residentName}</td>
                            <td className="px-4 py-2.5 text-slate-600 font-medium">{formatPeriodLabel(p.period)}</td>
                            <td className="px-4 py-2.5 text-right text-emerald-700 whitespace-nowrap font-extrabold">
                              {formatRupiah(p.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`pv-badge ${methodBadgeColor(p.method)}`}>
                                {methodLabel(p.method)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                          <td colSpan={4} className="px-4 py-3 text-slate-700 text-xs uppercase tracking-wider">
                            TOTAL KAS MASUK IPL {cashSearch ? '(HASIL FILTER)' : ''}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700 font-extrabold">
                            {formatRupiah(sortedCashPayments.reduce((s, p) => s + Number(p.amount || 0), 0))}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500 text-[11px] font-normal">
                            {sortedCashPayments.length} transaksi
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Laporan C: Pemasukan Non-IPL (Donasi, Sewa, Kegiatan) ── */}
              <div className="pv-card overflow-hidden border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Rincian Pemasukan Non-IPL & Donasi — {periodLabel}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Penerimaan kas umum dan kegiatan event di luar iuran bulanan warga.
                    </p>
                  </div>
                  <button
                    onClick={() => setReportType('non_ipl')}
                    className="no-print text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Buka Laporan Penuh Non-IPL →
                  </button>
                </div>
                {nonIplIncomes.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    Belum ada pemasukan non-IPL yang tercatat pada {periodLabel}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/90 text-xs uppercase text-slate-700 font-bold tracking-wider">
                          <th className="px-4 py-3 text-left">Tgl Masuk</th>
                          <th className="px-4 py-3 text-left">Lingkup</th>
                          <th className="px-4 py-3 text-left">Kategori</th>
                          <th className="px-4 py-3 text-left">Sumber / Pembayar</th>
                          <th className="px-4 py-3 text-center">Metode</th>
                          <th className="px-4 py-3 text-right">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {nonIplIncomes.slice(0, 10).map((i) => (
                          <tr key={i.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap font-medium">
                              {formatDate(i.income_date || i.date)}
                            </td>
                            <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                              {i.scope === 'event' ? (
                                <span className="pv-badge bg-purple-50 text-purple-700 border border-purple-200">
                                  🎪 {i.event_id ? (eventNameMap[i.event_id] || 'Event') : 'Event'}
                                </span>
                              ) : (
                                <span className="pv-badge bg-blue-50 text-blue-700 border border-blue-200">
                                  🏛️ Kas Umum
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-900 font-bold">
                              {i.category || '-'}
                            </td>
                            <td className="px-4 py-2.5 text-slate-900 font-semibold">
                              {i.source_name || '-'}
                            </td>
                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                              <span className={`pv-badge ${methodBadgeColor(i.payment_method)}`}>
                                {methodLabel(i.payment_method)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                              + {formatRupiah(i.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                          <td colSpan={5} className="px-4 py-3 text-slate-700 text-xs uppercase tracking-wider">
                            TOTAL PEMASUKAN NON-IPL
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700 font-extrabold">
                            {formatRupiah(nonIplIncomes.reduce((s, i) => s + Number(i.amount || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Section Pengeluaran ── */}
              <div className="pv-card p-5 border border-slate-200 bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-4">
                  Rincian Pengeluaran Kas — {periodLabel}
                </h3>
                {expenses.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    Tidak ada pengeluaran tercatat pada periode ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((exp) => {
                      const attachmentUrl = getExpenseAttachmentUrl(exp);
                      return (
                      <div
                        key={exp.id}
                        className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 rounded-lg px-2 transition-colors"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <AttachmentThumbnail url={attachmentUrl} />
                          <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="pv-badge bg-slate-100 text-slate-700 border border-slate-200 font-semibold">{exp.category}</span>
                            <span className="text-[11px] text-slate-500 font-medium">{formatDate(exp.date)}</span>
                          </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{exp.description}</p>
                          </div>
                        </div>
                        <span className="font-extrabold text-red-600 text-sm shrink-0">
                          − {formatRupiah(exp.amount)}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Neraca: Pemasukan vs Pengeluaran ── */}
              <div className="pv-card overflow-hidden border border-slate-200 bg-white">
                <div className="px-5 py-3.5 border-b border-slate-200 bg-white">
                  <h3 className="text-sm font-bold text-slate-900">
                    Neraca Arus Kas — {periodLabel}
                  </h3>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-600 flex items-center gap-2 font-medium">
                      <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                      Saldo Awal Periode (Carry-forward)
                    </span>
                    <span className="font-bold text-slate-900">{formatRupiah(openingBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-600 flex items-center gap-2 font-medium">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      Pemasukan IPL Periode Ini
                    </span>
                    <span className="font-bold text-emerald-700">+ {formatRupiah(cashPayments.reduce((s, p) => s + Number(p.amount || 0), 0) || iplIncome)}</span>
                  </div>
                  {nonIplIncomes.length > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-600 flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                        Pemasukan Non-IPL & Donasi
                      </span>
                      <span className="font-bold text-blue-700">+ {formatRupiah(nonIplIncomes.reduce((s, i) => s + Number(i.amount || 0), 0))}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-600 flex items-center gap-2 font-medium">
                      <span className="h-2 w-2 rounded-full bg-red-500"></span>
                      Pengeluaran Kas Periode Ini
                    </span>
                    <span className="font-bold text-red-600">− {formatRupiah(totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 mt-2 bg-slate-50 border border-slate-200 rounded-xl px-4">
                    <span className="font-bold text-slate-900">Saldo Akhir Periode</span>
                    <span className={`font-extrabold text-base ${closingBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {formatRupiah(closingBalance)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">
                    Laporan ini dihitung menggunakan basis kas masuk running balance (kumulatif), dimulai dari Juli 2026.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal Preview Gambar Bukti */}
      <Modal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title="Bukti Pembayaran"
      >
        <div className="flex flex-col items-center justify-center p-2 space-y-4">
          <img
            src={previewImage}
            alt="Bukti pembayaran"
            className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain border border-forest-100"
          />
          <div className="flex gap-2">
            <a
              href={previewImage}
              target="_blank"
              rel="noopener noreferrer"
              className="pv-btn-primary text-xs"
            >
              Buka Ukuran Penuh ↗
            </a>
            <button
              onClick={() => setPreviewImage(null)}
              className="pv-btn-ghost text-xs"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Helpers untuk Laporan B (Kas Masuk IPL & Non-IPL) ────────────

/** Format "2026-01" → "Januari 2026" untuk kolom Periode IPL. */
function formatPeriodLabel(period) {
  if (!period || typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) return period || '-';
  const [y, m] = period.split('-');
  return `${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`;
}

/** Label metode pembayaran. */
function methodLabel(method) {
  switch (method) {
    case 'qris':
      return 'QRIS';
    case 'cash':
      return 'Tunai';
    case 'bank_transfer':
      return 'Transfer';
    default:
      return method || '-';
  }
}

/** Warna badge lembut per metode pembayaran. */
function methodBadgeColor(method) {
  switch (method) {
    case 'qris':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'cash':
      return 'bg-gold-50 text-gold-700 border border-gold-200';
    case 'bank_transfer':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function getIncomeAttachmentUrl(income) {
  return (
    income?.receipt_file_url ||
    income?.receipt_url ||
    income?.file_url ||
    income?.attachment_url ||
    income?.receipt_file ||
    ''
  );
}

function AttachmentThumbnail({ url }) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = getAttachmentThumbnailUrl(url);

  if (!isHttpUrl(url)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group no-print flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-forest-100 bg-forest-50 transition-colors hover:border-gold-400"
      title="Buka lampiran asli"
    >
      {thumbnailUrl && !imageError ? (
        <img
          src={thumbnailUrl}
          alt="Lampiran pengeluaran"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          onError={() => setImageError(true)}
        />
      ) : (
        <AiOutlinePaperClip className="text-lg text-forest-500" />
      )}
    </a>
  );
}

function SummaryCard({ label, value, icon, color }) {
  return (
    <div className={`no-print rounded-xl p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-lg font-bold mt-2">{value}</p>
      <p className="text-[11px] mt-0.5 opacity-80">{label}</p>
    </div>
  );
}
