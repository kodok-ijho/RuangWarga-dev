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
  AiOutlineFileText,
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
  getTenantBankAccount,
  createProgramDues,
  updateProgramDuesAmount,
  cancelProgramDues,
  recordProgramDuesCash,
  fetchProgramDocuments,
  uploadProgramDocument,
  deleteProgramDocument,
  getProgramDocumentUrl,
  PROGRAM_DOC_TYPES,
  getProgramAccessState,
  formatProgramAccessLabel,
} from '../../services/tenantOperationalService';
import { buildProgramDuesReminderMessage, buildWaLink } from '../../utils/waReminder';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import { STATUS_BADGE_CLASSES, ACCESS_STATE_BADGE_CLASSES } from './Programs';
import MemberBillPayModal from '../../components/payments/MemberBillPayModal';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function ProgramDetail() {
  const { tenantId: routeTenantId, programId } = useParams();
  const { activeTenant, activeMember } = useTenant();
  const tenantId = routeTenantId || activeTenant?.id;
  const navigate = useNavigate();

  const tenantAccess = useTenantAccess();
  const { canTransact } = useSubscriptionGate();
  const toast = useToast();

  const canManagePrograms = Boolean(tenantAccess.canManagePrograms && canTransact);
  const canManageBudget = Boolean(tenantAccess.canManageBudget && canTransact);
  const canRecordIncome = Boolean(tenantAccess.canRecordIncome && canTransact);
  const canRecordExpense = Boolean(tenantAccess.canManageExpenses && canTransact);
  const canGenerateBilling = Boolean(tenantAccess.canGenerateBilling && canTransact);
  const canRecordCash = Boolean(tenantAccess.canRecordCash && canTransact);
  const canVerifyPayments = Boolean(tenantAccess.canVerifyPayments && canTransact);
  const canManageDocs = Boolean(
    (tenantAccess.canManagePrograms || tenantAccess.canManageExpenses) && canTransact
  );

  const [program, setProgram] = useState(null);
  const [budgetItems, setBudgetItems] = useState([]);
  const [transactions, setTransactions] = useState({ incomes: [], expenses: [], dues: [] });
  const [members, setMembers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'budget' | 'transactions' | 'dues' | 'documents'
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Modal Dokumen Acara (PANITIA-3.4)
  const [isUploadDocModalOpen, setIsUploadDocModalOpen] = useState(false);
  const [isSubmittingDoc, setIsSubmittingDoc] = useState(false);
  const [docFormData, setDocFormData] = useState({
    docType: 'proposal',
    title: '',
    file: null,
  });

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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

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

  // Modal Dues Form (Terbitkan Iuran) (PANITIA-2.3)
  const [isCreateDuesModalOpen, setIsCreateDuesModalOpen] = useState(false);
  const [isSubmittingDues, setIsSubmittingDues] = useState(false);
  const [duesFormData, setDuesFormData] = useState({
    amount: '',
    dueDate: '',
    note: '',
    selectedMemberIds: [],
  });

  // Modal Edit Due Amount
  const [isEditDueModalOpen, setIsEditDueModalOpen] = useState(false);
  const [dueToEdit, setDueToEdit] = useState(null);
  const [editDueAmount, setEditDueAmount] = useState('');
  const [isSubmittingEditDue, setIsSubmittingEditDue] = useState(false);

  // Modal Pay Due (Member) (PANITIA-2.4)
  const [payDueModalBill, setPayDueModalBill] = useState(null);

  const loadData = useCallback(async () => {
    if (!tenantId || !programId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [progData, itemsData, transData, membersData, docsData] = await Promise.all([
        fetchProgram(tenantId, programId),
        fetchBudgetItems(tenantId, programId).catch(() => []),
        fetchProgramTransactions(tenantId, programId).catch(() => ({ incomes: [], expenses: [], dues: [] })),
        fetchTenantMembers(tenantId).catch(() => []),
        fetchProgramDocuments(tenantId, programId).catch(() => []),
      ]);

      if (!progData) {
        throw new Error('Data acara tidak ditemukan.');
      }

      setProgram(progData);
      setBudgetItems(itemsData || []);
      setTransactions(transData || { incomes: [], expenses: [], dues: [] });
      setMembers(membersData || []);
      setDocuments(docsData || []);
    } catch (err) {
      setLoadError(err.message || 'Gagal memuat detail acara.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, programId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ringkasan Keuangan Acara (termasuk Iuran Acara)
  const summary = useMemo(() => {
    return summarizeProgram(
      budgetItems,
      transactions.incomes,
      transactions.expenses,
      transactions.dues || []
    );
  }, [budgetItems, transactions]);

  // Daftar Iuran Acara
  const duesList = useMemo(() => {
    return transactions.dues || [];
  }, [transactions]);

  // Pengelompokan Dokumen per Tipe (PANITIA-3.4)
  const docsByType = useMemo(() => {
    const groups = {};
    Object.keys(PROGRAM_DOC_TYPES).forEach((key) => {
      groups[key] = [];
    });
    (documents || []).forEach((doc) => {
      const type = doc.doc_type || 'lainnya';
      if (!groups[type]) groups[type] = [];
      groups[type].push(doc);
    });
    return groups;
  }, [documents]);

  // Rekening Bank Penerima dari Pengaturan Tenant
  const tenantBankAccount = useMemo(() => {
    return getTenantBankAccount(activeTenant);
  }, [activeTenant]);

  // Iuran Anggota Login di Acara Ini (PANITIA-2.4)
  const myDueInProgram = useMemo(() => {
    if (!activeMember?.id) return null;
    return duesList.find(
      (d) => d.member_id === activeMember.id && d.status !== 'cancelled'
    );
  }, [duesList, activeMember?.id]);

  // Status Masa Aktif Acara (HARGA.2, HARGA.3)
  const programAccess = useMemo(() => {
    return getProgramAccessState(program, { tenantType: activeTenant?.type });
  }, [program, activeTenant?.type]);
  const isProgramWritable = programAccess.writable;
  const accessLabel = formatProgramAccessLabel(programAccess);

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
    setIsUpdatingStatus(true);
    try {
      const updated = await updateProgram(tenantId, programId, { status: selectedStatus });
      setProgram(updated);
      toast.success('Status acara berhasil diubah.');
      setIsStatusModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status acara.');
    } finally {
      setIsUpdatingStatus(false);
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

  // --- Handlers Iuran Panitia (PANITIA-2.3) ---
  const handleOpenCreateDuesModal = () => {
    const activeDueMemberIds = new Set(
      duesList.filter((d) => d.status !== 'cancelled').map((d) => d.member_id)
    );
    const defaultSelected = approvedMembers
      .filter((m) => !activeDueMemberIds.has(m.id))
      .map((m) => m.id);

    const today = new Date().toISOString().split('T')[0];
    const defaultDueDate = program?.starts_on && program.starts_on >= today
      ? program.starts_on
      : today;

    setDuesFormData({
      amount: '',
      dueDate: defaultDueDate,
      note: '',
      selectedMemberIds: defaultSelected,
    });
    setIsCreateDuesModalOpen(true);
  };

  const handleSubmitCreateDues = async (e) => {
    e.preventDefault();
    const amountNum = Number(duesFormData.amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Nominal iuran harus lebih besar dari 0.');
      return;
    }
    if (!duesFormData.dueDate) {
      toast.error('Tanggal jatuh tempo wajib diisi.');
      return;
    }
    if (!duesFormData.selectedMemberIds.length) {
      toast.error('Pilih setidaknya satu anggota untuk ditagih.');
      return;
    }

    setIsSubmittingDues(true);
    try {
      const res = await createProgramDues(tenantId, programId, {
        amount: amountNum,
        dueDate: duesFormData.dueDate,
        memberIds: duesFormData.selectedMemberIds,
        note: duesFormData.note,
        programName: program?.name,
      });
      toast.success(`${res.created} iuran diterbitkan, ${res.skipped} sudah ada.`);
      setIsCreateDuesModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal menerbitkan iuran.');
    } finally {
      setIsSubmittingDues(false);
    }
  };

  const handleOpenEditDueAmount = (due) => {
    setDueToEdit(due);
    setEditDueAmount(due.amount || '');
    setIsEditDueModalOpen(true);
  };

  const handleSubmitEditDueAmount = async (e) => {
    e.preventDefault();
    const num = Number(editDueAmount);
    if (!num || num <= 0) {
      toast.error('Nominal harus lebih besar dari 0.');
      return;
    }

    setIsSubmittingEditDue(true);
    try {
      await updateProgramDuesAmount(tenantId, dueToEdit.id, num);
      toast.success('Nominal iuran berhasil diubah.');
      setIsEditDueModalOpen(false);
      setDueToEdit(null);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah nominal iuran.');
    } finally {
      setIsSubmittingEditDue(false);
    }
  };

  const handleRecordCash = async (due) => {
    if (!due) return;
    const confirmCash = window.confirm(`Catat pembayaran tunai sebesar ${formatRupiah(due.amount)} dari ${due.member?.full_name || 'anggota'}?`);
    if (!confirmCash) return;

    try {
      await recordProgramDuesCash(tenantId, due.id, {
        note: `Pembayaran tunai iuran acara ${program?.name || ''}`,
      });
      toast.success('Pembayaran tunai berhasil dicatat.');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal mencatat pembayaran tunai.');
    }
  };

  const handleCancelDue = async (due) => {
    if (!due) return;
    const confirmCancel = window.confirm(`Batalkan iuran untuk ${due.member?.full_name || 'anggota'}?`);
    if (!confirmCancel) return;

    try {
      await cancelProgramDues(tenantId, due.id);
      toast.success('Iuran berhasil dibatalkan.');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal membatalkan iuran.');
    }
  };

  // --- Handlers Dokumen Acara (PANITIA-3.4) ---
  const handleOpenDocument = async (doc) => {
    try {
      const url = await getProgramDocumentUrl(doc.file_path);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Gagal membuka dokumen.');
      }
    } catch (err) {
      toast.error(err.message || 'Gagal membuka dokumen.');
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!docFormData.file) {
      toast.error('Pilih file dokumen yang akan diunggah.');
      return;
    }
    if (!docFormData.title.trim()) {
      toast.error('Judul dokumen wajib diisi.');
      return;
    }
    setIsSubmittingDoc(true);
    try {
      await uploadProgramDocument(tenantId, programId, {
        docType: docFormData.docType,
        title: docFormData.title,
        file: docFormData.file,
      });
      toast.success('Dokumen berhasil diunggah.');
      setIsUploadDocModalOpen(false);
      setDocFormData({ docType: 'proposal', title: '', file: null });
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah dokumen.');
    } finally {
      setIsSubmittingDoc(false);
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Hapus dokumen "${doc.title}"?`)) return;
    try {
      await deleteProgramDocument(tenantId, doc.id);
      toast.success('Dokumen berhasil dihapus.');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus dokumen.');
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
      [],
      ['--- DAFTAR IURAN PANITIA ---'],
      ['Nama Anggota', 'Nominal (Rp)', 'Jatuh Tempo', 'Status'],
      ...duesList.map((d) => [
        d.member?.full_name || d.member?.name || `Anggota ${d.member_id}`,
        d.amount,
        d.due_date || '-',
        d.status === 'paid'
          ? 'Lunas'
          : d.status === 'pending_verification'
          ? 'Menunggu Verifikasi'
          : d.status === 'cancelled'
          ? 'Dibatalkan'
          : 'Belum Bayar',
      ]),
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
          <button
            type="button"
            onClick={() => navigate(`/t/${tenantId}/programs/${programId}/lpj`)}
            className="pv-button-secondary flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <AiOutlineFileText className="w-4 h-4" />
            <span>Susun LPJ</span>
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
              {accessLabel && programAccess.state !== 'unlimited' && (
                <span
                  data-testid="program-access-badge"
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    ACCESS_STATE_BADGE_CLASSES[programAccess.state] || ACCESS_STATE_BADGE_CLASSES.active
                  }`}
                >
                  {accessLabel}
                </span>
              )}
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

      {/* Banner Iuran Pribadi (PANITIA-2.4) */}
      {myDueInProgram && (
        <div
          data-testid="my-due-banner"
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 flex-wrap print:hidden ${
            myDueInProgram.status === 'paid'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300'
              : myDueInProgram.status === 'pending_verification'
              ? 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300'
              : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="font-semibold">Iuran Anda:</span>
            <span>{formatRupiah(myDueInProgram.amount)}</span>
            <span>•</span>
            {myDueInProgram.status === 'paid' && (
              <span className="font-bold text-emerald-700 dark:text-emerald-400">Lunas</span>
            )}
            {myDueInProgram.status === 'pending_verification' && (
              <span className="font-bold text-blue-700 dark:text-blue-400">
                Menunggu verifikasi bendahara
              </span>
            )}
            {myDueInProgram.status === 'unpaid' && (
              <span className="font-bold text-amber-700 dark:text-amber-400">Belum bayar</span>
            )}
          </div>

          {myDueInProgram.status === 'unpaid' && (
            <button
              type="button"
              disabled={!isProgramWritable}
              title={!isProgramWritable ? 'Acara belum aktif / masa aktif habis — hanya bisa dilihat' : undefined}
              onClick={() => setPayDueModalBill(myDueInProgram)}
              className="pv-button-primary px-3 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Bayar
            </button>
          )}
        </div>
      )}

      {/* Panel Masa Aktif Acara (HARGA.4) */}
      {(activeTenant?.type === 'panitia' || programAccess.state !== 'unlimited') && canManagePrograms && (
        <div
          data-testid="program-access-panel"
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Masa Aktif Acara
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                  ACCESS_STATE_BADGE_CLASSES[programAccess.state] || ACCESS_STATE_BADGE_CLASSES.inactive
                }`}
              >
                {formatProgramAccessLabel(programAccess)}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {programAccess.state === 'free_trial' ? (
                `Gratis sampai ${programAccess.until ? formatDate(programAccess.until) : '-'}. Setelah itu aktifkan Rp25.000 / 12 bulan.`
              ) : programAccess.state === 'active' ? (
                `Aktif sampai ${programAccess.until ? formatDate(programAccess.until) : '-'}. Tarif perpanjangan Rp25.000 / 12 bulan.`
              ) : programAccess.state === 'expired' ? (
                `Masa aktif habis sejak ${programAccess.until ? formatDate(programAccess.until) : '-'}. Aktifkan kembali Rp25.000 / 12 bulan.`
              ) : (
                `Belum aktif. Tarif aktivasi Rp25.000 / 12 bulan.`
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
              Rp25.000 / 12 bulan
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Pembayaran QRIS segera tersedia"
                className="pv-button-secondary text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aktifkan / Perpanjang
              </button>
              <span className="text-[11px] text-slate-500 italic">
                Pembayaran QRIS segera tersedia
              </span>
            </div>
          </div>
        </div>
      )}

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
        <button
          type="button"
          onClick={() => setActiveTab('dues')}
          className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'dues'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Iuran</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {duesList.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'documents'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Dokumen</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {documents.length}
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

                  {/* Baris Iuran Panitia (PANITIA-2.3) */}
                  {(summary.dues?.billed || 0) > 0 && (
                    <tr className="bg-sky-50/50 dark:bg-sky-950/20 text-slate-700 dark:text-slate-300">
                      <td className="py-3 px-4 font-medium">Iuran panitia</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Pemasukan
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-medium">
                        {formatRupiah(summary.dues.billed)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                        {formatRupiah(summary.dues.collected)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatRupiah(summary.dues.collected - summary.dues.billed)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {summary.dues.billed > 0
                          ? `${Math.round((summary.dues.collected / summary.dues.billed) * 100)}%`
                          : '0%'}
                      </td>
                    </tr>
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
                  disabled={!isProgramWritable}
                  title={!isProgramWritable ? 'Acara belum aktif / masa aktif habis — hanya bisa dilihat' : undefined}
                  onClick={() => navigate(`/t/${tenantId}/incomes?program=${programId}&new=1`)}
                  className="pv-button-secondary text-xs sm:text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AiOutlinePlus className="w-4 h-4 inline mr-1" />
                  <span>Catat Pemasukan</span>
                </button>
              )}
              {canRecordExpense && (
                <button
                  type="button"
                  disabled={!isProgramWritable}
                  title={!isProgramWritable ? 'Acara belum aktif / masa aktif habis — hanya bisa dilihat' : undefined}
                  onClick={() => navigate(`/t/${tenantId}/expenses?program=${programId}&new=1`)}
                  className="pv-button-secondary text-xs sm:text-sm text-rose-700 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* TAB 4: IURAN PANITIA (PANITIA-2.3) */}
      <div
        data-testid="tab-section-dues"
        className={`space-y-6 ${activeTab === 'dues' ? 'block' : 'hidden print:block'}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Iuran Panitia Acara</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Iuran wajib kepanitiaan untuk mendanai kegiatan {program?.name}.
            </p>
          </div>
          {canGenerateBilling && (
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                disabled={!isProgramWritable}
                title={!isProgramWritable ? 'Acara belum aktif / masa aktif habis — hanya bisa dilihat' : undefined}
                onClick={handleOpenCreateDuesModal}
                className="pv-button-primary flex items-center gap-1.5 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AiOutlinePlus className="w-4 h-4" />
                <span>Terbitkan Iuran</span>
              </button>
            </div>
          )}
        </div>

        {/* Info Rekening Penerima */}
        {!tenantBankAccount ? (
          <div data-testid="missing-bank-alert" className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300 flex items-center justify-between gap-4 text-xs sm:text-sm print:hidden">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Perhatian:</span>
              <span>Isi rekening penerima di Pengaturan agar anggota bisa transfer.</span>
            </div>
            {tenantAccess.canManageSettings && (
              <button
                type="button"
                onClick={() => navigate(`/t/${tenantId}/settings`)}
                className="text-amber-900 dark:text-amber-200 underline font-semibold shrink-0"
              >
                Pengaturan
              </button>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <span className="font-medium text-slate-500">Rekening Penerima:</span>
            <span className="font-bold text-slate-800 dark:text-white">
              {tenantBankAccount.bank_name} {tenantBankAccount.account_number}
            </span>
            <span>a.n. {tenantBankAccount.account_holder}</span>
          </div>
        )}

        {/* 5 Kartu Ringkasan Iuran */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="pv-card p-3.5 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
              Anggota Ditagih
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {summary.dues?.count || duesList.length} orang
            </span>
          </div>
          <div className="pv-card p-3.5 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
              Total Ditagih
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {formatRupiah(summary.dues?.billed || 0)}
            </span>
          </div>
          <div className="pv-card p-3.5 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
              Terkumpul
            </span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatRupiah(summary.dues?.collected || 0)}
            </span>
          </div>
          <div className="pv-card p-3.5 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
              Menunggu Verifikasi
            </span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatRupiah(summary.dues?.pending || 0)}
            </span>
          </div>
          <div className="pv-card p-3.5 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
              Belum Bayar
            </span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {summary.dues?.unpaidCount || 0} orang
            </span>
          </div>
        </div>

        {/* Tabel Anggota Iuran */}
        <div className="pv-card border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Nama Anggota</th>
                  <th className="py-2.5 px-4 font-medium text-right">Nominal</th>
                  <th className="py-2.5 px-4 font-medium">Jatuh Tempo</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-center print:hidden">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {duesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      Belum ada iuran yang diterbitkan untuk acara ini.
                    </td>
                  </tr>
                ) : (
                  duesList.map((due) => {
                    const memberName = due.member?.full_name || due.member?.name || `Anggota ${due.member_id}`;
                    const waMessage = buildProgramDuesReminderMessage({
                      memberName,
                      programName: program?.name,
                      amount: due.amount,
                      dueDate: due.due_date,
                      bankAccount: tenantBankAccount,
                      tenantName: activeTenant?.name,
                      appUrl: typeof window !== 'undefined' ? `${window.location.origin}/t/${tenantId}/programs/${programId}` : '',
                    });
                    const waUrl = buildWaLink(due.member?.phone, waMessage);

                    return (
                      <tr key={due.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          <div>{memberName}</div>
                          {due.member?.phone && (
                            <div className="text-xs text-slate-400">{due.member.phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {formatRupiah(due.amount)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {due.due_date ? formatDate(due.due_date) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {due.status === 'paid' && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Lunas
                            </span>
                          )}
                          {due.status === 'pending_verification' && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                              Menunggu verifikasi
                            </span>
                          )}
                          {due.status === 'unpaid' && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                              Belum bayar
                            </span>
                          )}
                          {due.status === 'cancelled' && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400">
                              Dibatalkan
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {due.status === 'unpaid' && canRecordCash && (
                              <button
                                type="button"
                                disabled={!isProgramWritable}
                                onClick={() => handleRecordCash(due)}
                                className="px-2 py-1 text-xs font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!isProgramWritable ? 'Acara belum aktif / masa aktif habis — hanya bisa dilihat' : 'Catat Tunai'}
                              >
                                Catat Tunai
                              </button>
                            )}
                            {due.status === 'unpaid' && (
                              isProgramWritable ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1 text-xs font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors inline-block"
                                  title="Ingatkan via WA"
                                >
                                  Ingatkan via WA
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="px-2 py-1 text-xs font-medium rounded bg-emerald-50 text-emerald-700 opacity-50 cursor-not-allowed dark:bg-emerald-950/40 dark:text-emerald-300"
                                  title="Acara belum aktif / masa aktif habis — hanya bisa dilihat"
                                >
                                  Ingatkan via WA
                                </button>
                              )
                            )}
                            {due.status === 'unpaid' && canGenerateBilling && (
                              <button
                                type="button"
                                disabled={!isProgramWritable}
                                onClick={() => handleOpenEditDueAmount(due)}
                                className="px-2 py-1 text-xs font-medium rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!isProgramWritable ? 'Acara belum aktif / masa aktif habis — hanya bisa dilihat' : 'Ubah Nominal'}
                              >
                                Ubah Nominal
                              </button>
                            )}
                            {due.status === 'unpaid' && canGenerateBilling && (
                              <button
                                type="button"
                                onClick={() => handleCancelDue(due)}
                                className="px-2 py-1 text-xs font-medium rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Batalkan"
                              >
                                Batalkan
                              </button>
                            )}
                            {due.status === 'pending_verification' && canVerifyPayments && (
                              <button
                                type="button"
                                onClick={() => navigate(`/t/${tenantId}/payment-verification`)}
                                className="px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 transition-colors"
                                title="Verifikasi Pembayaran"
                              >
                                Verifikasi
                              </button>
                            )}
                          </div>
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

      {/* TAB 5: DOKUMEN (PANITIA-3.4) */}
      <div
        data-testid="tab-section-documents"
        className={'space-y-6 ' + (activeTab === 'documents' ? 'block' : 'hidden print:block')}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dokumen Acara</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Proposal, RAB, rundown, denah, surat, dan dokumen pendukung lainnya.
            </p>
          </div>
          {canManageDocs && (
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setIsUploadDocModalOpen(true)}
                className="pv-button-primary text-xs sm:text-sm flex items-center gap-1.5"
              >
                <AiOutlinePlus className="w-4 h-4" />
                <span>Unggah Dokumen</span>
              </button>
            </div>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="pv-card border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
            <p className="text-sm">Belum ada dokumen yang diunggah untuk acara ini.</p>
            {canManageDocs && (
              <p className="text-xs text-slate-500 mt-1">
                Klik tombol &quot;Unggah Dokumen&quot; untuk menambahkan proposal, RAB, atau berkas lainnya.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(PROGRAM_DOC_TYPES).map(([typeKey, typeLabel]) => {
              const docs = docsByType[typeKey] || [];
              if (docs.length === 0) return null;

              return (
                <div key={typeKey} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      {typeLabel}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {docs.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="pv-card border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={doc.title}>
                              {doc.title}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5" title={doc.file_name}>
                              {doc.file_name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 mt-2">
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>•</span>
                              <span>{formatDate(doc.created_at)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleOpenDocument(doc)}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-forest-50 text-forest-700 hover:bg-forest-100 dark:bg-forest-950/40 dark:text-forest-300 transition-colors"
                          >
                            Buka
                          </button>
                          {canManageDocs && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc)}
                              className="px-3 py-1.5 text-xs font-medium rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Terbitkan Iuran (PANITIA-2.3) */}
      <Modal
        open={isCreateDuesModalOpen}
        onClose={() => !isSubmittingDues && setIsCreateDuesModalOpen(false)}
        title="Terbitkan Iuran Acara"
        size="md"
      >
        <form onSubmit={handleSubmitCreateDues} className="space-y-4">
          <div>
            <label htmlFor="dues-amount" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nominal per Anggota (Rp) <span className="text-rose-500">*</span>
            </label>
            <input
              id="dues-amount"
              type="number"
              min="1"
              required
              placeholder="Contoh: 50000"
              value={duesFormData.amount}
              onChange={(e) => setDuesFormData({ ...duesFormData, amount: e.target.value })}
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="dues-due-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Jatuh Tempo <span className="text-rose-500">*</span>
            </label>
            <input
              id="dues-due-date"
              type="date"
              required
              value={duesFormData.dueDate}
              onChange={(e) => setDuesFormData({ ...duesFormData, dueDate: e.target.value })}
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="dues-note" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Catatan (Opsional)
            </label>
            <input
              id="dues-note"
              type="text"
              placeholder="Contoh: Iuran operasional panitia pentas seni"
              value={duesFormData.note}
              onChange={(e) => setDuesFormData({ ...duesFormData, note: e.target.value })}
              className="pv-input w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pilih Anggota Ditagih ({duesFormData.selectedMemberIds.length} dipilih) <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDuesFormData({
                      ...duesFormData,
                      selectedMemberIds: approvedMembers.map((m) => m.id),
                    })
                  }
                  className="text-xs text-forest-700 dark:text-forest-400 hover:underline"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() =>
                    setDuesFormData({
                      ...duesFormData,
                      selectedMemberIds: [],
                    })
                  }
                  className="text-xs text-slate-500 hover:underline"
                >
                  Batal Semua
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg p-2 space-y-1">
              {approvedMembers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Belum ada anggota terdaftar.</p>
              ) : (
                approvedMembers.map((m) => {
                  const isChecked = duesFormData.selectedMemberIds.includes(m.id);
                  const hasDue = duesList.some(
                    (d) => d.member_id === m.id && d.status !== 'cancelled'
                  );
                  return (
                    <label
                      key={m.id}
                      className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDuesFormData({
                                ...duesFormData,
                                selectedMemberIds: [...duesFormData.selectedMemberIds, m.id],
                              });
                            } else {
                              setDuesFormData({
                                ...duesFormData,
                                selectedMemberIds: duesFormData.selectedMemberIds.filter(
                                  (id) => id !== m.id
                                ),
                              });
                            }
                          }}
                          className="rounded text-forest-600 focus:ring-forest-500"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {m.full_name || m.name}
                        </span>
                        {m.is_owner && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                            Owner
                          </span>
                        )}
                      </div>
                      {hasDue && (
                        <span className="text-[11px] text-slate-400 italic">
                          (Sudah ada iuran)
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmittingDues}
              onClick={() => setIsCreateDuesModalOpen(false)}
              className="pv-button-secondary text-xs sm:text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingDues || duesFormData.selectedMemberIds.length === 0}
              className="pv-button-primary text-xs sm:text-sm"
            >
              {isSubmittingDues ? 'Menerbitkan...' : 'Terbitkan Iuran'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Ubah Nominal Iuran (PANITIA-2.3) */}
      <Modal
        open={isEditDueModalOpen}
        onClose={() => !isSubmittingEditDue && setIsEditDueModalOpen(false)}
        title="Ubah Nominal Iuran"
        size="sm"
      >
        <form onSubmit={handleSubmitEditDueAmount} className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-2">
              Ubah nominal iuran untuk <strong>{dueToEdit?.member?.full_name || 'anggota'}</strong>.
            </p>
            <label htmlFor="edit-due-amount" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nominal Baru (Rp) <span className="text-rose-500">*</span>
            </label>
            <input
              id="edit-due-amount"
              type="number"
              min="1"
              required
              value={editDueAmount}
              onChange={(e) => setEditDueAmount(e.target.value)}
              className="pv-input w-full"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmittingEditDue}
              onClick={() => setIsEditDueModalOpen(false)}
              className="pv-button-secondary text-xs sm:text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingEditDue}
              className="pv-button-primary text-xs sm:text-sm"
            >
              {isSubmittingEditDue ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

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
        onClose={() => !isUpdatingStatus && setIsStatusModalOpen(false)}
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
                  disabled={isUpdatingStatus}
                  className="text-forest-600 focus:ring-forest-500"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => setIsStatusModalOpen(false)}
              className="pv-button-secondary disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={handleUpdateStatus}
              className="pv-button-primary disabled:opacity-50"
            >
              {isUpdatingStatus ? 'Menyimpan...' : 'Simpan'}
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
      {/* Modal Bayar Iuran Saya (PANITIA-2.4) */}
      {payDueModalBill && (
        <MemberBillPayModal
          tenantId={tenantId}
          bill={payDueModalBill}
          title={`Bayar Iuran: ${program?.name || 'Acara'}`}
          onClose={() => setPayDueModalBill(null)}
          onPaid={loadData}
        />
      )}

      {/* Modal Unggah Dokumen Acara (PANITIA-3.4) */}
      <Modal
        open={isUploadDocModalOpen}
        onClose={() => !isSubmittingDoc && setIsUploadDocModalOpen(false)}
        title="Unggah Dokumen Acara"
        size="md"
      >
        <form onSubmit={handleUploadDocument} className="space-y-4">
          <div>
            <label htmlFor="doc-type" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tipe Dokumen <span className="text-rose-500">*</span>
            </label>
            <select
              id="doc-type"
              value={docFormData.docType}
              onChange={(e) => {
                const docType = e.target.value;
                setDocFormData((prev) => ({ ...prev, docType }));
              }}
              className="pv-select w-full"
            >
              {Object.entries(PROGRAM_DOC_TYPES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="doc-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Judul Dokumen <span className="text-rose-500">*</span>
            </label>
            <input
              id="doc-title"
              type="text"
              required
              maxLength={150}
              placeholder="Contoh: Proposal Malam Keakraban"
              value={docFormData.title}
              onChange={(e) => {
                const title = e.target.value;
                setDocFormData((prev) => ({ ...prev, title }));
              }}
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="doc-file" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Pilih Berkas (Maks 10 MB) <span className="text-rose-500">*</span>
            </label>
            <input
              id="doc-file"
              data-testid="doc-file-input"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setDocFormData((prev) => ({ ...prev, file }));
              }}
              className="pv-input w-full text-xs"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Format didukung: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG, PNG, WebP.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmittingDoc}
              onClick={() => setIsUploadDocModalOpen(false)}
              className="pv-button-secondary text-xs sm:text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingDoc}
              className="pv-button-primary text-xs sm:text-sm"
            >
              {isSubmittingDoc ? 'Mengunggah...' : 'Unggah Dokumen'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
