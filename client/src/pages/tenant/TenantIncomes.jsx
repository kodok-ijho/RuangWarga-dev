import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineReload,
  AiOutlineFilter,
} from 'react-icons/ai';
import { useTenant } from '../../context/TenantContext';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/Modal';
import { MobileList, EmptyState, SkeletonTable, SkeletonCard } from '../../components/ui';
import {
  fetchTenantIncomes,
  createTenantIncome,
  updateTenantIncome,
  deleteTenantIncome,
  fetchPrograms,
  fetchBudgetItems,
  getProgramAccessState,
} from '../../services/tenantOperationalService';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import { getLocalDateString } from '../../utils/date';

export const PAYMENT_METHOD_LABELS = {
  cash: 'Tunai',
  bank_transfer: 'Transfer Bank',
  qris: 'QRIS',
  other: 'Lainnya',
};

export default function TenantIncomes() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTenant, activeMember } = useTenant();
  const tenantId = params.tenantId || activeTenant?.id || null;

  const tenantAccess = useTenantAccess();
  const { canTransact, isReadOnly: subReadOnly } = useSubscriptionGate();
  const template = useTenantTemplate(activeTenant?.type || 'rt_rw');
  const toast = useToast();

  const canWrite = Boolean(tenantAccess.canRecordIncome && canTransact);

  const [incomes, setIncomes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [filterMonth, setFilterMonth] = useState('');
  const [filterProgram, setFilterProgram] = useState(searchParams.get('program') || '');
  const [filterCategory, setFilterCategory] = useState('');

  const [modalForm, setModalForm] = useState(null); // null | 'add' | income obj
  const [initialProgramForForm, setInitialProgramForForm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const categories = useMemo(() => {
    if (Array.isArray(template?.incomeCategories) && template.incomeCategories.length > 0) {
      return template.incomeCategories;
    }
    return ['Iuran', 'Sponsorship', 'Donasi', 'Penjualan Tiket', 'Lain-lain'];
  }, [template?.incomeCategories]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [incomeData, programData] = await Promise.all([
        fetchTenantIncomes(tenantId),
        fetchPrograms(tenantId).catch(() => []),
      ]);
      setIncomes(Array.isArray(incomeData) ? incomeData : []);
      setPrograms(Array.isArray(programData) ? programData : []);
    } catch (err) {
      console.error('[TenantIncomes] load error:', err);
      const msg = err.message || 'Gagal memuat data pemasukan.';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle URL query ?program=<id>&new=1
  useEffect(() => {
    const qProgram = searchParams.get('program');
    const qNew = searchParams.get('new');
    if (qNew === '1' && canWrite) {
      if (qProgram) {
        const targetProg = programs.find((p) => String(p.id) === String(qProgram));
        if (targetProg) {
          const accessState = getProgramAccessState(targetProg, { tenantType: activeTenant?.type });
          if (!accessState.writable) {
            toast.error('Acara belum aktif atau masa aktifnya habis. Transaksi acara ini hanya bisa dilihat.');
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('new');
              return next;
            }, { replace: true });
            return;
          }
        }
        setInitialProgramForForm(qProgram);
      }
      setModalForm('add');
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      }, { replace: true });
    }
  }, [searchParams, canWrite, programs, activeTenant?.type, setSearchParams, toast]);

  const programMap = useMemo(() => {
    const map = new Map();
    for (const p of programs) {
      map.set(p.id, p.name);
    }
    return map;
  }, [programs]);

  const availableMonths = useMemo(() => {
    const set = new Set(
      incomes
        .map((i) => (i.date || i.incomeDate || i.income_date || '').substring(0, 7))
        .filter(Boolean)
    );
    return Array.from(set).sort().reverse();
  }, [incomes]);

  const filtered = useMemo(() => {
    return incomes
      .filter((inc) => {
        const d = inc.date || inc.incomeDate || inc.income_date || '';
        if (filterMonth && !d.startsWith(filterMonth)) return false;
        if (filterProgram && (inc.program_id !== filterProgram && inc.programId !== filterProgram)) return false;
        if (filterCategory && inc.category !== filterCategory) return false;
        return true;
      })
      .sort((a, b) => {
        const da = a.date || a.incomeDate || a.income_date || '';
        const db = b.date || b.incomeDate || b.income_date || '';
        return db.localeCompare(da);
      });
  }, [incomes, filterMonth, filterProgram, filterCategory]);

  const totalAmount = useMemo(() => {
    return filtered.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [filtered]);

  const handleSave = async (formData) => {
    if (!canWrite) {
      toast.warning('Tindakan tidak diizinkan dalam mode Read-Only atau tanpa izin pencatatan.');
      return;
    }
    try {
      setIsSaving(true);
      if (modalForm === 'add') {
        await createTenantIncome(tenantId, { ...formData, memberId: activeMember?.id || null });
        toast.success(`Pemasukan "${formData.category}" berhasil dicatat.`);
      } else {
        await updateTenantIncome(tenantId, modalForm.id, formData);
        toast.success('Pemasukan berhasil diperbarui.');
      }
      setModalForm(null);
      setInitialProgramForForm('');
      await loadData();
    } catch (err) {
      console.error('[TenantIncomes] save error:', err);
      toast.error(err.message || 'Gagal menyimpan pemasukan.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (inc) => {
    if (!canWrite) {
      toast.warning('Tindakan tidak diizinkan dalam mode Read-Only.');
      return;
    }
    const label = inc.sourceName || inc.source_name || inc.category || 'transaksi ini';
    if (!window.confirm(`Hapus pemasukan dari "${label}" senilai ${formatRupiah(inc.amount)}?`)) {
      return;
    }
    try {
      setIsLoading(true);
      await deleteTenantIncome(tenantId, inc.id, { memberId: activeMember?.id || null });
      toast.success('Pemasukan berhasil dihapus.');
      await loadData();
    } catch (err) {
      console.error('[TenantIncomes] delete error:', err);
      toast.error(err.message || 'Gagal menghapus pemasukan.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Read-Only Subscription Banner */}
      {subReadOnly && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-900 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-900">Mode Read-Only Aktif</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Langganan tenant ini sedang dalam masa tenggang / non-aktif. Anda tetap dapat melihat data pemasukan, namun penambahan, pengubahan, dan penghapusan pemasukan dinonaktifkan.
            </p>
          </div>
        </div>
      )}

      {/* Header & Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Pemasukan Kas {activeTenant?.name || 'Komunitas'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {filtered.length} transaksi · Total {formatRupiah(totalAmount)}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setInitialProgramForForm('');
              setModalForm('add');
            }}
            className="pv-btn-primary text-xs shadow-xs"
          >
            <AiOutlinePlus /> Catat Pemasukan
          </button>
        )}
      </div>

      {/* Total Card */}
      <div className="pv-card p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200/80">
        <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
          Total Pemasukan {filterMonth ? `(${filterMonth})` : 'Terfilter'}
        </p>
        <p className="text-2xl font-extrabold text-emerald-700 font-mono mt-1">
          + {formatRupiah(totalAmount)}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="pv-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="pv-input text-xs"
          >
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="pv-input text-xs"
          >
            <option value="">Semua Bulan</option>
            {availableMonths.map((m) => {
              const [y, mo] = m.split('-');
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
              return (
                <option key={m} value={m}>{months[parseInt(mo, 10) - 1]} {y}</option>
              );
            })}
          </select>

          {programs.length > 0 && (
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="pv-input text-xs"
            >
              <option value="">Semua Acara</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Content / List */}
      {isLoading ? (
        <>
          <div className="space-y-3 md:hidden">
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
          </div>
          <div className="hidden md:block">
            <SkeletonTable cols={6} rows={5} />
          </div>
        </>
      ) : loadError ? (
        <div className="pv-card p-6 border-rose-200 bg-rose-50/50 text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 text-xl font-bold">
            ⚠️
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">Gagal Memuat Data Pemasukan</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="pv-btn-primary inline-flex items-center gap-2 text-xs"
          >
            <AiOutlineReload className="text-sm" />
            <span>Coba Lagi</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="💰"
          title={
            filterCategory || filterMonth || filterProgram
              ? 'Tidak Ditemukan Pemasukan'
              : 'Belum Ada Pemasukan Kas'
          }
          description={
            filterCategory || filterMonth || filterProgram
              ? 'Tidak ada transaksi pemasukan yang sesuai dengan kriteria filter.'
              : 'Belum ada catatan pemasukan kas yang dibukukan untuk komunitas ini.'
          }
          action={
            filterCategory || filterMonth || filterProgram ? (
              <button
                type="button"
                onClick={() => {
                  setFilterCategory('');
                  setFilterMonth('');
                  setFilterProgram('');
                }}
                className="pv-btn-ghost text-xs shadow-2xs"
              >
                Reset Filter
              </button>
            ) : canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setInitialProgramForForm('');
                  setModalForm('add');
                }}
                className="pv-btn-primary text-xs shadow-xs"
              >
                <AiOutlinePlus /> Catat Pemasukan Pertama
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Mobile Card List */}
          <div className="block md:hidden">
            <MobileList
              items={filtered}
              keyExtractor={(inc) => inc.id}
              renderItem={(inc) => {
                const pId = inc.program_id || inc.programId;
                const progName = pId ? programMap.get(pId) : null;
                const d = inc.date || inc.incomeDate || inc.income_date;
                return (
                  <div key={inc.id} className="pv-card p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{inc.category}</span>
                          {progName && (
                            <span className="pv-badge bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-semibold">
                              🎪 {progName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDate(d)} · Sumber: <span className="font-semibold text-slate-700">{inc.sourceName || inc.source_name}</span>
                        </p>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-600 font-mono whitespace-nowrap">
                        + {formatRupiah(inc.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>{PAYMENT_METHOD_LABELS[inc.paymentMethod || inc.payment_method] || 'Lainnya'}</span>
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setModalForm(inc)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <AiOutlineEdit />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(inc)}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <AiOutlineDelete />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {/* Desktop Clean Table */}
          <div className="hidden md:block pv-card overflow-hidden border border-slate-200 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-xs uppercase text-slate-700 font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Tanggal</th>
                    <th className="px-5 py-3">Kategori &amp; Acara</th>
                    <th className="px-5 py-3">Sumber</th>
                    <th className="px-5 py-3">Metode &amp; No. Ref</th>
                    <th className="px-5 py-3">Keterangan</th>
                    <th className="px-5 py-3 text-right">Nominal</th>
                    {canWrite && <th className="px-5 py-3 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((inc) => {
                    const pId = inc.program_id || inc.programId;
                    const progName = pId ? programMap.get(pId) : null;
                    const d = inc.date || inc.incomeDate || inc.income_date;
                    const method = PAYMENT_METHOD_LABELS[inc.paymentMethod || inc.payment_method] || 'Lainnya';
                    const refNum = inc.referenceNumber || inc.reference_number;
                    return (
                      <tr key={inc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-600">
                          {formatDate(d)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{inc.category}</span>
                            {progName && (
                              <span className="pv-badge bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-semibold">
                                🎪 {progName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-800 font-medium">
                          {inc.sourceName || inc.source_name}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {method}{refNum ? ` · ${refNum}` : ''}
                        </td>
                        <td className="px-5 py-3.5 max-w-xs text-xs text-slate-600 truncate">
                          {inc.description || '-'}
                        </td>
                        <td className="px-5 py-3.5 text-right font-extrabold text-emerald-600 font-mono tabular-nums whitespace-nowrap">
                          + {formatRupiah(inc.amount)}
                        </td>
                        {canWrite && (
                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setModalForm(inc)}
                                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <AiOutlineEdit />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(inc)}
                                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <AiOutlineDelete />
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
        </>
      )}

      {/* Modal Form */}
      {modalForm && canWrite && (
        <IncomeFormModal
          tenantId={tenantId}
          tenantType={activeTenant?.type}
          income={modalForm === 'add' ? null : modalForm}
          categories={categories}
          programs={programs}
          initialProgramId={initialProgramForForm}
          isSaving={isSaving}
          onSave={handleSave}
          onClose={() => {
            setModalForm(null);
            setInitialProgramForForm('');
          }}
        />
      )}
    </div>
  );
}

function IncomeFormModal({
  tenantId,
  tenantType,
  income,
  categories = [],
  programs = [],
  initialProgramId = '',
  isSaving = false,
  onSave,
  onClose,
}) {
  const isEdit = Boolean(income);

  const [form, setForm] = useState({
    date: income?.date || income?.incomeDate || income?.income_date || getLocalDateString(),
    category: income?.category || categories[0] || 'Iuran',
    sourceName: income?.sourceName || income?.source_name || '',
    amount: income?.amount || '',
    paymentMethod: income?.paymentMethod || income?.payment_method || 'other',
    referenceNumber: income?.referenceNumber || income?.reference_number || '',
    description: income?.description || '',
    programId: income?.programId || income?.program_id || initialProgramId || '',
    budgetItemId: income?.budgetItemId || income?.budget_item_id || '',
  });

  const [budgetItems, setBudgetItems] = useState([]);
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(false);

  // Load budget items when programId is selected
  useEffect(() => {
    let isCancelled = false;
    if (!form.programId || !tenantId) {
      setBudgetItems([]);
      return;
    }

    setLoadingBudgetItems(true);
    fetchBudgetItems(tenantId, form.programId)
      .then((items) => {
        if (!isCancelled) {
          // Hanya pos income
          const incomeItems = (items || []).filter((b) => b.kind === 'income');
          setBudgetItems(incomeItems);
        }
      })
      .catch((err) => {
        console.error('[IncomeFormModal] fetchBudgetItems error:', err);
        if (!isCancelled) setBudgetItems([]);
      })
      .finally(() => {
        if (!isCancelled) setLoadingBudgetItems(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [tenantId, form.programId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmount = Number(form.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return;
    }
    if (!form.sourceName.trim()) {
      return;
    }

    onSave({
      incomeDate: form.date,
      date: form.date,
      category: form.category,
      sourceName: form.sourceName.trim(),
      amount: numAmount,
      paymentMethod: form.paymentMethod,
      referenceNumber: form.referenceNumber ? form.referenceNumber.trim() : null,
      description: form.description ? form.description.trim() : null,
      programId: form.programId || null,
      budgetItemId: form.budgetItemId || null,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit Pemasukan Kas' : 'Catat Pemasukan Kas'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="pv-input text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kategori <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="pv-input text-xs"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Sumber Pemasukan <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={form.sourceName}
            onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
            required
            className="pv-input text-xs"
            placeholder="Contoh: Sponsor Bank Mandiri, Tiket Presale, Donatur Bpk. Joko"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Nominal Pemasukan (Rp) <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              Rp
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
              min="1"
              step="any"
              className="pv-input pl-10 text-xs font-bold font-mono"
              placeholder="Contoh: 15000000"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Metode Pembayaran <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              className="pv-input text-xs"
            >
              <option value="cash">Tunai</option>
              <option value="bank_transfer">Transfer Bank</option>
              <option value="qris">QRIS</option>
              <option value="other">Lainnya</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              No. Referensi / Bukti <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={form.referenceNumber}
              onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
              className="pv-input text-xs"
              placeholder="Contoh: TRX-9988221"
            />
          </div>
        </div>

        {/* Tautan Acara & Pos Anggaran (hanya bila tenant punya acara) */}
        {programs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tautkan ke Acara <span className="text-slate-400 font-normal">(opsional)</span>
              </label>
              <select
                id="income-program-select"
                aria-label="Tautkan ke Acara"
                value={form.programId}
                onChange={(e) => {
                  const newPid = e.target.value;
                  setForm((prev) => ({ ...prev, programId: newPid, budgetItemId: '' }));
                }}
                className="pv-input text-xs bg-white"
              >
                <option value="">Bukan Acara (Operasional Umum)</option>
                {programs.map((p) => {
                  const state = getProgramAccessState(p, { tenantType });
                  const suffix = !state.writable
                    ? (state.state === 'expired' ? ' (masa aktif habis)' : ' (belum aktif)')
                    : '';
                  return (
                    <option key={p.id} value={p.id} disabled={!state.writable}>
                      {p.name}{suffix}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pos Anggaran (RAB) <span className="text-slate-400 font-normal">(opsional)</span>
              </label>
              <select
                id="income-budget-select"
                aria-label="Pos Anggaran (RAB)"
                value={form.budgetItemId}
                onChange={(e) => setForm({ ...form, budgetItemId: e.target.value })}
                disabled={!form.programId || loadingBudgetItems}
                className="pv-input text-xs bg-white disabled:opacity-50"
              >
                <option value="">Di luar pos anggaran</option>
                {budgetItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.section ? `[${b.section}] ` : ''}{b.item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Keterangan <span className="text-slate-400 font-normal">(opsional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="pv-input resize-none text-xs"
            placeholder="Catatan tambahan mengenai pemasukan ini..."
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="pv-btn-ghost text-xs disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="pv-btn-primary text-xs disabled:opacity-50"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan Pemasukan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
