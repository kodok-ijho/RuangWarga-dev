import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  AiOutlineArrowLeft,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineCalendar,
  AiOutlineEnvironment,
  AiOutlineUser,
  AiOutlinePlus,
  AiOutlinePrinter,
  AiOutlineDownload,
  AiOutlineReload,
  AiOutlineCheckCircle,
} from 'react-icons/ai';
import { useTenant } from '../../context/TenantContext';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/Modal';
import { EmptyState, SkeletonCard } from '../../components/ui';
import {
  fetchProgram,
  updateProgram,
  deleteProgram,
  fetchBudgetItems,
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  fetchProgramTransactions,
  summarizeProgram,
  fetchTenantMembers,
  PROGRAM_STATUS_LABELS,
} from '../../services/tenantOperationalService';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import { STATUS_BADGE_CLASSES } from './Programs';

export default function ProgramDetail() {
  const { tenantId: routeTenantId, programId } = useParams();
  const { activeTenant } = useTenant();
  const tenantId = routeTenantId || activeTenant?.id;
  const navigate = useNavigate();

  const tenantAccess = useTenantAccess();
  const { canTransact } = useSubscriptionGate();
  const toast = useToast();

  const canManagePrograms = Boolean(tenantAccess.canManagePrograms && canTransact);
  const canManageBudget = Boolean(tenantAccess.canManageBudget && canTransact);
  const canRecordIncome = Boolean(tenantAccess.canRecordIncome && canTransact);
  const canRecordExpense = Boolean(tenantAccess.canManageExpenses && canTransact);

  const [program, setProgram] = useState(null);
  const [budgetItems, setBudgetItems] = useState([]);
  const [transactions, setTransactions] = useState({ incomes: [], expenses: [] });
  const [members, setMembers] = useState([]);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'budget' | 'transactions'
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Modal Program Form (Edit)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmittingProgram, setIsSubmittingProgram] = useState(false);
  const [programFormData, setProgramFormData] = useState({
    name: '',
    description: '',
    location: '',
    startsOn: '',
    endsOn: '',
    leadMemberId: '',
    status: 'planning',
  });

  // Modal Status Quick Change
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('planning');

  // Modal Delete Program Confirmation
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingProgram, setIsDeletingProgram] = useState(false);

  // Modal Budget Item Form (Create / Edit)
  const [budgetItemModal, setBudgetItemModal] = useState(null); // null | 'add' | item object
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);
  const [budgetFormData, setBudgetFormData] = useState({
    kind: 'expense',
    section: '',
    item: '',
    quantity: 1,
    unit_label: 'paket',
    unit_price: 0,
    notes: '',
  });

  // Modal Delete Budget Item Confirmation
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId || !programId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [progData, itemsData, transData, membersData] = await Promise.all([
        fetchProgram(tenantId, programId),
        fetchBudgetItems(tenantId, programId).catch(() => []),
        fetchProgramTransactions(tenantId, programId).catch(() => ({ incomes: [], expenses: [] })),
        fetchTenantMembers(tenantId).catch(() => []),
      ]);

      if (!progData) {
        throw new Error('Data acara tidak ditemukan.');
      }

      setProgram(progData);
      setBudgetItems(itemsData || []);
      setTransactions(transData || { incomes: [], expenses: [] });
      setMembers(membersData || []);
    } catch (err) {
      setLoadError(err.message || 'Gagal memuat detail acara.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, programId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ringkasan Keuangan Acara
  const summary = useMemo(() => {
    return summarizeProgram(budgetItems, transactions.incomes, transactions.expenses);
  }, [budgetItems, transactions]);

  // Transaksi Gabungan Diurutkan Berdasarkan Tanggal
  const combinedTransactions = useMemo(() => {
    const list = [];
    (transactions.incomes || []).forEach((inc) => {
      if (inc && !inc.deleted_at) {
        list.push({
          id: `inc-${inc.id}`,
          originalId: inc.id,
          type: 'income',
          date: inc.income_date || inc.date || inc.created_at,
          amount: Number(inc.amount || 0),
          party: inc.source_name || '-',
          description: inc.description || '-',
          category: inc.category || '-',
          budgetItemId: inc.budget_item_id,
          paymentMethod: inc.payment_method,
        });
      }
    });

    (transactions.expenses || []).forEach((exp) => {
      if (exp) {
        list.push({
          id: `exp-${exp.id}`,
          originalId: exp.id,
          type: 'expense',
          date: exp.date || exp.expense_date || exp.created_at,
          amount: Number(exp.amount || 0),
          party: exp.recipient || '-',
          description: exp.description || '-',
          category: exp.category || '-',
          budgetItemId: exp.budget_item_id,
          paymentMethod: exp.payment_method,
        });
      }
    });

    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions]);

  // Map Budget Item ID -> Budget Item
  const budgetItemMap = useMemo(() => {
    const map = new Map();
    budgetItems.forEach((b) => {
      if (b && b.id) map.set(String(b.id), b);
    });
    return map;
  }, [budgetItems]);

  // Kelompok RAB: Income vs Expense, lalu per seksi
  const groupedBudget = useMemo(() => {
    const incomeSections = {};
    const expenseSections = {};

    budgetItems.forEach((item) => {
      const isInc = item.kind === 'income';
      const secName = item.section ? String(item.section).trim() : 'Lainnya';
      const target = isInc ? incomeSections : expenseSections;

      if (!target[secName]) {
        target[secName] = [];
      }
      target[secName].push(item);
    });

    return { incomeSections, expenseSections };
  }, [budgetItems]);

  // Realisasi per item RAB
  const itemActualMap = useMemo(() => {
    const actuals = new Map();
    combinedTransactions.forEach((t) => {
      if (t.budgetItemId) {
        const idStr = String(t.budgetItemId);
        actuals.set(idStr, (actuals.get(idStr) || 0) + t.amount);
      }
    });
    return actuals;
  }, [combinedTransactions]);

  // Approved members for lead member selector
  const approvedMembers = useMemo(() => {
    if (!Array.isArray(members)) return [];
    return members.filter((m) => !m.status || m.status === 'approved');
  }, [members]);

  // --- Handlers Acara ---
  const handleOpenEditModal = () => {
    if (!program) return;
    setProgramFormData({
      name: program.name || '',
      description: program.description || '',
      location: program.location || '',
      startsOn: program.starts_on || program.startsOn || '',
      endsOn: program.ends_on || program.endsOn || '',
      leadMemberId: program.lead_member_id || program.leadMemberId || '',
      status: program.status || 'planning',
    });
    setIsEditModalOpen(true);
  };

  const handleSubmitEditProgram = async (e) => {
    e.preventDefault();
    if (!programFormData.name.trim()) {
      toast.error('Nama acara wajib diisi.');
      return;
    }
    if (programFormData.startsOn && programFormData.endsOn && programFormData.endsOn < programFormData.startsOn) {
      toast.error('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
      return;
    }

    setIsSubmittingProgram(true);
    try {
      const updated = await updateProgram(tenantId, programId, {
        name: programFormData.name.trim(),
        description: programFormData.description.trim() || null,
        location: programFormData.location.trim() || null,
        startsOn: programFormData.startsOn || null,
        endsOn: programFormData.endsOn || null,
        leadMemberId: programFormData.leadMemberId || null,
        status: programFormData.status,
      });
      setProgram(updated);
      toast.success('Informasi acara berhasil diperbarui.');
      setIsEditModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui acara.');
    } finally {
      setIsSubmittingProgram(false);
    }
  };

  const handleOpenStatusModal = () => {
    setSelectedStatus(program?.status || 'planning');
    setIsStatusModalOpen(true);
  };

  const handleUpdateStatus = async () => {
    try {
      const updated = await updateProgram(tenantId, programId, { status: selectedStatus });
      setProgram(updated);
      toast.success('Status acara berhasil diubah.');
      setIsStatusModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status acara.');
    }
  };

  const handleDeleteProgram = async () => {
    setIsDeletingProgram(true);
    try {
      await deleteProgram(tenantId, programId);
      toast.success('Acara berhasil dihapus.');
      navigate(`/t/${tenantId}/programs`);
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus acara.');
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeletingProgram(false);
    }
  };

  // --- Handlers RAB (Budget Items) ---
  const handleOpenAddBudgetItem = (defaultKind = 'expense', defaultSection = '') => {
    setBudgetFormData({
      kind: defaultKind,
      section: defaultSection || '',
      item: '',
      quantity: 1,
      unit_label: 'paket',
      unit_price: 0,
      notes: '',
    });
    setBudgetItemModal('add');
  };

  const handleOpenEditBudgetItem = (item) => {
    setBudgetFormData({
      kind: item.kind || 'expense',
      section: item.section || '',
      item: item.item || '',
      quantity: item.quantity ?? 1,
      unit_label: item.unit_label || item.unitLabel || 'paket',
      unit_price: item.unit_price ?? item.unitPrice ?? 0,
      notes: item.notes || '',
    });
    setBudgetItemModal(item);
  };

  const handleSubmitBudgetItem = async (e) => {
    e.preventDefault();
    if (!budgetFormData.item.trim()) {
      toast.error('Nama item/pos anggaran wajib diisi.');
      return;
    }
    const qty = Number(budgetFormData.quantity);
    const price = Number(budgetFormData.unit_price);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Kuantitas harus berupa angka lebih dari 0.');
      return;
    }
    if (isNaN(price) || price < 0) {
      toast.error('Harga satuan tidak boleh negatif.');
      return;
    }

    setIsSubmittingBudget(true);
    try {
      if (budgetItemModal === 'add') {
        await createBudgetItem(tenantId, programId, {
          kind: budgetFormData.kind,
          section: budgetFormData.section.trim() || 'Lainnya',
          item: budgetFormData.item.trim(),
          quantity: qty,
          unitLabel: budgetFormData.unit_label.trim() || 'paket',
          unitPrice: price,
          notes: budgetFormData.notes.trim() || null,
        });
        toast.success('Pos anggaran berhasil ditambahkan.');
      } else if (budgetItemModal && budgetItemModal.id) {
        await updateBudgetItem(tenantId, budgetItemModal.id, {
          kind: budgetFormData.kind,
          section: budgetFormData.section.trim() || 'Lainnya',
          item: budgetFormData.item.trim(),
          quantity: qty,
          unitLabel: budgetFormData.unit_label.trim() || 'paket',
          unitPrice: price,
          notes: budgetFormData.notes.trim() || null,
        });
        toast.success('Pos anggaran berhasil diperbarui.');
      }
      setBudgetItemModal(null);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pos anggaran.');
    } finally {
      setIsSubmittingBudget(false);
    }
  };

  const handleDeleteBudgetItem = async () => {
    if (!itemToDelete) return;
    setIsDeletingItem(true);
    try {
      await deleteBudgetItem(tenantId, itemToDelete.id);
      toast.success('Pos anggaran berhasil dihapus.');
      setItemToDelete(null);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus pos anggaran.');
    } finally {
      setIsDeletingItem(false);
    }
  };

  // --- Handlers Ekspor & Cetak ---
  const handleExportCSV = () => {
    if (!program) return;

    // Bagian 1: Ringkasan RAB vs Realisasi
    const sectionRows = (summary.sections || []).map((sec) => [
      sec.kind === 'income' ? 'Pemasukan' : 'Pengeluaran',
      sec.section,
      sec.planned,
      sec.actual,
      sec.variance,
      `${sec.percent}%`,
    ]);

    // Bagian 2: Daftar Transaksi
    const transRows = combinedTransactions.map((t) => {
      const budgetItem = t.budgetItemId ? budgetItemMap.get(String(t.budgetItemId)) : null;
      return [
        formatDate(t.date),
        t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        budgetItem ? budgetItem.item : 'Di Luar Anggaran',
        budgetItem ? budgetItem.section : '-',
        t.party,
        t.description,
        t.amount,
      ];
    });

    const csvData = [
      ['LAPORAN KEUANGAN ACARA / PROGRAM'],
      ['Nama Acara', program.name],
      ['Status', PROGRAM_STATUS_LABELS[program.status] || program.status],
      ['Periode', `${program.starts_on || '-'} s/d ${program.ends_on || '-'}`],
      ['Lokasi', program.location || '-'],
      ['Ketua', program.lead_member?.name || program.lead_member?.full_name || '-'],
      [],
      ['--- RINGKASAN ANGGARAN (RAB) VS REALISASI ---'],
      ['Jenis', 'Seksi', 'Rencana (Rp)', 'Realisasi (Rp)', 'Selisih (Rp)', 'Persen (%)'],
      ...sectionRows,
      ['Pemasukan', 'Di luar anggaran', 0, summary.unbudgeted?.income || 0, (summary.unbudgeted?.income || 0) - 0, '-'],
      ['Pengeluaran', 'Di luar anggaran', 0, summary.unbudgeted?.expense || 0, (summary.unbudgeted?.expense || 0) - 0, '-'],
      [],
      ['TOTAL KEUANGAN ACARA', '', '', '', '', ''],
      ['Total Pemasukan', '', summary.planned?.income || 0, summary.actual?.income || 0, (summary.actual?.income || 0) - (summary.planned?.income || 0), ''],
      ['Total Pengeluaran', '', summary.planned?.expense || 0, summary.actual?.expense || 0, (summary.actual?.expense || 0) - (summary.planned?.expense || 0), ''],
      ['Saldo Akhir (Realisasi)', '', '', summary.actual?.balance || 0, '', ''],
      [],
      ['--- DAFTAR TRANSAKSI ACARA ---'],
      ['Tanggal', 'Jenis', 'Pos Anggaran', 'Seksi', 'Pihak/Sumber/Penerima', 'Keterangan', 'Jumlah (Rp)'],
      ...transRows,
    ];

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan_acara_${program.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV acara berhasil diunduh.');
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-12">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (loadError || !program) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(`/t/${tenantId}/programs`)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <AiOutlineArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Acara</span>
        </button>
        <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300">
          <p className="font-semibold">Gagal Memuat Acara</p>
          <p className="text-sm mt-1">{loadError || 'Data acara tidak ditemukan.'}</p>
        </div>
      </div>
    );
  }

  const leadName = program.lead_member?.name || program.lead_member?.full_name || '-';

  return (
    <div className="space-y-6 pb-16">
      {/* Back button & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <button
          type="button"
          onClick={() => navigate(`/t/${tenantId}/programs`)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <AiOutlineArrowLeft className="w-4 h-4" />
          <span>Daftar Acara</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Muat Ulang"
          >
            <AiOutlineReload className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="pv-button-secondary flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <AiOutlineDownload className="w-4 h-4" />
            <span>Unduh CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="pv-button-secondary flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <AiOutlinePrinter className="w-4 h-4" />
            <span>Cetak</span>
          </button>
          {canManagePrograms && (
            <>
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="pv-button-secondary flex items-center gap-1.5 text-xs sm:text-sm"
              >
                <AiOutlineEdit className="w-4 h-4" />
                <span>Ubah</span>
              </button>
              <button
                type="button"
                onClick={handleOpenStatusModal}
                className="pv-button-secondary flex items-center gap-1.5 text-xs sm:text-sm"
              >
                <AiOutlineCheckCircle className="w-4 h-4" />
                <span>Ubah Status</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors border border-rose-200 dark:border-rose-900"
                title="Hapus Acara"
              >
                <AiOutlineDelete className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Judul Cetak (Hanya Tampil Saat Dicetak) */}
      <div data-testid="program-print-header" className="hidden print:block border-b border-slate-300 pb-4 mb-4">
        <div className="text-2xl font-bold text-slate-900">Laporan Acara: {program.name}</div>
        <p className="text-xs text-slate-600 mt-1">
          Tanggal Cetak: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Header Info Card */}
      <div className="pv-card border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                {program.name}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  STATUS_BADGE_CLASSES[program.status] || STATUS_BADGE_CLASSES.planning
                }`}
              >
                {PROGRAM_STATUS_LABELS[program.status] || program.status}
              </span>
            </div>

            {program.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
                {program.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-slate-600 dark:text-slate-400 pt-2">
              <div className="flex items-center gap-1.5">
                <AiOutlineCalendar className="w-4 h-4 text-slate-400" />
                <span>
                  {program.starts_on
                    ? `${formatDate(program.starts_on)}${program.ends_on ? ` s/d ${formatDate(program.ends_on)}` : ''}`
                    : 'Jadwal belum ditentukan'}
                </span>
              </div>
              {program.location && (
                <div className="flex items-center gap-1.5">
                  <AiOutlineEnvironment className="w-4 h-4 text-slate-400" />
                  <span>{program.location}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <AiOutlineUser className="w-4 h-4 text-slate-400" />
                <span>Ketua Acara: {leadName}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'summary'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Ringkasan & Realisasi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('budget')}
          className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'budget'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Anggaran (RAB)</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {budgetItems.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'transactions'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Daftar Transaksi</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {combinedTransactions.length}
          </span>
        </button>
      </div>

      {/* TAB 1: RINGKASAN */}
      <div
        data-testid="tab-section-summary"
        className={`space-y-6 ${activeTab === 'summary' ? 'block' : 'hidden print:block'}`}
      >
        {/* 5 Financial Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="pv-card p-4 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Rencana Pemasukan
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {formatRupiah(summary.planned?.income || 0)}
              </span>
            </div>
            <div className="pv-card p-4 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Realisasi Pemasukan
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatRupiah(summary.actual?.income || 0)}
              </span>
            </div>
            <div className="pv-card p-4 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Rencana Pengeluaran
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {formatRupiah(summary.planned?.expense || 0)}
              </span>
            </div>
            <div className="pv-card p-4 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Realisasi Pengeluaran
              </span>
              <span className="text-lg font-bold text-rose-600 dark:text-rose-400">
                {formatRupiah(summary.actual?.expense || 0)}
              </span>
            </div>
            <div className="pv-card p-4 border border-slate-200 dark:border-slate-800 sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Saldo Realisasi
              </span>
              <span
                className={`text-lg font-bold ${
                  (summary.actual?.balance || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatRupiah(summary.actual?.balance || 0)}
              </span>
            </div>
          </div>

          {/* Tabel Per Seksi */}
          <div className="pv-card border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Rincian Anggaran vs Realisasi Per Seksi
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Seksi</th>
                    <th className="py-2.5 px-4 font-medium">Jenis</th>
                    <th className="py-2.5 px-4 font-medium text-right">Rencana</th>
                    <th className="py-2.5 px-4 font-medium text-right">Realisasi</th>
                    <th className="py-2.5 px-4 font-medium text-right">Selisih</th>
                    <th className="py-2.5 px-4 font-medium text-right">Persen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(summary.sections || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                        Belum ada pos anggaran (RAB) yang ditentukan.
                      </td>
                    </tr>
                  ) : (
                    summary.sections.map((sec, idx) => {
                      const isOverBudget = sec.kind === 'expense' && sec.actual > sec.planned;
                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isOverBudget
                              ? 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 font-medium'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <td className="py-3 px-4 font-medium">{sec.section}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                sec.kind === 'income'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}
                            >
                              {sec.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-medium">{formatRupiah(sec.planned)}</td>
                          <td className="py-3 px-4 text-right font-semibold">{formatRupiah(sec.actual)}</td>
                          <td className="py-3 px-4 text-right">
                            {formatRupiah(sec.variance)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={isOverBudget ? 'text-rose-600 font-bold' : ''}>
                              {sec.percent}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {/* Baris Di Luar Anggaran */}
                  {((summary.unbudgeted?.income || 0) > 0 || (summary.unbudgeted?.expense || 0) > 0) && (
                    <>
                      {(summary.unbudgeted?.income || 0) > 0 && (
                        <tr className="bg-amber-50/50 dark:bg-amber-950/20 text-slate-700 dark:text-slate-300">
                          <td className="py-3 px-4 italic font-medium">Di Luar Anggaran (Pemasukan)</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Pemasukan
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">-</td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                            {formatRupiah(summary.unbudgeted.income)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">-</td>
                          <td className="py-3 px-4 text-right text-slate-400">-</td>
                        </tr>
                      )}
                      {(summary.unbudgeted?.expense || 0) > 0 && (
                        <tr className="bg-amber-50/50 dark:bg-amber-950/20 text-slate-700 dark:text-slate-300">
                          <td className="py-3 px-4 italic font-medium">Di Luar Anggaran (Pengeluaran)</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              Pengeluaran
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">-</td>
                          <td className="py-3 px-4 text-right font-semibold text-rose-600">
                            {formatRupiah(summary.unbudgeted.expense)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">-</td>
                          <td className="py-3 px-4 text-right text-slate-400">-</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* TAB 2: ANGGARAN (RAB) */}
      <div
        data-testid="tab-section-budget"
        className={`space-y-6 ${activeTab === 'budget' ? 'block' : 'hidden print:block'}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Rencana Anggaran Biaya (RAB)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daftar rincian pos pemasukan dan pengeluaran yang dialokasikan untuk kegiatan ini.
            </p>
          </div>
          {canManageBudget && (
            <button
              type="button"
              onClick={() => handleOpenAddBudgetItem('expense')}
              className="pv-button-primary flex items-center gap-1.5 text-xs sm:text-sm print:hidden"
            >
              <AiOutlinePlus className="w-4 h-4" />
              <span>Tambah Pos Anggaran</span>
            </button>
          )}
        </div>

          {/* Kelompok Pemasukan */}
          <div className="pv-card border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900 flex justify-between items-center">
              <h3 className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                Rencana Pemasukan
              </h3>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Total Rencana: {formatRupiah(summary.planned?.income || 0)}
              </span>
            </div>
            {Object.keys(groupedBudget.incomeSections).length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                Belum ada pos rencana pemasukan.
              </p>
            ) : (
              Object.entries(groupedBudget.incomeSections).map(([sectionName, items]) => {
                const secTotal = items.reduce((acc, it) => acc + (Number(it.amount) || (Number(it.quantity) * Number(it.unit_price || it.unitPrice || 0))), 0);
                return (
                  <div key={sectionName} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                      <span>Seksi: {sectionName}</span>
                      <span>Subtotal: {formatRupiah(secTotal)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="py-2 px-4">Item / Pos</th>
                            <th className="py-2 px-4 text-center">Qty</th>
                            <th className="py-2 px-4">Satuan</th>
                            <th className="py-2 px-4 text-right">Harga Satuan</th>
                            <th className="py-2 px-4 text-right">Total Rencana</th>
                            <th className="py-2 px-4 text-right">Realisasi</th>
                            {canManageBudget && <th className="py-2 px-4 text-center print:hidden">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {items.map((it) => {
                            const tot = Number(it.amount) || (Number(it.quantity) * Number(it.unit_price || it.unitPrice || 0));
                            const act = itemActualMap.get(String(it.id)) || 0;
                            return (
                              <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                                  {it.item}
                                  {it.notes && <span className="block text-[11px] text-slate-400">{it.notes}</span>}
                                </td>
                                <td className="py-2.5 px-4 text-center">{it.quantity}</td>
                                <td className="py-2.5 px-4 text-slate-500">{it.unit_label || it.unitLabel || '-'}</td>
                                <td className="py-2.5 px-4 text-right">{formatRupiah(it.unit_price || it.unitPrice || 0)}</td>
                                <td className="py-2.5 px-4 text-right font-semibold">{formatRupiah(tot)}</td>
                                <td className="py-2.5 px-4 text-right font-medium text-emerald-600">{formatRupiah(act)}</td>
                                {canManageBudget && (
                                  <td className="py-2.5 px-4 text-center print:hidden">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditBudgetItem(it)}
                                        className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded"
                                        title="Ubah"
                                      >
                                        <AiOutlineEdit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setItemToDelete(it)}
                                        className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                        title="Hapus"
                                      >
                                        <AiOutlineDelete className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Kelompok Pengeluaran */}
          <div className="pv-card border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-rose-50/60 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900 flex justify-between items-center">
              <h3 className="font-bold text-rose-900 dark:text-rose-300 text-sm">
                Rencana Pengeluaran
              </h3>
              <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                Total Rencana: {formatRupiah(summary.planned?.expense || 0)}
              </span>
            </div>
            {Object.keys(groupedBudget.expenseSections).length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                Belum ada pos rencana pengeluaran.
              </p>
            ) : (
              Object.entries(groupedBudget.expenseSections).map(([sectionName, items]) => {
                const secTotal = items.reduce((acc, it) => acc + (Number(it.amount) || (Number(it.quantity) * Number(it.unit_price || it.unitPrice || 0))), 0);
                return (
                  <div key={sectionName} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                      <span>Seksi: {sectionName}</span>
                      <span>Subtotal: {formatRupiah(secTotal)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="py-2 px-4">Item / Pos</th>
                            <th className="py-2 px-4 text-center">Qty</th>
                            <th className="py-2 px-4">Satuan</th>
                            <th className="py-2 px-4 text-right">Harga Satuan</th>
                            <th className="py-2 px-4 text-right">Total Rencana</th>
                            <th className="py-2 px-4 text-right">Realisasi</th>
                            {canManageBudget && <th className="py-2 px-4 text-center print:hidden">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {items.map((it) => {
                            const tot = Number(it.amount) || (Number(it.quantity) * Number(it.unit_price || it.unitPrice || 0));
                            const act = itemActualMap.get(String(it.id)) || 0;
                            const isOver = act > tot;
                            return (
                              <tr key={it.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 ${isOver ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}`}>
                                <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                                  {it.item}
                                  {it.notes && <span className="block text-[11px] text-slate-400">{it.notes}</span>}
                                </td>
                                <td className="py-2.5 px-4 text-center">{it.quantity}</td>
                                <td className="py-2.5 px-4 text-slate-500">{it.unit_label || it.unitLabel || '-'}</td>
                                <td className="py-2.5 px-4 text-right">{formatRupiah(it.unit_price || it.unitPrice || 0)}</td>
                                <td className="py-2.5 px-4 text-right font-semibold">{formatRupiah(tot)}</td>
                                <td className={`py-2.5 px-4 text-right font-semibold ${isOver ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {formatRupiah(act)}
                                </td>
                                {canManageBudget && (
                                  <td className="py-2.5 px-4 text-center print:hidden">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditBudgetItem(it)}
                                        className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded"
                                        title="Ubah"
                                      >
                                        <AiOutlineEdit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setItemToDelete(it)}
                                        className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                        title="Hapus"
                                      >
                                        <AiOutlineDelete className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      {/* TAB 3: TRANSAKSI */}
      <div
        data-testid="tab-section-transactions"
        className={`space-y-4 ${activeTab === 'transactions' ? 'block' : 'hidden print:block'}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Transaksi Acara</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pemasukan dan pengeluaran yang terhubung dengan kegiatan ini.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
              {canRecordIncome && (
                <button
                  type="button"
                  onClick={() => navigate(`/t/${tenantId}/incomes?program=${programId}&new=1`)}
                  className="pv-button-secondary text-xs sm:text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                >
                  <AiOutlinePlus className="w-4 h-4 inline mr-1" />
                  <span>Catat Pemasukan</span>
                </button>
              )}
              {canRecordExpense && (
                <button
                  type="button"
                  onClick={() => navigate(`/t/${tenantId}/expenses?program=${programId}&new=1`)}
                  className="pv-button-secondary text-xs sm:text-sm text-rose-700 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
                >
                  <AiOutlinePlus className="w-4 h-4 inline mr-1" />
                  <span>Catat Pengeluaran</span>
                </button>
              )}
            </div>
          </div>

          <div className="pv-card border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Tanggal</th>
                    <th className="py-2.5 px-4 font-medium">Jenis</th>
                    <th className="py-2.5 px-4 font-medium">Pos Anggaran</th>
                    <th className="py-2.5 px-4 font-medium">Pihak / Sumber</th>
                    <th className="py-2.5 px-4 font-medium">Keterangan</th>
                    <th className="py-2.5 px-4 font-medium text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {combinedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        Belum ada transaksi yang tercatat untuk acara ini.
                      </td>
                    </tr>
                  ) : (
                    combinedTransactions.map((tx) => {
                      const budgetItem = tx.budgetItemId ? budgetItemMap.get(String(tx.budgetItemId)) : null;
                      const isInc = tx.type === 'income';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-300">
                          <td className="py-3 px-4 font-medium">{formatDate(tx.date)}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                isInc
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}
                            >
                              {isInc ? 'Pemasukan' : 'Pengeluaran'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {budgetItem ? (
                              <div>
                                <span className="font-medium text-slate-900 dark:text-white">{budgetItem.item}</span>
                                <span className="block text-[11px] text-slate-400">{budgetItem.section}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-600 dark:text-amber-400 italic">
                                Di luar anggaran
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">{tx.party}</td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{tx.description}</td>
                          <td className={`py-3 px-4 text-right font-semibold ${isInc ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isInc ? `+${formatRupiah(tx.amount)}` : `-${formatRupiah(tx.amount)}`}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* Modal Edit Acara */}
      <Modal
        open={isEditModalOpen}
        onClose={() => !isSubmittingProgram && setIsEditModalOpen(false)}
        title="Ubah Data Acara"
        size="md"
      >
        <form onSubmit={handleSubmitEditProgram} className="space-y-4">
          <div>
            <label htmlFor="edit-program-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Acara <span className="text-rose-500">*</span>
            </label>
            <input
              id="edit-program-name"
              type="text"
              required
              value={programFormData.name}
              onChange={(e) => setProgramFormData({ ...programFormData, name: e.target.value })}
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="edit-program-description" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Deskripsi
            </label>
            <textarea
              id="edit-program-description"
              rows={2}
              value={programFormData.description}
              onChange={(e) => setProgramFormData({ ...programFormData, description: e.target.value })}
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="edit-program-location" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lokasi
            </label>
            <input
              id="edit-program-location"
              type="text"
              value={programFormData.location}
              onChange={(e) => setProgramFormData({ ...programFormData, location: e.target.value })}
              className="pv-input w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-program-starts-on" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Mulai
              </label>
              <input
                id="edit-program-starts-on"
                type="date"
                value={programFormData.startsOn}
                onChange={(e) => setProgramFormData({ ...programFormData, startsOn: e.target.value })}
                className="pv-input w-full"
              />
            </div>
            <div>
              <label htmlFor="edit-program-ends-on" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Selesai
              </label>
              <input
                id="edit-program-ends-on"
                type="date"
                value={programFormData.endsOn}
                onChange={(e) => setProgramFormData({ ...programFormData, endsOn: e.target.value })}
                className="pv-input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-program-lead" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ketua Acara
              </label>
              <select
                id="edit-program-lead"
                value={programFormData.leadMemberId}
                onChange={(e) => setProgramFormData({ ...programFormData, leadMemberId: e.target.value })}
                className="pv-select w-full"
              >
                <option value="">-- Pilih Ketua Acara --</option>
                {approvedMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.name || `Anggota (${m.id.slice(0, 6)})`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-program-status" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                id="edit-program-status"
                value={programFormData.status}
                onChange={(e) => setProgramFormData({ ...programFormData, status: e.target.value })}
                className="pv-select w-full"
              >
                <option value="planning">Perencanaan</option>
                <option value="running">Berjalan</option>
                <option value="done">Selesai</option>
                <option value="archived">Arsip</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmittingProgram}
              className="pv-button-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingProgram}
              className="pv-button-primary"
            >
              {isSubmittingProgram ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Quick Change Status */}
      <Modal
        open={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Ubah Status Acara"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Pilih status kegiatan acara saat ini:
          </p>
          <div className="space-y-2">
            {['planning', 'running', 'done', 'archived'].map((st) => (
              <label
                key={st}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedStatus === st
                    ? 'border-forest-600 bg-forest-50/50 dark:bg-forest-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {PROGRAM_STATUS_LABELS[st] || st}
                </span>
                <input
                  type="radio"
                  name="status"
                  value={st}
                  checked={selectedStatus === st}
                  onChange={() => setSelectedStatus(st)}
                  className="text-forest-600 focus:ring-forest-500"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsStatusModalOpen(false)}
              className="pv-button-secondary"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleUpdateStatus}
              className="pv-button-primary"
            >
              Simpan
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Delete Program */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => !isDeletingProgram && setIsDeleteModalOpen(false)}
        title="Hapus Acara"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Apakah Anda yakin ingin menghapus acara <strong className="text-slate-900 dark:text-white">"{program.name}"</strong>?
          </p>
          <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900">
            Perhatian: Acara yang sudah memiliki transaksi pemasukan atau pengeluaran tidak dapat dihapus. Anda dapat mengubah statusnya menjadi "Arsip".
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeletingProgram}
              className="pv-button-secondary"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteProgram}
              disabled={isDeletingProgram}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {isDeletingProgram ? 'Menghapus...' : 'Ya, Hapus Acara'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Form Tambah/Ubah Pos Anggaran (RAB) */}
      <Modal
        open={Boolean(budgetItemModal)}
        onClose={() => !isSubmittingBudget && setBudgetItemModal(null)}
        title={budgetItemModal === 'add' ? 'Tambah Pos Anggaran (RAB)' : 'Ubah Pos Anggaran (RAB)'}
        size="md"
      >
        <form onSubmit={handleSubmitBudgetItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="budget-kind" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Jenis Anggaran <span className="text-rose-500">*</span>
              </label>
              <select
                id="budget-kind"
                value={budgetFormData.kind}
                onChange={(e) => setBudgetFormData({ ...budgetFormData, kind: e.target.value })}
                className="pv-select w-full"
              >
                <option value="expense">Pengeluaran</option>
                <option value="income">Pemasukan</option>
              </select>
            </div>
            <div>
              <label htmlFor="budget-section" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Seksi / Divisi <span className="text-rose-500">*</span>
              </label>
              <input
                id="budget-section"
                type="text"
                required
                value={budgetFormData.section}
                onChange={(e) => setBudgetFormData({ ...budgetFormData, section: e.target.value })}
                placeholder="Contoh: Konsumsi / Perlengkapan"
                className="pv-input w-full"
              />
            </div>
          </div>

          <div>
            <label htmlFor="budget-item" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Pos / Item <span className="text-rose-500">*</span>
            </label>
            <input
              id="budget-item"
              type="text"
              required
              value={budgetFormData.item}
              onChange={(e) => setBudgetFormData({ ...budgetFormData, item: e.target.value })}
              placeholder="Contoh: Sewa Sound System / Snack Panitia"
              className="pv-input w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="budget-quantity" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kuantitas <span className="text-rose-500">*</span>
              </label>
              <input
                id="budget-quantity"
                type="number"
                min="1"
                step="any"
                required
                value={budgetFormData.quantity}
                onChange={(e) => setBudgetFormData({ ...budgetFormData, quantity: e.target.value })}
                className="pv-input w-full"
              />
            </div>
            <div>
              <label htmlFor="budget-unit" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Satuan
              </label>
              <input
                id="budget-unit"
                type="text"
                value={budgetFormData.unit_label}
                onChange={(e) => setBudgetFormData({ ...budgetFormData, unit_label: e.target.value })}
                placeholder="paket, kotak, org"
                className="pv-input w-full"
              />
            </div>
            <div>
              <label htmlFor="budget-price" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Harga Satuan (Rp) <span className="text-rose-500">*</span>
              </label>
              <input
                id="budget-price"
                type="number"
                min="0"
                step="any"
                required
                value={budgetFormData.unit_price}
                onChange={(e) => setBudgetFormData({ ...budgetFormData, unit_price: e.target.value })}
                className="pv-input w-full"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex justify-between items-center text-xs">
            <span className="text-slate-500">Estimasi Total Rencana:</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {formatRupiah(Number(budgetFormData.quantity || 0) * Number(budgetFormData.unit_price || 0))}
            </span>
          </div>

          <div>
            <label htmlFor="budget-notes" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Catatan
            </label>
            <input
              id="budget-notes"
              type="text"
              value={budgetFormData.notes}
              onChange={(e) => setBudgetFormData({ ...budgetFormData, notes: e.target.value })}
              placeholder="Catatan tambahan (opsional)"
              className="pv-input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setBudgetItemModal(null)}
              disabled={isSubmittingBudget}
              className="pv-button-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingBudget}
              className="pv-button-primary"
            >
              {isSubmittingBudget ? 'Menyimpan...' : 'Simpan Pos'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Pos Anggaran */}
      <Modal
        open={Boolean(itemToDelete)}
        onClose={() => !isDeletingItem && setItemToDelete(null)}
        title="Hapus Pos Anggaran"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Apakah Anda yakin ingin menghapus pos anggaran <strong className="text-slate-900 dark:text-white">"{itemToDelete?.item}"</strong>?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setItemToDelete(null)}
              disabled={isDeletingItem}
              className="pv-button-secondary"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteBudgetItem}
              disabled={isDeletingItem}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {isDeletingItem ? 'Menghapus...' : 'Ya, Hapus Pos'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
