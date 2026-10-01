import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlinePaperClip,
  AiOutlineReload,
  AiOutlineFilePdf,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useSubscriptionGate } from '../hooks/useSubscriptionGate';
import { useTenantTemplate } from '../hooks/useTenantTemplate';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import { MobileList, EmptyState, SkeletonTable, SkeletonCard } from '../components/ui';
import { ExpenseCard, ExpenseDetailDrawer } from '../components/finance';
import {
  fetchExpenses,
  fetchEvents,
  fetchMyEventAccess,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../services/dataService';
import {
  formatRupiah,
  formatDate,
  hasMinRole,
  isBendaharaOrAbove,
  canModifyData,
} from '../services/dataHelpers';
import { compressImage } from '../utils/imageCompressor';
import { createReceiptSignedUrl, isValidExpenseReceiptPath } from '../utils/storagePolicy';
import { supabase } from '../services/supabaseClient';

const EXPENSE_CATEGORIES = [
  'Kebersihan',
  'Keamanan',
  'Perawatan Fasilitas',
  'Listrik & Air',
  'Administrasi',
  'Acara Warga',
  'Lain-lain',
];

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

export default function Expenses() {
  const params = useParams();
  const { role, profile, session, isReadOnly: authReadOnly, isAuthenticated } = useAuth();
  const { currentTenant } = useTenant();
  const activeTenantId = params.tenantId || currentTenant?.id || null;
  const { canWrite: subCanWrite, isReadOnly: subReadOnly } = useSubscriptionGate(activeTenantId);
  const template = useTenantTemplate(currentTenant?.type || 'rt_rw');

  const token = session?.access_token;
  const toast = useToast();
  // `null` means capability discovery is still in flight. Do not redirect an
  // assigned event user while the asynchronous access response is pending.
  const [eventAccess, setEventAccess] = useState(null);
  const [eventOptions, setEventOptions] = useState([]);
  const isStaff = hasMinRole(role, 'pengurus');
  const canEditGeneral = isBendaharaOrAbove(role);
  const manageableEventIds = useMemo(() => new Set(
    (eventAccess?.events || []).filter((item) => item.can_manage_finance).map((item) => item.event_id)
  ), [eventAccess?.events]);
  const canEdit = canEditGeneral || manageableEventIds.size > 0;
  const canWrite = (canModifyData(role) || manageableEventIds.size > 0) && !authReadOnly && subCanWrite;

  const requestIdRef = useRef(0);
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(activeTenantId));
  const [loadError, setLoadError] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [modalForm, setModalForm] = useState(null); // null | 'add' | expense obj
  const [viewReceipt, setViewReceipt] = useState(null); // expense obj
  const [receiptImageError, setReceiptImageError] = useState(false);
  const [selectedExpenseForDrawer, setSelectedExpenseForDrawer] = useState(null);

  // Signed URL state for private receipt storage
  const [signedReceiptUrl, setSignedReceiptUrl] = useState(null);
  const [isLoadingSignedReceipt, setIsLoadingSignedReceipt] = useState(false);
  const [signedReceiptError, setSignedReceiptError] = useState(null);

  const loadExpenses = useCallback(async () => {
    if (!isAuthenticated) return;
    if (!activeTenantId) {
      setIsLoading(false);
      setExpenses([]);
      setLoadError(null);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchExpenses(token, { tenantId: activeTenantId });
      if (requestIdRef.current !== currentRequestId) return;
      setExpenses(Array.isArray(data) ? data : []);

      try {
        const [events, access] = await Promise.all([
          fetchEvents(token, { role, profileId: profile?.id }),
          fetchMyEventAccess(token, { role, profileId: profile?.id }),
        ]);
        if (requestIdRef.current !== currentRequestId) return;
        setEventOptions(events || []);
        setEventAccess(access || { events: [] });
      } catch {
        if (requestIdRef.current !== currentRequestId) return;
        setEventOptions([]);
        setEventAccess({ events: [] });
      }
    } catch (err) {
      if (requestIdRef.current !== currentRequestId) return;
      if (err?.status !== 401) {
        const message = err?.code === 'API_TIMEOUT'
          ? 'Koneksi ke layanan pengeluaran terlalu lama. Silakan coba lagi.'
          : err?.code === 'INVALID_API_RESPONSE' || err?.code === 'INVALID_EXPENSES_RESPONSE'
            ? 'Layanan pengeluaran mengembalikan respons yang tidak valid.'
            : err?.message || 'Gagal mengambil data pengeluaran.';
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated, profile?.id, role, token, activeTenantId, toast]);

  // Reset tenant-specific transient UI state when switching tenants (F-01)
  useEffect(() => {
    setSelectedExpenseForDrawer(null);
    setViewReceipt(null);
    setModalForm(null);
    setSignedReceiptUrl(null);
    setSignedReceiptError(null);
    setReceiptImageError(false);
  }, [activeTenantId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Load private signed URL when a receipt is inspected
  useEffect(() => {
    let isCancelled = false;
    if (!viewReceipt) {
      setSignedReceiptUrl(null);
      setSignedReceiptError(null);
      setIsLoadingSignedReceipt(false);
      return;
    }

    const receiptRef = viewReceipt.receipt_url || viewReceipt.receipt_file_url || '';
    if (!receiptRef) {
      setSignedReceiptUrl(null);
      setSignedReceiptError(null);
      setIsLoadingSignedReceipt(false);
      return;
    }

    if (receiptRef.startsWith('http://') || receiptRef.startsWith('https://')) {
      setSignedReceiptUrl(receiptRef);
      setIsLoadingSignedReceipt(false);
      return;
    }

    if (isValidExpenseReceiptPath(receiptRef)) {
      setIsLoadingSignedReceipt(true);
      setSignedReceiptError(null);
      createReceiptSignedUrl(supabase, receiptRef, 3600)
        .then((url) => {
          if (!isCancelled) {
            setSignedReceiptUrl(url);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            // eslint-disable-next-line no-console
            console.error('Failed to create signed receipt URL:', err);
            setSignedReceiptError('Gagal memuat URL aman bukti pengeluaran.');
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingSignedReceipt(false);
          }
        });
    } else {
      setSignedReceiptUrl(null);
      setIsLoadingSignedReceipt(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [viewReceipt]);

  // Bulan tersedia dari data
  const availableMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => (e.date || e.expense_date) ? (e.date || e.expense_date).substring(0, 7) : ''));
    return [...set].filter(Boolean).sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => {
        if (filterCategory && e.category !== filterCategory) return false;
        const date = e.date || e.expense_date;
        if (filterMonth && (!date || !date.startsWith(filterMonth))) return false;
        return true;
      })
      .sort((a, b) => (b.date || b.expense_date || '').localeCompare(a.date || a.expense_date || ''));
  }, [expenses, filterCategory, filterMonth]);

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);

  // Staff-only (pengurus, bendahara, admin)
  if (!isStaff && eventAccess === null) {
    return <div className="pv-card p-8 text-center text-sm text-slate-500">Memeriksa akses event...</div>;
  }

  if (!isStaff && manageableEventIds.size === 0) {
    return <Navigate to="/" replace />;
  }

  const handleSave = async (data, file) => {
    if (authReadOnly || subReadOnly || !canWrite) {
      toast.warning('⚠️ Tindakan tidak diizinkan dalam mode Read-Only.');
      return;
    }
    try {
      setIsLoading(true);
      if (modalForm === 'add') {
        await createExpense(token, { ...data, file, tenantId: activeTenantId, recordedBy: profile?.id });
        toast.success(`Pengeluaran "${data.category}" berhasil dicatat.`);
      } else {
        await updateExpense(token, modalForm.id, { ...data, file, tenantId: activeTenantId });
        toast.success('Pengeluaran berhasil diperbarui.');
      }
      setModalForm(null);
      loadExpenses();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pengeluaran.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (exp) => {
    if (authReadOnly || subReadOnly || !canWrite) {
      toast.warning('⚠️ Tindakan tidak diizinkan dalam mode Read-Only.');
      return;
    }
    if (!confirm(`Hapus pengeluaran "${String(exp.description || '').substring(0, 40)}..."?`)) return;
    try {
      setIsLoading(true);
      await deleteExpense(token, exp.id, { tenantId: activeTenantId });
      toast.success('Pengeluaran berhasil dihapus.');
      loadExpenses();
    } catch (err) {
      toast.error('Gagal menghapus pengeluaran.');
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
              Langganan tenant ini sedang dalam masa tenggang / non-aktif. Anda tetap dapat melihat data pengeluaran, namun penambahan, pengubahan, dan penghapusan pengeluaran dinonaktifkan.
            </p>
          </div>
        </div>
      )}

      {/* Read-only banner */}
      {!canEdit && (
        <div className="pv-card p-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span>Anda melihat data pengeluaran dalam mode read-only. Hanya Bendahara yang dapat mencatat/mengubah pengeluaran.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Pengeluaran Kas {currentTenant?.name || 'Komunitas'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {filtered.length} transaksi · Total {formatRupiah(totalAmount)}
          </p>
        </div>
        {canEdit && canWrite && (
          <button onClick={() => setModalForm('add')} className="pv-btn-primary text-xs shadow-xs">
            <AiOutlinePlus /> Catat Pengeluaran
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="pv-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="pv-input"
          >
            <option value="">Semua Kategori</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="pv-input"
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
        </div>
      </div>

      {/* Daftar pengeluaran */}
      {isLoading ? (
        <>
          <div className="space-y-3 md:hidden">
            <SkeletonCard rows={2} />
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
            <h3 className="text-base font-bold text-slate-900">Gagal Memuat Data Pengeluaran</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto">{loadError}</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => loadExpenses()}
              className="pv-btn-primary inline-flex items-center gap-2 text-xs"
            >
              <AiOutlineReload className="text-sm" />
              <span>Coba Lagi</span>
            </button>
          </div>
        </div>
      ) : !activeTenantId ? (
        <div className="pv-card p-8 text-center text-sm text-slate-500">
          Silakan pilih tenant terlebih dahulu untuk mengelola data pengeluaran.
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="💸"
          title={
            filterCategory || filterMonth
              ? 'Tidak Ditemukan Pengeluaran'
              : 'Belum Ada Pengeluaran Kas'
          }
          description={
            filterCategory || filterMonth
              ? 'Tidak ada transaksi pengeluaran kas yang sesuai dengan filter kategori atau bulan yang dipilih.'
              : 'Belum ada catatan pengeluaran kas yang dibukukan untuk periode komunitas ini.'
          }
          action={
            filterCategory || filterMonth ? (
              <button
                type="button"
                onClick={() => {
                  setFilterCategory('');
                  setFilterMonth('');
                }}
                className="pv-btn-ghost text-xs shadow-2xs"
              >
                Reset Filter
              </button>
            ) : canEdit && canWrite ? (
              <button
                type="button"
                onClick={() => setModalForm('add')}
                className="pv-btn-primary text-xs shadow-xs"
              >
                <AiOutlinePlus /> Catat Pengeluaran Pertama
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Mobile Card List (< 768px) */}
          <div className="block md:hidden">
            <MobileList
              items={filtered}
              keyExtractor={(exp) => exp.id}
              emptyMessage="Belum ada pengeluaran tercatat."
              renderItem={(exp) => {
                const canEditThis = canEdit && canWrite && ((exp.scope || 'general') === 'event' ? manageableEventIds.has(exp.event_id) : canEditGeneral);
                return (
                  <ExpenseCard
                    expense={exp}
                    canEdit={canEditThis}
                    onViewReceipt={(item) => {
                      setReceiptImageError(false);
                      setViewReceipt(item);
                    }}
                    onEdit={(item) => setModalForm(item)}
                    onDelete={(item) => handleDelete(item)}
                    onSelect={(item) => setSelectedExpenseForDrawer(item)}
                  />
                );
              }}
            />
          </div>

          {/* Desktop Clean Table (>= 768px) */}
          <div className="hidden md:block pv-card overflow-hidden border border-slate-200 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-xs uppercase text-slate-700 font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Tanggal</th>
                    <th className="px-5 py-3">Kategori & Lingkup</th>
                    <th className="px-5 py-3">Keterangan</th>
                    <th className="px-5 py-3">Dicatat Oleh</th>
                    <th className="px-5 py-3 text-center">Bukti</th>
                    <th className="px-5 py-3 text-right">Nominal</th>
                    {canEdit && canWrite && (
                      <th className="px-5 py-3 text-center">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((exp) => {
                    const canEditThis = canEdit && canWrite && ((exp.scope || 'general') === 'event' ? manageableEventIds.has(exp.event_id) : canEditGeneral);
                    return (
                      <tr
                        key={exp.id}
                        onClick={() => setSelectedExpenseForDrawer(exp)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-600">
                          {formatDate(exp.date || exp.expense_date)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{exp.category}</span>
                            <span className="pv-badge bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                              {exp.scope === 'event' ? '🎪 Event' : '🏡 Kas Umum'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 max-w-xs text-xs text-slate-600 truncate">
                          {exp.description || '-'}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-500">
                          {exp.recorded_by || '-'}
                        </td>
                        <td className="px-5 py-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {exp.receipt_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptImageError(false);
                                setViewReceipt(exp);
                              }}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold pv-focus-ring"
                              title="Lihat Bukti Kwitansi"
                              aria-label={`Lihat bukti kwitansi ${exp.category}`}
                            >
                              <AiOutlinePaperClip className="text-sm" aria-hidden="true" />
                              <span>Nota</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-extrabold text-rose-600 font-mono tabular-nums whitespace-nowrap">
                          - {formatRupiah(exp.amount)}
                        </td>
                        {canEdit && canWrite && (
                          <td className="px-5 py-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {canEditThis ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setModalForm(exp)}
                                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors pv-focus-ring"
                                  title="Edit"
                                  aria-label={`Edit pengeluaran ${exp.category}`}
                                >
                                  <AiOutlineEdit aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(exp)}
                                  className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors pv-focus-ring"
                                  title="Hapus"
                                  aria-label={`Hapus pengeluaran ${exp.category}`}
                                >
                                  <AiOutlineDelete aria-hidden="true" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-300">-</span>
                            )}
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

      {/* Expense Detail Drawer */}
      <ExpenseDetailDrawer
        isOpen={!!selectedExpenseForDrawer}
        onClose={() => setSelectedExpenseForDrawer(null)}
        expense={selectedExpenseForDrawer}
        canEdit={
          canEdit &&
          canWrite &&
          selectedExpenseForDrawer &&
          ((selectedExpenseForDrawer.scope || 'general') === 'event'
            ? manageableEventIds.has(selectedExpenseForDrawer.event_id)
            : canEditGeneral)
        }
        onEdit={(item) => {
          setSelectedExpenseForDrawer(null);
          setModalForm(item);
        }}
        onDelete={(item) => {
          setSelectedExpenseForDrawer(null);
          handleDelete(item);
        }}
        onViewReceipt={(item) => {
          setReceiptImageError(false);
          setViewReceipt(item);
        }}
        eventOptions={eventOptions}
      />

      {/* Modal form */}
      {modalForm && canWrite && (
        <ExpenseFormModal
          expense={modalForm === 'add' ? null : modalForm}
          initialScope={canEditGeneral ? 'general' : 'event'}
          eventOptions={eventOptions}
          manageableEventIds={manageableEventIds}
          canEditGeneral={canEditGeneral}
          isSaving={isLoading}
          onSave={handleSave}
          onClose={() => setModalForm(null)}
        />
      )}

      {/* Modal lihat bukti */}
      {viewReceipt && (
        <Modal
          open
          onClose={() => {
            setViewReceipt(null);
            setReceiptImageError(false);
            setSignedReceiptUrl(null);
            setSignedReceiptError(null);
          }}
          title="Bukti Kwitansi / Pembayaran"
          size="md"
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900 font-bold">{viewReceipt.category}</strong> · {formatDate(viewReceipt.date || viewReceipt.expense_date)}
            </p>
            <p className="text-xl font-extrabold text-slate-900">{formatRupiah(viewReceipt.amount)}</p>
            {viewReceipt.description && (
              <p className="text-sm text-slate-600">{viewReceipt.description}</p>
            )}

            {isLoadingSignedReceipt ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center space-y-2">
                <div className="h-6 w-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Memuat tautan aman bukti transaksi...</p>
              </div>
            ) : signedReceiptError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700">
                ⚠️ {signedReceiptError}
              </div>
            ) : signedReceiptUrl ? (
              <div className="space-y-4">
                {(() => {
                  const isPdf = signedReceiptUrl.toLowerCase().includes('.pdf') || (viewReceipt.receipt_file || '').toLowerCase().endsWith('.pdf');
                  const thumb = getGoogleDriveThumbnail(signedReceiptUrl);
                  const imageSrc = thumb || signedReceiptUrl;

                  if (isPdf) {
                    return (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-3">
                        <AiOutlineFilePdf size={44} className="mx-auto text-rose-500" />
                        <div>
                          <p className="text-sm font-bold text-slate-900">Dokumen Nota (PDF)</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{viewReceipt.receipt_file || 'nota.pdf'}</p>
                        </div>
                      </div>
                    );
                  }

                  if (!receiptImageError) {
                    return (
                      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-2 max-h-[360px]">
                        <img
                          src={imageSrc}
                          alt="Bukti Kwitansi"
                          referrerPolicy="no-referrer"
                          className="object-contain max-h-[340px] w-full rounded-lg shadow-xs"
                          onError={() => {
                            // eslint-disable-next-line no-console
                            console.error('Failed to load image preview');
                            setReceiptImageError(true);
                          }}
                        />
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-2">
                      <AiOutlinePaperClip size={36} className="mx-auto text-slate-500" />
                      <p className="text-sm font-semibold text-slate-800">Lampiran Bukti Kwitansi</p>
                      {receiptImageError && (
                        <p className="text-[11px] text-amber-700 font-medium">⚠️ Gagal memuat pratinjau gambar secara langsung.</p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex justify-center">
                  <a
                    href={signedReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors w-full"
                  >
                    👁️ Buka Bukti Nota di Tab Baru
                  </a>
                </div>
              </div>
            ) : viewReceipt.receipt_file ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <AiOutlinePaperClip size={32} className="mx-auto text-slate-400" />
                <p className="text-sm font-semibold text-slate-700 mt-2">{viewReceipt.receipt_file}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Bukti tersimpan. Pratinjau berkas hanya tersedia pada sistem penyimpanan aktif.
                </p>
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────
function ExpenseFormModal({ expense, initialScope = 'general', eventOptions = [], manageableEventIds = new Set(), canEditGeneral = false, isSaving, onSave, onClose }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const isEdit = !!expense;
  const [form, setForm] = useState({
    date: expense?.date || new Date().toISOString().split('T')[0],
    category: expense?.category || EXPENSE_CATEGORIES[0],
    amount: expense?.amount || '',
    description: expense?.description || '',
    scope: expense?.scope || initialScope,
    event_id: expense?.event_id || '',
    receipt_file: expense?.receipt_file || '',
  });
  const [fileName, setFileName] = useState(expense?.receipt_file || '');

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB canonical storage limit
  const [uploadError, setUploadError] = useState('');

  const handleFile = async (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setFileName('');
      setForm({ ...form, receipt_file: '' });
      setSelectedFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Format tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.');
      setFileName('');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi batas 5 MB.');
      setFileName('');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }

    if (file.type === 'application/pdf') {
      setFileName(file.name);
      setForm({ ...form, receipt_file: file.name });
      setSelectedFile(file);
      return;
    }

    try {
      const result = await compressImage(file);
      const compressedFile = result.file;
      if (compressedFile.size > MAX_SIZE) {
        setUploadError('Ukuran file melebihi batas 5 MB setelah kompresi.');
        setFileName('');
        setSelectedFile(null);
        e.target.value = '';
        return;
      }
      setFileName(compressedFile.name);
      setForm({ ...form, receipt_file: compressedFile.name });
      setSelectedFile(compressedFile);
    } catch {
      setFileName(file.name);
      setForm({ ...form, receipt_file: file.name });
      setSelectedFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.description.trim()) {
      return;
    }
    if (form.scope === 'event' && !form.event_id) {
      return;
    }
    const numAmount = Number(form.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return;
    }
    onSave({ ...form, amount: numAmount, description: form.description.trim() }, selectedFile);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Pengeluaran' : 'Catat Pengeluaran'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="pv-input text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="pv-input text-xs"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Lingkup Pengeluaran</label>
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value, event_id: '' })}
              className="pv-input text-xs"
            >
              {canEditGeneral && <option value="general">Operasional Umum</option>}
              {(canEditGeneral || manageableEventIds.size > 0) && <option value="event">Kegiatan / Event Khusus</option>}
            </select>
          </div>
          {form.scope === 'event' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Event *</label>
              <select
                value={form.event_id}
                onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                className="pv-input text-xs"
                required
              >
                <option value="">Pilih kegiatan warga...</option>
                {eventOptions
                  .filter((event) => canEditGeneral || manageableEventIds.has(event.id))
                  .map((event) => <option key={event.id} value={event.id}>{event.event_code} · {event.title}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Nominal Pengeluaran (Rp) <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
            <input
              type="number"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
              min="0.01"
              step="any"
              className="pv-input pl-10 text-xs font-bold font-mono"
              placeholder="Contoh: 150000"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Deskripsi Pengeluaran <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            rows={3}
            className="pv-input resize-none text-xs"
            placeholder="Jelaskan peruntukan pengeluaran kas secara detail (misal: Pembelian 2 kantong semen dan upah tukang perbaikan gapura)"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Bukti Pembayaran <span className="text-slate-400 font-normal">(opsional)</span>
          </label>
          <label className={`flex items-center gap-3 p-3.5 border-2 border-dashed border-slate-200 rounded-xl transition-colors ${isSaving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-slate-400 hover:bg-slate-50'}`}>
            <AiOutlinePaperClip size={20} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600 flex-1 truncate font-medium">
              {fileName || 'Pilih file bukti (JPG, PNG, WebP, PDF, maks 5 MB)'}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFile} disabled={isSaving} />
          </label>
          {uploadError && (
            <p className="text-[11px] text-red-600 mt-1">⚠️ {uploadError}</p>
          )}
          {fileName && (
            <button
              type="button"
              onClick={() => { if (!isSaving) { setFileName(''); setForm({ ...form, receipt_file: '' }); } }}
              disabled={isSaving}
              className={`text-[11px] mt-1 ${isSaving ? 'text-slate-300 cursor-not-allowed' : 'text-red-500 hover:text-red-700 font-medium'}`}
            >
              Hapus file
            </button>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">
            Batal
          </button>
          <button type="submit" disabled={isSaving} className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2">
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Menyimpan...
              </>
            ) : (
              isEdit ? 'Simpan Perubahan' : 'Catat'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
