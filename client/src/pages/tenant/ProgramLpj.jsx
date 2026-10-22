import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AiOutlineArrowLeft, AiOutlinePrinter } from 'react-icons/ai';
import { useTenant } from '../../context/TenantContext';
import {
  fetchProgram,
  fetchBudgetItems,
  fetchProgramTransactions,
  summarizeProgram,
  fetchProgramDocuments,
  fetchTenantMembers,
  PROGRAM_STATUS_LABELS,
  PROGRAM_DOC_TYPES,
} from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';
import { formatDateWIB } from '../../utils/date';
import { SkeletonCard } from '../../components/ui';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function ProgramLpj() {
  const { tenantId: routeTenantId, programId } = useParams();
  const { activeTenant } = useTenant();
  const tenantId = routeTenantId || activeTenant?.id;
  const navigate = useNavigate();

  const [program, setProgram] = useState(null);
  const [budgetItems, setBudgetItems] = useState([]);
  const [transactions, setTransactions] = useState({ incomes: [], expenses: [], dues: [] });
  const [documents, setDocuments] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Lembar Pengesahan state (PANITIA-3.5)
  const [signCity, setSignCity] = useState('');
  const [signDate, setSignDate] = useState('');
  const [signLeadName, setSignLeadName] = useState('');
  const [signTreasurerName, setSignTreasurerName] = useState('');

  useEffect(() => {
    async function loadLpjData() {
      if (!tenantId || !programId) return;
      setIsLoading(true);
      setLoadError(null);
      try {
        const [progData, itemsData, transData, docsData, membersData] = await Promise.all([
          fetchProgram(tenantId, programId),
          fetchBudgetItems(tenantId, programId).catch(() => []),
          fetchProgramTransactions(tenantId, programId).catch(() => ({ incomes: [], expenses: [], dues: [] })),
          fetchProgramDocuments(tenantId, programId).catch(() => []),
          fetchTenantMembers(tenantId).catch(() => []),
        ]);

        if (!progData) {
          setLoadError('Data acara tidak ditemukan.');
          return;
        }

        setProgram(progData);
        setBudgetItems(itemsData || []);
        setTransactions(transData || { incomes: [], expenses: [], dues: [] });
        setDocuments(docsData || []);
        setMembers(membersData || []);

        // Inisialisasi pengesahan
        const defaultLead = progData.lead_member?.name || progData.lead_member?.full_name || '';
        setSignLeadName((prev) => (prev ? prev : defaultLead));
        setSignCity((prev) => (prev ? prev : (activeTenant?.city || '')));
        const todayStr = formatDateWIB(new Date().toISOString());
        setSignDate((prev) => (prev ? prev : todayStr));
      } catch (err) {
        setLoadError(err.message || 'Gagal memuat data LPJ acara.');
      } finally {
        setIsLoading(false);
      }
    }

    loadLpjData();
  }, [tenantId, programId, activeTenant?.city]);

  // Kalkulasi ringkasan keuangan
  const summary = useMemo(() => {
    return summarizeProgram(
      budgetItems,
      transactions.incomes,
      transactions.expenses,
      transactions.dues
    );
  }, [budgetItems, transactions]);

  // Map pos anggaran
  const budgetItemMap = useMemo(() => {
    const map = new Map();
    (budgetItems || []).forEach((b) => {
      if (b && b.id) map.set(String(b.id), b);
    });
    return map;
  }, [budgetItems]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (loadError || !program) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/t/${tenantId}/programs`)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <AiOutlineArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Acara</span>
        </button>
        <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          <p className="font-semibold">Gagal Memuat LPJ</p>
          <p className="text-sm mt-1">{loadError || 'Data acara tidak ditemukan.'}</p>
        </div>
      </div>
    );
  }

  const duesList = transactions.dues || [];
  const statusLabel = PROGRAM_STATUS_LABELS[program.status] || program.status;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 print:p-0 print:m-0 print:max-w-none print:pb-0">
      {/* Action Bar (Layar Saja) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm print:hidden">
        <button
          type="button"
          onClick={() => navigate(`/t/${tenantId}/programs/${programId}`)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
        >
          <AiOutlineArrowLeft className="w-4 h-4" />
          <span>Kembali ke Detail Acara</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="pv-button-primary flex items-center gap-2 text-sm"
          >
            <AiOutlinePrinter className="w-4 h-4" />
            <span>Cetak LPJ (A4)</span>
          </button>
        </div>
      </div>

      {/* Panel Pengaturan Pengesahan (Layar Saja) */}
      <div className="p-5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Pengaturan Pengesahan Sebelum Cetak
          </h3>
          <span className="text-xs text-slate-400">Data otomatis tercantum pada bagian 8 di lembar cetak</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label htmlFor="lpj-city" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Kota
            </label>
            <input
              id="lpj-city"
              type="text"
              value={signCity}
              onChange={(e) => setSignCity(e.target.value)}
              placeholder="Contoh: Jakarta"
              className="pv-input w-full text-xs"
            />
          </div>
          <div>
            <label htmlFor="lpj-date" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tanggal Pengesahan
            </label>
            <input
              id="lpj-date"
              type="text"
              value={signDate}
              onChange={(e) => setSignDate(e.target.value)}
              placeholder="Contoh: 22 Okt 2026"
              className="pv-input w-full text-xs"
            />
          </div>
          <div>
            <label htmlFor="lpj-lead" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ketua Acara
            </label>
            <input
              id="lpj-lead"
              type="text"
              value={signLeadName}
              onChange={(e) => setSignLeadName(e.target.value)}
              placeholder="Nama Ketua Acara"
              className="pv-input w-full text-xs"
            />
          </div>
          <div>
            <label htmlFor="lpj-treasurer" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Bendahara
            </label>
            <input
              id="lpj-treasurer"
              type="text"
              value={signTreasurerName}
              onChange={(e) => setSignTreasurerName(e.target.value)}
              placeholder="Nama Bendahara"
              className="pv-input w-full text-xs"
            />
          </div>
        </div>
      </div>

      {/* DOKUMEN LPJ CETAK A4 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 sm:p-12 space-y-10 shadow-sm print:border-0 print:shadow-none print:p-0 print:space-y-8">
        {/* BAGIAN 1: SAMPUL */}
        <section data-testid="lpj-section-1" className="text-center pb-8 border-b-2 border-slate-900 dark:border-slate-100">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">
            {activeTenant?.name || 'Organisasi'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
            Laporan Pertanggungjawaban (LPJ)
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold text-forest-700 dark:text-forest-400 mt-2">
            {program.name}
          </h2>
          <div className="flex flex-wrap justify-center items-center gap-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-4">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">Waktu:</span>{' '}
              {formatDateWIB(program.starts_on)}
              {program.ends_on && program.ends_on !== program.starts_on ? ` s/d ${formatDateWIB(program.ends_on)}` : ''}
            </div>
            <span>•</span>
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">Lokasi:</span> {program.location || '-'}
            </div>
            <span>•</span>
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">Status:</span> {statusLabel}
            </div>
          </div>
          {program.description && (
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl mx-auto mt-4 italic">
              &quot;{program.description}&quot;
            </p>
          )}
        </section>

        {/* BAGIAN 2: RINGKASAN KEUANGAN */}
        <section data-testid="lpj-section-2" className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            2. Ringkasan Keuangan
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 block">Rencana Pemasukan</span>
              <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {formatRupiah(summary.planned.income)}
              </span>
            </div>
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">Realisasi Pemasukan</span>
              <span className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400">
                {formatRupiah(summary.actual.income)}
              </span>
            </div>
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 block">Rencana Pengeluaran</span>
              <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {formatRupiah(summary.planned.expense)}
              </span>
            </div>
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-rose-50/40 dark:bg-rose-950/20">
              <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 block">Realisasi Pengeluaran</span>
              <span className="text-sm sm:text-base font-bold text-rose-700 dark:text-rose-400">
                {formatRupiah(summary.actual.expense)}
              </span>
            </div>
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-blue-50/40 dark:bg-blue-950/20">
              <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 block">Iuran Terkumpul</span>
              <span className="text-sm sm:text-base font-bold text-blue-700 dark:text-blue-400">
                {formatRupiah(summary.dues?.collected || 0)}
              </span>
            </div>
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">Saldo Akhir Realisasi</span>
              <span className={`text-sm sm:text-base font-bold ${summary.actual.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                {formatRupiah(summary.actual.balance)}
              </span>
            </div>
          </div>
        </section>

        {/* BAGIAN 3: ANGGARAN VS REALISASI PER SEKSI */}
        <section data-testid="lpj-section-3" className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            3. Anggaran vs Realisasi per Seksi
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border border-slate-200 dark:border-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Seksi / Pos</th>
                  <th className="py-2 px-3 font-semibold">Jenis</th>
                  <th className="py-2 px-3 font-semibold text-right">Rencana</th>
                  <th className="py-2 px-3 font-semibold text-right">Realisasi</th>
                  <th className="py-2 px-3 font-semibold text-right">Selisih</th>
                  <th className="py-2 px-3 font-semibold text-right">Capaian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summary.sections.length === 0 && !summary.unbudgeted.income && !summary.unbudgeted.expense ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-400 text-xs">
                      Tidak ada pos anggaran terdaftar.
                    </td>
                  </tr>
                ) : (
                  <>
                    {summary.sections.map((sec, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{sec.section}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${sec.kind === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {sec.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{formatRupiah(sec.planned)}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatRupiah(sec.actual)}</td>
                        <td className={`py-2 px-3 text-right ${sec.variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {sec.variance >= 0 ? `+${formatRupiah(sec.variance)}` : formatRupiah(sec.variance)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium">{sec.percent}%</td>
                      </tr>
                    ))}
                    {summary.unbudgeted.income > 0 && (
                      <tr className="bg-amber-50/40 dark:bg-amber-950/20">
                        <td className="py-2 px-3 font-medium text-amber-900 dark:text-amber-200">Di luar anggaran</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                            Pemasukan
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">Rp 0</td>
                        <td className="py-2 px-3 text-right font-medium">{formatRupiah(summary.unbudgeted.income)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">+{formatRupiah(summary.unbudgeted.income)}</td>
                        <td className="py-2 px-3 text-right text-slate-400">-</td>
                      </tr>
                    )}
                    {summary.unbudgeted.expense > 0 && (
                      <tr className="bg-amber-50/40 dark:bg-amber-950/20">
                        <td className="py-2 px-3 font-medium text-amber-900 dark:text-amber-200">Di luar anggaran</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700">
                            Pengeluaran
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">Rp 0</td>
                        <td className="py-2 px-3 text-right font-medium">{formatRupiah(summary.unbudgeted.expense)}</td>
                        <td className="py-2 px-3 text-right text-rose-700">{formatRupiah(-summary.unbudgeted.expense)}</td>
                        <td className="py-2 px-3 text-right text-slate-400">-</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BAGIAN 4: RINCIAN PEMASUKAN */}
        <section data-testid="lpj-section-4" className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            4. Rincian Pemasukan
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border border-slate-200 dark:border-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Tanggal</th>
                  <th className="py-2 px-3 font-semibold">Pos Anggaran</th>
                  <th className="py-2 px-3 font-semibold">Sumber / Pihak</th>
                  <th className="py-2 px-3 font-semibold">Uraian</th>
                  <th className="py-2 px-3 font-semibold text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.incomes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 text-xs">
                      Tidak ada rincian transaksi pemasukan.
                    </td>
                  </tr>
                ) : (
                  transactions.incomes.map((inc) => {
                    const bItem = inc.budget_item_id ? budgetItemMap.get(String(inc.budget_item_id)) : null;
                    return (
                      <tr key={inc.id}>
                        <td className="py-2 px-3">{formatDateWIB(inc.income_date || inc.date)}</td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          {bItem ? `${bItem.section} - ${bItem.item}` : 'Di luar anggaran'}
                        </td>
                        <td className="py-2 px-3 font-medium">{inc.source_name || '-'}</td>
                        <td className="py-2 px-3">{inc.description || '-'}</td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatRupiah(inc.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BAGIAN 5: RINCIAN PENGELUARAN */}
        <section data-testid="lpj-section-5" className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            5. Rincian Pengeluaran
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border border-slate-200 dark:border-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Tanggal</th>
                  <th className="py-2 px-3 font-semibold">Pos Anggaran</th>
                  <th className="py-2 px-3 font-semibold">Kategori</th>
                  <th className="py-2 px-3 font-semibold">Uraian</th>
                  <th className="py-2 px-3 font-semibold text-center">Nota</th>
                  <th className="py-2 px-3 font-semibold text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-400 text-xs">
                      Tidak ada rincian transaksi pengeluaran.
                    </td>
                  </tr>
                ) : (
                  transactions.expenses.map((exp) => {
                    const bItem = exp.budget_item_id ? budgetItemMap.get(String(exp.budget_item_id)) : null;
                    const hasReceipt = Boolean(
                      exp.receipt_file_path ||
                      exp.receipt_file_url ||
                      exp.receipt_url ||
                      exp.receipt_path ||
                      exp.receipt
                    );
                    return (
                      <tr key={exp.id}>
                        <td className="py-2 px-3">{formatDateWIB(exp.date)}</td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          {bItem ? `${bItem.section} - ${bItem.item}` : 'Di luar anggaran'}
                        </td>
                        <td className="py-2 px-3 font-medium">{exp.category || '-'}</td>
                        <td className="py-2 px-3">{exp.description || '-'}</td>
                        <td className="py-2 px-3 text-center">
                          {hasReceipt ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              nota ✓
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-rose-700 dark:text-rose-400">
                          {formatRupiah(exp.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BAGIAN 6: REKAP IURAN PANITIA */}
        <section data-testid="lpj-section-6" className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            6. Rekap Iuran Panitia
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border border-slate-200 dark:border-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Nama Anggota</th>
                  <th className="py-2 px-3 font-semibold text-right">Nominal</th>
                  <th className="py-2 px-3 font-semibold">Jatuh Tempo</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {duesList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400 text-xs">
                      Tidak ada iuran panitia yang diterbitkan untuk acara ini.
                    </td>
                  </tr>
                ) : (
                  duesList.map((due) => {
                    const mName = due.member?.full_name || due.member?.name || `Anggota ${due.member_id}`;
                    return (
                      <tr key={due.id}>
                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{mName}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatRupiah(due.amount)}</td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          {due.due_date ? formatDateWIB(due.due_date) : '-'}
                        </td>
                        <td className="py-2 px-3">
                          {due.status === 'paid' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                              Lunas
                            </span>
                          )}
                          {due.status === 'pending_verification' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700">
                              Menunggu verifikasi
                            </span>
                          )}
                          {due.status === 'unpaid' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                              Belum bayar
                            </span>
                          )}
                          {due.status === 'cancelled' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                              Dibatalkan
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BAGIAN 7: DAFTAR DOKUMEN PENDUKUNG */}
        <section data-testid="lpj-section-7" className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            7. Dokumen Pendukung
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border border-slate-200 dark:border-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Judul Dokumen</th>
                  <th className="py-2 px-3 font-semibold">Tipe</th>
                  <th className="py-2 px-3 font-semibold">Nama Berkas</th>
                  <th className="py-2 px-3 font-semibold text-right">Ukuran</th>
                  <th className="py-2 px-3 font-semibold">Tanggal Unggah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 text-xs">
                      Tidak ada dokumen pendukung terlampir.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{doc.title}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {PROGRAM_DOC_TYPES[doc.doc_type] || doc.doc_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500 truncate max-w-xs">{doc.file_name}</td>
                      <td className="py-2 px-3 text-right">{formatFileSize(doc.file_size)}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{formatDateWIB(doc.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BAGIAN 8: PENGESAHAN */}
        <section data-testid="lpj-section-8" className="pt-6 space-y-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-800">
            8. Lembar Pengesahan
          </h3>

          <div className="text-right text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <span>{signCity || 'Kota'}, {signDate || '-'}</span>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-4 pb-8">
            <div className="text-center">
              <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mengetahui,
              </p>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Ketua Acara
              </p>
              <div className="h-24 flex items-center justify-center">
                {/* Ruang tanda tangan */}
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white underline tracking-wide">
                {signLeadName || '( ................................... )'}
              </p>
            </div>

            <div className="text-center">
              <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Menyetujui,
              </p>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Bendahara
              </p>
              <div className="h-24 flex items-center justify-center">
                {/* Ruang tanda tangan */}
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white underline tracking-wide">
                {signTreasurerName || '( ................................... )'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
