import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  fetchEventDetail,
  fetchEventFinanceReport,
  fetchMyEventAccess,
  fetchEventMembers,
  createNonIplIncome,
  createExpense,
} from '../services/dataService';
import { formatDate, formatRupiah } from '../services/dataHelpers';
import AnimatedCounter from '../components/AnimatedCounter';
import { PageHeader, Badge } from '../components/ui';

export default function EventFinance() {
  const { eventId } = useParams();
  const { role, profile, session } = useAuth();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [report, setReport] = useState(null);
  const [access, setAccess] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ income_date: new Date().toISOString().slice(0, 10), category: '', source_name: '', amount: '', payment_method: 'cash', description: '' });
  const [expenseForm, setExpenseForm] = useState({ expense_date: new Date().toISOString().slice(0, 10), category: '', amount: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, reportData, accessData, membersData] = await Promise.all([
        fetchEventDetail(session?.access_token, eventId),
        fetchEventFinanceReport(session?.access_token, { eventId }),
        fetchMyEventAccess(session?.access_token, { role, profileId: profile?.id }),
        fetchEventMembers(session?.access_token, eventId).catch(() => []),
      ]);
      setEvent(eventData);
      setReport(reportData);
      setAccess(accessData);
      setMembers(Array.isArray(membersData) ? membersData.filter(m => !m.revoked_at) : []);
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil laporan keuangan event.');
    } finally {
      setLoading(false);
    }
  }, [eventId, profile?.id, role, session?.access_token, toast]);

  useEffect(() => { load(); }, [load]);

  const assignment = (access?.events || []).find((item) => item.event_id === eventId);
  const canView = role === 'admin' || role === 'bendahara' || role === 'admin_viewer'
    || Boolean(access?.global?.can_view_all_events) || Boolean(assignment?.can_view);
  const canManageFinance = role === 'admin' || role === 'bendahara' || Boolean(access?.global?.can_manage_finance) || Boolean(assignment?.can_manage_finance);

  const leader = members.find(m => m.assignment_role === 'event_leader');
  const treasurer = members.find(m => m.assignment_role === 'event_treasurer');

  const submitIncome = async (e) => {
    e.preventDefault();
    try {
      await createNonIplIncome(session?.access_token, { ...incomeForm, amount: Number(incomeForm.amount), scope: 'event', event_id: eventId });
      toast.success('Pemasukan event berhasil dicatat.');
      setIncomeForm({ ...incomeForm, category: '', source_name: '', amount: '', description: '' });
      setShowIncomeForm(false);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal mencatat pemasukan.');
    }
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    try {
      await createExpense(session?.access_token, { ...expenseForm, amount: Number(expenseForm.amount), event_id: eventId, is_event_expense: true });
      toast.success('Pengeluaran event berhasil dicatat.');
      setExpenseForm({ ...expenseForm, category: '', amount: '', description: '' });
      setShowExpenseForm(false);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal mencatat pengeluaran.');
    }
  };

  if (loading) return <div className="pv-card p-8 text-center text-sm text-forest-500">Memuat laporan event...</div>;
  if (!canView || !event) return <div className="pv-card p-8 text-center text-sm text-red-600">Event tidak ditemukan atau tidak dapat diakses.</div>;

  let incomes = report?.incomes || [];
  let expenses = report?.expenses || [];

  if (dateFrom) {
    incomes = incomes.filter(i => i.income_date >= dateFrom);
    expenses = expenses.filter(e => (e.expense_date || e.date) >= dateFrom);
  }
  if (dateTo) {
    incomes = incomes.filter(i => i.income_date <= dateTo);
    expenses = expenses.filter(e => (e.expense_date || e.date) <= dateTo);
  }
  if (categoryFilter) {
    incomes = incomes.filter(i => i.category.toLowerCase().includes(categoryFilter.toLowerCase()));
    expenses = expenses.filter(e => e.category.toLowerCase().includes(categoryFilter.toLowerCase()));
  }

  const filteredTotalIncome = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
  const filteredTotalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const filteredNet = filteredTotalIncome - filteredTotalExpense;

  const handleExportCSV = () => {
    const rows = [
      ['Tipe', 'Tanggal', 'Kategori', 'Sumber/Keterangan', 'Metode', 'Nominal']
    ];
    incomes.forEach(i => {
      rows.push(['Pemasukan', formatDate(i.income_date), i.category, i.source_name || i.description, i.payment_method || '-', i.amount]);
    });
    expenses.forEach(e => {
      rows.push(['Pengeluaran', formatDate(e.expense_date || e.date), e.category, e.description, '-', e.amount]);
    });
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `laporan_event_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div>
        <Link
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-forest-800 transition-colors mb-2"
          to="/events"
        >
          <span>←</span>
          <span>Kembali ke Daftar Kegiatan</span>
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{event.title}</h1>
              <span className="rounded-full bg-forest-100 text-forest-800 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide border border-forest-200">
                {event.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              📅 {formatDate(event.event_date)}{event.location ? ` · 📍 ${event.location}` : ''}
            </p>

            {/* Committee badges */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-900 font-semibold text-[11px]">
                👑 Ketua: {leader ? (leader.profile_name || 'Terdaftar') : 'Belum di-assign'}
              </span>
              <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-900 font-semibold text-[11px]">
                💰 Bendahara: {treasurer ? (treasurer.profile_name || 'Terdaftar') : 'Belum di-assign'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {event.documentation_url && (
              <a
                href={event.documentation_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors shadow-2xs"
              >
                <span>📁</span>
                <span>Folder Dokumentasi</span>
              </a>
            )}
            <button
              type="button"
              className="pv-btn-ghost py-2 text-xs shadow-2xs"
              onClick={handleExportCSV}
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex flex-col">
            Dari Tanggal
            <input type="date" className="pv-input py-1.5 text-xs mt-1 font-normal" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
          </label>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex flex-col">
            Sampai Tanggal
            <input type="date" className="pv-input py-1.5 text-xs mt-1 font-normal" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
          </label>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex flex-col">
            Cari Kategori
            <input type="text" className="pv-input py-1.5 text-xs mt-1 font-normal" placeholder="Pencarian kategori..." value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}/>
          </label>
        </div>
      </div>

      {!canManageFinance && (
        <div className="rounded-xl bg-blue-50/70 border border-blue-200 text-blue-800 px-4 py-2.5 text-xs font-medium flex items-center gap-2">
          <span>ℹ️</span>
          <span>Mode Read-Only: Anda mengakses laporan keuangan event ini sebagai pemantau / panitia terdaftar.</span>
        </div>
      )}

      {/* 3 Hero Cards Arus Kas Event */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Total Pemasukan Event</p>
          <p className="mt-1 text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
            + <AnimatedCounter value={filteredTotalIncome} formatter={formatRupiah} />
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-xs">
          <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">Total Pengeluaran Event</p>
          <p className="mt-1 text-xl sm:text-2xl font-extrabold text-rose-600 font-mono tabular-nums">
            - <AnimatedCounter value={filteredTotalExpense} formatter={formatRupiah} />
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sisa Saldo Kas Event</p>
          <p className={`mt-1 text-xl sm:text-2xl font-extrabold font-mono tabular-nums ${filteredNet >= 0 ? 'text-forest-900' : 'text-rose-600'}`}>
            <AnimatedCounter value={filteredNet} formatter={formatRupiah} />
          </p>
        </div>
      </div>

      {/* Tabel Pemasukan Event */}
      <div className="pv-card overflow-hidden border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Rincian Pemasukan Kegiatan</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{incomes.length} transaksi tercatat</p>
          </div>
          {canManageFinance && (
            <button
              className="pv-btn-primary py-1 px-3 text-xs shadow-xs"
              onClick={() => setShowIncomeForm(!showIncomeForm)}
            >
              {showIncomeForm ? 'Batal' : '+ Pemasukan'}
            </button>
          )}
        </div>
        
        {showIncomeForm && (
          <form className="p-5 border-b border-slate-200 bg-slate-50/50 grid gap-3 md:grid-cols-2" onSubmit={submitIncome}>
            <input className="pv-input text-xs" type="date" value={incomeForm.income_date} onChange={e => setIncomeForm({...incomeForm, income_date: e.target.value})} required/>
            <input className="pv-input text-xs" placeholder="Kategori (misal: Sponsorship, Uang Pendaftaran)" value={incomeForm.category} onChange={e => setIncomeForm({...incomeForm, category: e.target.value})} required/>
            <input className="pv-input text-xs" placeholder="Sumber / Nama Pembayar" value={incomeForm.source_name} onChange={e => setIncomeForm({...incomeForm, source_name: e.target.value})} required/>
            <input className="pv-input text-xs font-bold" type="number" placeholder="Nominal (Rp)" value={incomeForm.amount} onChange={e => setIncomeForm({...incomeForm, amount: e.target.value})} required/>
            <select className="pv-input md:col-span-2 text-xs font-semibold" value={incomeForm.payment_method} onChange={e => setIncomeForm({...incomeForm, payment_method: e.target.value})}>
              <option value="cash">💵 Tunai / Cash</option>
              <option value="bank_transfer">🏦 Transfer Bank</option>
              <option value="qris">📱 QRIS</option>
              <option value="other">Lainnya</option>
            </select>
            <textarea className="pv-input md:col-span-2 text-xs" rows="2" placeholder="Keterangan tambahan..." value={incomeForm.description} onChange={e => setIncomeForm({...incomeForm, description: e.target.value})}/>
            <button type="submit" className="pv-btn-primary md:col-span-2 text-xs">Simpan Pemasukan Event</button>
          </form>
        )}

        {incomes.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Belum ada pemasukan yang dicatat untuk event ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-xs uppercase text-slate-700 font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Kategori &amp; Sumber</th>
                  <th className="px-5 py-3">Metode</th>
                  <th className="px-5 py-3 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {incomes.map((income) => (
                  <tr key={income.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-600 font-medium whitespace-nowrap">{formatDate(income.income_date)}</td>
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">{income.category}</div>
                      <div className="text-xs text-slate-500">{income.source_name}</div>
                    </td>
                    <td className="px-5 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {income.payment_method === 'bank_transfer' ? '🏦 Transfer' : income.payment_method === 'qris' ? '📱 QRIS' : '💵 Tunai'}
                    </td>
                    <td className="px-5 py-3 text-right font-extrabold text-emerald-700 font-mono tabular-nums whitespace-nowrap">
                      + {formatRupiah(income.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabel Pengeluaran Event */}
      <div className="pv-card overflow-hidden border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Rincian Pengeluaran Kegiatan</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{expenses.length} transaksi tercatat</p>
          </div>
          {canManageFinance && (
            <button
              type="button"
              className="pv-btn-primary py-1 px-3 text-xs shadow-xs"
              onClick={() => setShowExpenseForm(!showExpenseForm)}
            >
              {showExpenseForm ? 'Batal' : '+ Pengeluaran'}
            </button>
          )}
        </div>

        {showExpenseForm && (
          <form className="p-5 border-b border-slate-200 bg-slate-50/50 grid gap-3 md:grid-cols-2" onSubmit={submitExpense}>
            <input className="pv-input text-xs" type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm({...expenseForm, expense_date: e.target.value})} required/>
            <input className="pv-input text-xs" placeholder="Kategori (misal: Konsumsi, Sound System, Banner)" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} required/>
            <input className="pv-input text-xs font-bold" type="number" placeholder="Nominal (Rp)" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} required/>
            <textarea className="pv-input md:col-span-2 text-xs" rows="2" placeholder="Keterangan / rincian pengeluaran..." value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})}/>
            <button type="submit" className="pv-btn-primary md:col-span-2 text-xs">Simpan Pengeluaran Event</button>
          </form>
        )}

        {expenses.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Belum ada pengeluaran yang dicatat untuk event ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-xs uppercase text-slate-700 font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Kategori</th>
                  <th className="px-5 py-3">Deskripsi</th>
                  <th className="px-5 py-3 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-600 font-medium whitespace-nowrap">{formatDate(expense.expense_date || expense.date)}</td>
                    <td className="px-5 py-3 font-bold text-slate-900 text-xs sm:text-sm">{expense.category}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{expense.description || '-'}</td>
                    <td className="px-5 py-3 text-right font-extrabold text-rose-600 font-mono tabular-nums whitespace-nowrap">
                      - {formatRupiah(expense.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">Data laporan mengikuti otorisasi backend/RLS; akses assignment tidak dapat dipakai untuk event lain.</p>
    </div>
  );
}
