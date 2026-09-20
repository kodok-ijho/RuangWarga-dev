import { useState, useMemo, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useSubscriptionGate } from '../hooks/useSubscriptionGate';
import { useTenantTemplate } from '../hooks/useTenantTemplate';
import {
  fetchPayments,
  fetchBillMatrix,
  fetchUnits,
  fetchResidents,
  fetchSettings,
  approveManualPayment,
  rejectManualPayment,
  updatePayment,
  IS_DEMO,
} from '../services/dataService';
import { fetchTenantUnits, fetchTenantMembers } from '../services/tenantOperationalService';
import {
  formatRupiah,
  formatDate,
  formatPeriod,
  isBendaharaOrAbove,
  canModifyData,
  normalizePaymentStatus,
  isPendingVerificationStatus,
  getQrisProviderLabel,
} from '../services/dataHelpers';
import {
  getUnitById,
  getProfileById,
  mockIPLBills,
  getPendingPayments,
  verifyPayment,
  rejectPayment,
  mockPayments,
  mockSettings,
  downloadDigitalReceipt,
  sendEmailReceipt,
} from '../services/mockData';
import { AiOutlineCheck, AiOutlineClose, AiOutlineEye, AiOutlineClockCircle, AiOutlineEdit } from 'react-icons/ai';
import { useToast } from '../hooks/useToast';
import { EmptyState, SkeletonTable, SkeletonList, SearchInput, Pagination } from '../components/ui';

const TABS = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'verified', label: 'Terverifikasi' },
  { key: 'rejected', label: 'Ditolak' },
];

function isImageReceipt(payment) {
  const mimeType = String(payment?.proof_file_mime_type || '').toLowerCase();
  const fileName = String(payment?.proof_file_name || payment?.receipt_file || '').toLowerCase();
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?.*)?$/.test(fileName);
}

function getReceiptPreviewUrl(payment) {
  const sourceUrl = payment?.proof_file_url;
  if (!sourceUrl) return null;

  const driveMatch = String(sourceUrl).match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveMatch?.[1] && driveMatch[1] !== 'undefined') {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w1200`;
  }

  return sourceUrl;
}

function currentBillingYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function pendingPaymentsFromMatrix(matrixRows) {
  if (!Array.isArray(matrixRows)) return [];

  return matrixRows.flatMap((row) =>
    (Array.isArray(row?.cells) ? row.cells : []).flatMap((cell) => {
      const bill = cell?.bill;
      if (!bill) return [];

      const source = cell.payment || {};
      const paymentStatus = normalizePaymentStatus(source.status, {
        method: source.method || source.payment_method,
        hasProof: Boolean(source.proof_file_url || source.proof_file_name || source.receipt_file),
      });
      const cellStatus = cell.status || bill.status;
      if (!isPendingVerificationStatus(cellStatus) && !isPendingVerificationStatus(paymentStatus)) {
        return [];
      }

      const paymentId = source.id || source.payment_id || cell.payment_id || bill.payment_id;
      if (!paymentId) return [];

      return [{
        ...source,
        id: paymentId,
        ipl_bill_id: source.ipl_bill_id || bill.id,
        unit_id: source.unit_id || bill.unit_id || row?.unit?.id,
        resident_id: source.resident_id || row?.resident?.id || '',
        amount: source.amount ?? bill.amount,
        period: source.period || bill.period,
        status: 'pending_verification',
        _bill: source._bill || bill,
        _profile: source._profile || row?.resident,
        _unit: source._unit || row?.unit,
      }];
    })
  );
}

function mergePaymentSources(payments, matrixRows) {
  const merged = Array.isArray(payments) ? [...payments] : [];
  const indexByKey = new Map();

  merged.forEach((payment, index) => {
    const key = payment?.id
      ? `payment:${payment.id}`
      : payment?.ipl_bill_id
        ? `bill:${payment.ipl_bill_id}`
        : null;
    if (key) indexByKey.set(String(key), index);
  });

  pendingPaymentsFromMatrix(matrixRows).forEach((matrixPayment) => {
    const paymentKey = `payment:${matrixPayment.id}`;
    const billKey = `bill:${matrixPayment.ipl_bill_id}`;
    const existingIndex = indexByKey.get(paymentKey) ?? indexByKey.get(billKey);
    if (existingIndex === undefined) {
      indexByKey.set(paymentKey, merged.length);
      indexByKey.set(billKey, merged.length);
      merged.push(matrixPayment);
      return;
    }

    merged[existingIndex] = {
      ...matrixPayment,
      ...merged[existingIndex],
      status: 'pending_verification',
      _bill: merged[existingIndex]._bill || matrixPayment._bill,
      _profile: merged[existingIndex]._profile || matrixPayment._profile,
    };
  });

  return merged;
}

export default function PaymentVerification() {
  const params = useParams();
  const { role, profile, session, isReadOnly: authReadOnly } = useAuth();
  const { currentTenant, userTenants } = useTenant();
  const activeTenantId = params.tenantId || currentTenant?.id || userTenants?.[0]?.id || null;
  const { canWrite: subCanWrite, isReadOnly: subReadOnly } = useSubscriptionGate(activeTenantId);
  const template = useTenantTemplate(currentTenant?.type || 'rt_rw');

  const toast = useToast();
  const canWrite = canModifyData(role) && !authReadOnly && subCanWrite;
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'detail' | 'reject' | 'edit'
  const [rejectReason, setRejectReason] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'bank_transfer',
    paid_at: '',
    note: '',
    file: null,
  });
  const [activeActionId, setActiveActionId] = useState(null);
  const [receiptPreviewError, setReceiptPreviewError] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Tenant switch reset effect
  useEffect(() => {
    setSelectedPayment(null);
    setModalMode(null);
    setRejectReason('');
    setActiveActionId(null);
    setReceiptPreviewError(false);
    setSearch('');
    setCurrentPage(1);
  }, [activeTenantId]);

  const [payments, setPayments] = useState([]);
  const [units, setUnits] = useState([]);
  const [residents, setResidents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qrisEnabled, setQrisEnabled] = useState(true);
  const [qrisProvider, setQrisProvider] = useState('midtrans');

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const blockCompare = String(a.block || '').localeCompare(String(b.block || ''));
      if (blockCompare !== 0) return blockCompare;
      return String(a.unit_number || '').localeCompare(String(b.unit_number || ''), undefined, { numeric: true });
    });
  }, [units]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        if (IS_DEMO && (!activeTenantId || String(activeTenantId).startsWith('demo-'))) {
          // Demo mode uses mock data directly
          const mockPay = getPendingPayments(); // Just to load mockData module
          setPayments(mockPayments);
          setUnits([]);
          setResidents([]);
          setQrisEnabled(mockSettings.qris_enabled ?? true);
          setQrisProvider(String(mockSettings.qris_provider || 'midtrans').toLowerCase());
        } else if (activeTenantId) {
          // Multi-tenant mode
          const [payData, unitData, memberData, settingsData] = await Promise.all([
            fetchPayments(session?.access_token, { tenantId: activeTenantId }).catch((err) => {
              console.error('fetchPayments error:', err);
              return [];
            }),
            fetchTenantUnits(activeTenantId).catch((err) => {
              console.error('fetchTenantUnits error:', err);
              return [];
            }),
            fetchTenantMembers(activeTenantId).catch((err) => {
              console.error('fetchTenantMembers error:', err);
              return [];
            }),
            fetchSettings(session?.access_token).catch(() => null),
          ]);
          if (active) {
            setPayments(payData);
            setUnits(
              unitData.map((u) => ({
                ...u,
                block: u.metadata?.block || u.label,
                unit_number: u.metadata?.unit_number || '',
              }))
            );
            setResidents(memberData);
            if (settingsData) {
              setQrisEnabled(settingsData.qris_enabled ?? true);
              setQrisProvider(String(settingsData.qris_provider || 'midtrans').toLowerCase());
            }
          }
        } else {
          // Prod mode fetches from API & Supabase
          const [payData, unitData, resData, matrixData, settingsData] = await Promise.all([
            fetchPayments(session?.access_token).catch((err) => {
              console.error('fetchPayments error:', err);
              return [];
            }),
            fetchUnits(session?.access_token).catch((err) => {
              console.error('fetchUnits error:', err);
              return [];
            }),
            fetchResidents(session?.access_token).catch((err) => {
              console.error('fetchResidents error:', err);
              return [];
            }),
            fetchBillMatrix(session?.access_token, currentBillingYear()).catch(() => []),
            fetchSettings(session?.access_token).catch(() => null),
          ]);
          if (active) {
            setPayments(mergePaymentSources(payData, matrixData));
            setUnits(unitData);
            setResidents(resData);
            if (settingsData) {
              setQrisEnabled(settingsData.qris_enabled ?? true);
              setQrisProvider(String(settingsData.qris_provider || 'midtrans').toLowerCase());
            }
          }
        }
      } catch (err) {
        toast.error('Gagal mengambil data verifikasi.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [refreshKey, session?.access_token, activeTenantId]);

  useEffect(() => {
    setReceiptPreviewError(false);
  }, [selectedPayment?.id]);

  const showQrisOption = qrisEnabled || paymentForm.method === 'qris';

  const getUnit = (unitId) => {
    return units.find((u) => String(u.id) === String(unitId)) || getUnitById(unitId);
  };

  const getResident = (residentId) => {
    return residents.find((r) => r.id === residentId) || getProfileById(residentId);
  };

  const pendingPayments = useMemo(
    () => payments.filter((p) => isPendingVerificationStatus(p.status)),
    [payments]
  );

  const verifiedPayments = useMemo(
    () => payments.filter((p) => p.status === 'verified'),
    [payments]
  );

  const rejectedPayments = useMemo(
    () => payments.filter((p) => p.status === 'rejected'),
    [payments]
  );

  // Guard: Bendahara+ only
  if (!isBendaharaOrAbove(role)) {
    return <Navigate to="/" replace />;
  }

  const currentList =
    activeTab === 'pending'
      ? pendingPayments
      : activeTab === 'verified'
      ? verifiedPayments
      : rejectedPayments;

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentList;
    return currentList.filter((payment) => {
      const unit = getUnit(payment.unit_id || payment._bill?.unit_id);
      const resident = payment._profile || getResident(payment.resident_id);
      const unitStr = unit ? `${unit.block}/${unit.unit_number}`.toLowerCase() : '';
      const nameStr = (resident?.full_name || payment.payer_name || '').toLowerCase();
      const amountStr = String(payment.amount || '');
      const idStr = String(payment.id || '').toLowerCase();
      const methodStr = String(payment.method || '').toLowerCase();
      return (
        unitStr.includes(q) ||
        nameStr.includes(q) ||
        amountStr.includes(q) ||
        idStr.includes(q) ||
        methodStr.includes(q)
      );
    });
  }, [currentList, search, units, residents]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const handleVerify = async (payment) => {
    if (!canWrite) {
      toast.error('Akun read-only atau langganan kadaluarsa tidak dapat memverifikasi pembayaran.');
      return;
    }
    if (!payment || activeActionId) return;
    setActiveActionId(payment.id);
    try {
      if (IS_DEMO && (!activeTenantId || String(activeTenantId).startsWith('demo-'))) {
        verifyPayment(payment.id, { verifiedBy: profile?.full_name || 'Demo Staff' });
      } else {
        await approveManualPayment(session?.access_token, {
          payment_id: payment.id,
          tenantId: activeTenantId,
          verifiedBy: profile?.full_name || 'Pengurus',
        });
      }
      toast.success('Pembayaran berhasil diverifikasi.');
      setRefreshKey((k) => k + 1);
      setSelectedPayment(null);
      setModalMode(null);
    } catch (err) {
      toast.error(err.message || 'Gagal memverifikasi pembayaran.');
    } finally {
      setActiveActionId(null);
    }
  };

  const openRejectModal = (payment) => {
    if (!canWrite) {
      toast.error('Akun read-only atau langganan kadaluarsa tidak dapat menolak pembayaran.');
      return;
    }
    setSelectedPayment(payment);
    setModalMode('reject');
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!canWrite || !selectedPayment || activeActionId) return;
    if (!rejectReason.trim()) {
      toast.error('Silakan isi alasan penolakan.');
      return;
    }
    setActiveActionId(selectedPayment.id);
    try {
      if (IS_DEMO && (!activeTenantId || String(activeTenantId).startsWith('demo-'))) {
        rejectPayment(selectedPayment.id, {
          rejectedBy: profile?.full_name || 'Demo Staff',
          reason: rejectReason,
        });
      } else {
        await rejectManualPayment(session?.access_token, {
          payment_id: selectedPayment.id,
          note: rejectReason,
          tenantId: activeTenantId,
          rejectedBy: profile?.full_name || 'Pengurus',
        });
      }
      toast.warning('Pembayaran ditolak.');
      setRefreshKey((k) => k + 1);
      setSelectedPayment(null);
      setModalMode(null);
    } catch (err) {
      toast.error(err.message || 'Gagal menolak pembayaran.');
    } finally {
      setActiveActionId(null);
    }
  };

  const openDetail = (payment) => {
    setSelectedPayment(payment);
    setModalMode('detail');
  };

  const openEditModal = (payment) => {
    if (!canWrite) {
      toast.error('Akun read-only atau langganan kadaluarsa tidak dapat mengubah pembayaran.');
      return;
    }
    const currentUnitId =
      payment.unit_id ||
      payment._unit?.id ||
      payment._bill?.unit_id ||
      payment.ipl_bills?.unit_id ||
      '';
    setSelectedPayment(payment);
    setPaymentForm({
      unit_id: currentUnitId ? String(currentUnitId) : '',
      amount: payment.amount ?? '',
      method: payment.method || 'bank_transfer',
      paid_at: payment.paid_at ? String(payment.paid_at).slice(0, 10) : '',
      note: payment.metadata?.note || '',
      file: null,
    });
    setModalMode('edit');
  };

  const handleUpdatePayment = async (event) => {
    event.preventDefault();
    if (!canWrite || !selectedPayment || activeActionId) return;
    if (paymentForm.amount === '' || Number(paymentForm.amount) < 0) {
      toast.error('Nominal pembayaran tidak boleh bernilai negatif.');
      return;
    }
    if (!paymentForm.paid_at) {
      toast.error('Tanggal pembayaran wajib diisi.');
      return;
    }

    setActiveActionId(selectedPayment.id);
    try {
      await updatePayment(session?.access_token, {
        payment_id: selectedPayment.id,
        tenantId: activeTenantId,
        ...paymentForm,
      });
      toast.success('Detail pembayaran berhasil diperbarui.');
      setModalMode(null);
      setSelectedPayment(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui pembayaran.');
    } finally {
      setActiveActionId(null);
    }
  };

  const closeModal = () => {
    setSelectedPayment(null);
    setModalMode(null);
  };

  function getBillPeriod(payment) {
    // Production: use joined _bill.period data from fetchPayments API response
    if (payment._bill?.period) return payment._bill.period;
    // Demo mode fallback: lookup from mockIPLBills
    if (IS_DEMO) {
      const bill = mockIPLBills.find((b) => b.id === payment.ipl_bill_id);
      return bill?.period || '';
    }
    return '';
  }

  const selectedReceiptPreviewUrl = getReceiptPreviewUrl(selectedPayment);
  const selectedUnit = selectedPayment
    ? selectedPayment._unit || getUnit(selectedPayment.unit_id || selectedPayment._bill?.unit_id)
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-forest-900 sm:text-xl">
            <AiOutlineCheck className="shrink-0 text-gold-600" /> Verifikasi Pembayaran {template.billLabel}
          </h1>
          <p className="mt-1 text-sm leading-5 text-forest-500">
            Verifikasi bukti transfer pembayaran {template.billLabel} dari {template.memberLabel.toLowerCase()}
          </p>
        </div>
        {pendingPayments.length > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 sm:text-sm">
            <AiOutlineClockCircle />
            {pendingPayments.length} Menunggu
          </span>
        )}
      </div>

      {/* Read-Only Subscription Banner */}
      {subReadOnly && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-900 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-900">Mode Read-Only Aktif</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Langganan tenant ini sedang dalam masa tenggang / non-aktif. Anda tetap dapat melihat data, namun tindakan verifikasi, penolakan, dan pengubahan pembayaran dinonaktifkan.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 shadow-inner">
        {TABS.map((tab) => {
          const TabIcon = tab.key === 'pending'
            ? AiOutlineClockCircle
            : tab.key === 'verified'
              ? AiOutlineCheck
              : AiOutlineClose;
          const count =
            tab.key === 'pending'
              ? pendingPayments.length
              : tab.key === 'verified'
              ? verifiedPayments.length
              : rejectedPayments.length;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setCurrentPage(1);
              }}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] transition-all sm:flex-row sm:gap-1.5 sm:py-2.5 sm:text-sm ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <TabIcon className="text-base sm:text-sm" aria-hidden="true" />
              <span className="truncate sm:hidden">{tab.key === 'verified' ? 'Selesai' : tab.label}</span>
              <span className="hidden truncate sm:inline">{tab.label}</span>
              {count > 0 && (
                <span className={`absolute right-1 top-1 min-w-4 rounded-full px-1.5 py-0.5 text-center text-[9px] font-bold sm:static sm:ml-1 sm:text-[10px] ${
                  activeTab === tab.key ? 'bg-forest-800 text-gold-400' : 'bg-slate-200 text-slate-700'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 max-w-md">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setCurrentPage(1);
            }}
            placeholder={`Cari nama ${template.memberLabel.toLowerCase()}, ${template.unitLabel.toLowerCase()}, nominal...`}
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCurrentPage(1);
            }}
            className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 self-start sm:self-auto"
          >
            Hapus Pencarian
          </button>
        )}
      </div>

      {/* Payment List */}
      {isLoading ? (
        <div>
          <div className="block sm:hidden">
            <SkeletonList items={3} />
          </div>
          <div className="hidden sm:block">
            <SkeletonTable cols={6} rows={4} />
          </div>
        </div>
      ) : currentList.length === 0 ? (
        <EmptyState
          icon={
            activeTab === 'pending'
              ? '✅'
              : activeTab === 'verified'
              ? '💳'
              : '📋'
          }
          title={
            activeTab === 'pending'
              ? 'Semua Pembayaran Terverifikasi'
              : activeTab === 'verified'
              ? 'Belum Ada Pembayaran Terverifikasi'
              : 'Tidak Ada Pembayaran Ditolak'
          }
          description={
            activeTab === 'pending'
              ? 'Bagus! Saat ini tidak ada setoran pembayaran warga yang sedang menunggu persetujuan atau konfirmasi bendahara.'
              : activeTab === 'verified'
              ? 'Daftar riwayat pembayaran warga yang telah disetujui akan tampil terarsip di tab ini.'
              : 'Tidak ada catatan transaksi pembayaran yang ditolak pada periode ini.'
          }
          action={
            activeTab !== 'pending' ? (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('pending');
                  setCurrentPage(1);
                }}
                className="pv-btn-ghost text-xs shadow-2xs"
              >
                Kembali ke Antrean Verifikasi
              </button>
            ) : null
          }
        />
      ) : filteredList.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Tidak Ditemukan Pembayaran"
          description={`Tidak ada pembayaran yang sesuai dengan pencarian "${search}".`}
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCurrentPage(1);
              }}
              className="pv-btn-ghost text-xs shadow-2xs min-h-[44px]"
            >
              Reset Pencarian
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {paginatedList.map((payment) => {
            const unit = getUnit(payment.unit_id || payment._bill?.unit_id);
            const resident = payment._profile || getResident(payment.resident_id);
            const period = payment.period || payment._bill?.period || getBillPeriod(payment);
            const StatusIcon = payment.status === 'pending_verification'
              ? AiOutlineClockCircle
              : payment.status === 'verified'
                ? AiOutlineCheck
                : AiOutlineClose;

            return (
              <div key={payment.id} className="pv-card p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 ${
                      payment.status === 'pending_verification'
                        ? 'bg-orange-100 text-orange-700'
                        : payment.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      <StatusIcon aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-bold text-slate-900">
                        {resident?.full_name || 'Tidak diketahui'}
                      </h3>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        {unit ? `Blok ${unit.block}/${unit.unit_number}` : '-'} · <strong>{formatPeriod(period)}</strong>
                      </p>
                      <p className="text-sm font-extrabold text-slate-900">{formatRupiah(payment.amount)}</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs leading-5 text-slate-400 sm:flex sm:flex-wrap">
                        <span>{payment.method === 'cash' ? '💵 Tunai' : '🏦 Transfer Bank'}</span>
                        <span>📅 {formatDate(payment.paid_at)}</span>
                        {(payment.proof_file_url || payment.receipt_file) && (
                          payment.proof_file_url ? (
                            <a
                              href={payment.proof_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="col-span-2 flex min-w-0 items-center gap-1 text-slate-700 font-semibold hover:underline"
                            >
                              <span className="truncate">📎 {payment.proof_file_name || payment.receipt_file || 'Bukti pembayaran'}</span>
                            </a>
                          ) : (
                            <span className="col-span-2 flex min-w-0 items-center gap-1 text-slate-400 text-xs italic">
                              <span className="truncate">📎 {payment.proof_file_name || payment.receipt_file || 'Bukti'} (URL tidak tersedia)</span>
                            </span>
                          )
                        )}
                      </div>
                      {payment.metadata?.note && (
                        <p className="mt-1 break-words text-xs leading-5 text-slate-500 italic">"{payment.metadata.note}"</p>
                      )}
                      {payment.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1 font-medium">Alasan: {payment.rejection_reason}</p>
                      )}
                      {payment.verified_by && (
                        <p className="text-xs text-emerald-700 mt-1 font-medium">Diverifikasi oleh: {payment.verified_by}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-shrink-0">
                    {payment.status === 'pending_verification' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleVerify(payment)}
                          disabled={Boolean(activeActionId) || !canWrite}
                          aria-label={`Verifikasi pembayaran dari ${resident?.full_name || 'warga'}`}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 shadow-xs pv-focus-ring"
                        >
                          <AiOutlineCheck aria-hidden="true" /> Verifikasi
                        </button>
                        <button
                          type="button"
                          onClick={() => openRejectModal(payment)}
                          disabled={Boolean(activeActionId) || !canWrite}
                          aria-label={`Tolak pembayaran dari ${resident?.full_name || 'warga'}`}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 shadow-xs pv-focus-ring"
                        >
                          <AiOutlineClose aria-hidden="true" /> Tolak
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={Boolean(activeActionId)}
                      onClick={() => openDetail(payment)}
                      aria-label={`Lihat detail pembayaran dari ${resident?.full_name || 'warga'}`}
                      className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 shadow-xs disabled:opacity-60 sm:col-span-1 pv-focus-ring"
                    >
                      <AiOutlineEye aria-hidden="true" /> Detail
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredList.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* Detail Modal */}
      {modalMode === 'detail' && selectedPayment && (
        <div className="pv-dialog-backdrop">
          <div className="pv-dialog-panel">
            <h2 className="text-lg font-extrabold text-slate-900 mb-4 tracking-tight">Detail Pembayaran</h2>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Warga</span>
                <span className="min-w-0 break-words text-right font-semibold text-slate-900 text-xs">
                  {(selectedPayment._profile || getResident(selectedPayment.resident_id))?.full_name || '-'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Nomor Unit</span>
                <span className="min-w-0 break-words text-right font-semibold text-slate-900 text-xs">
                  {selectedUnit ? `Blok ${selectedUnit.block}/${selectedUnit.unit_number}` : '-'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Periode</span>
                <span className="min-w-0 break-words text-right font-semibold text-slate-900 text-xs">
                  {formatPeriod(selectedPayment.period || selectedPayment._bill?.period || getBillPeriod(selectedPayment))}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Jumlah</span>
                <span className="min-w-0 break-words text-right font-extrabold text-slate-900 text-sm">{formatRupiah(selectedPayment.amount)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Metode</span>
                <span className="min-w-0 break-words text-right font-semibold text-slate-900 text-xs">
                  {selectedPayment.method === 'cash' ? '💵 Tunai' : selectedPayment.method === 'qris' ? '📱 QRIS' : '🏦 Transfer Bank'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Tanggal Bayar</span>
                <span className="min-w-0 break-words text-right font-semibold text-slate-900 text-xs">{formatDate(selectedPayment.paid_at)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                <span className="text-slate-500 text-xs font-medium">Status</span>
                <span className={`pv-badge min-w-0 justify-self-end text-right ${
                  selectedPayment.status === 'pending_verification'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : selectedPayment.status === 'verified'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {selectedPayment.status === 'pending_verification'
                    ? '⏳ Menunggu Verifikasi'
                    : selectedPayment.status === 'verified'
                    ? '✅ Terverifikasi'
                    : '❌ Ditolak'}
                </span>
              </div>

              {/* Receipt preview link */}
              {selectedReceiptPreviewUrl && isImageReceipt(selectedPayment) && !receiptPreviewError && (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <p className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800">
                    Preview Bukti Transfer
                  </p>
                  <div className="flex min-h-40 items-center justify-center bg-slate-100 p-2 sm:min-h-52">
                    <img
                      src={selectedReceiptPreviewUrl}
                      alt={`Preview ${selectedPayment.proof_file_name || 'bukti transfer'}`}
                      className="max-h-64 w-full rounded-lg object-contain sm:max-h-80"
                      onError={() => setReceiptPreviewError(true)}
                    />
                  </div>
                </div>
              )}
              {(selectedPayment.proof_file_url || selectedPayment.receipt_file) && (
                <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-2">📎 Bukti Transfer</p>
                  {selectedPayment.proof_file_url ? (
                    <a
                      href={selectedPayment.proof_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-xs"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">🖼️</span>
                          <span className="truncate text-xs font-semibold text-slate-800">
                            {selectedPayment.proof_file_name || selectedPayment.receipt_file || 'Lihat Bukti Lampiran'}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 sm:flex-shrink-0">Buka Lampiran</span>
                      </div>
                    </a>
                  ) : (
                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
                      <p className="font-semibold">Bukti belum berhasil tersimpan di server</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">Nama file lokal: {selectedPayment.proof_file_name || selectedPayment.receipt_file}</p>
                    </div>
                  )}
                </div>
              )}

              {selectedPayment.metadata?.note && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  💬 Catatan: {selectedPayment.metadata.note}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 mt-6">
              {selectedPayment.status === 'verified' && IS_DEMO && (
                <div className="grid grid-cols-1 gap-2 border-b border-slate-200 pb-2 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      const bill = mockIPLBills.find((b) => b.id === selectedPayment.bill_id) || { id: selectedPayment.bill_id, period: selectedPayment.period || '2026-01', amount: selectedPayment.amount };
                      const unit = getUnit(selectedPayment.unit_id || bill.unit_id);
                      downloadDigitalReceipt({ bill, unit });
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition-colors"
                  >
                    📥 Download Kuitansi
                  </button>
                  <button
                    onClick={async () => {
                      if (!canWrite) {
                        toast.error('Akun read-only tidak dapat mengirim kuitansi email.');
                        return;
                      }
                      const bill = mockIPLBills.find((b) => b.id === selectedPayment.bill_id) || { id: selectedPayment.bill_id, period: selectedPayment.period || '2026-01', amount: selectedPayment.amount };
                      const unit = getUnit(selectedPayment.unit_id || bill.unit_id);
                      toast.info('Mengirim kuitansi digital ke email...');
                      const res = await sendEmailReceipt({ bill, unit });
                      toast.success(res.message);
                    }}
                    disabled={!canWrite}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm hover:bg-gold-100 transition-colors disabled:opacity-50"
                  >
                    📧 Kirim ke Email
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {canWrite && (
                  <button
                    onClick={() => openEditModal(selectedPayment)}
                    disabled={Boolean(activeActionId)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gold-300 bg-gold-50 px-4 py-2.5 text-sm font-medium text-gold-800 hover:bg-gold-100 disabled:opacity-60"
                  >
                    <AiOutlineEdit /> Edit Pembayaran
                  </button>
                )}
                {selectedPayment.status === 'pending_verification' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedPayment)}
                      disabled={Boolean(activeActionId) || !canWrite}
                      className="flex-1 pv-btn-primary py-2.5 rounded-lg text-sm"
                    >
                      ✅ Verifikasi
                    </button>
                    <button
                      onClick={() => { setModalMode('reject'); setRejectReason(''); }}
                      disabled={Boolean(activeActionId)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      ❌ Tolak
                    </button>
                  </>
                )}
                <button onClick={closeModal} className="pv-btn-ghost min-h-11 flex-1 rounded-lg px-4 py-2.5 text-sm">
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {modalMode === 'edit' && selectedPayment && (
        <div className="pv-dialog-backdrop">
          <div className="pv-dialog-panel">
            <h2 className="text-lg font-bold text-forest-900 mb-1">Edit Detail Pembayaran</h2>
            <p className="mb-4 text-sm leading-5 text-forest-500">
              Perbarui transaksi warga. Upload bukti baru bersifat opsional.
            </p>
            <form onSubmit={handleUpdatePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">
                  {template.unitLabel} {currentTenant?.name || ''} *
                </label>
                <select
                  value={paymentForm.unit_id}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, unit_id: e.target.value }))}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 outline-none focus:border-gold-500 font-medium"
                >
                  <option value="">-- Pilih {template.unitLabel} --</option>
                  {sortedUnits.map((u) => {
                    const resident = residents.find((r) => String(r.unit_id) === String(u.id));
                    const residentName = resident?.full_name ? ` - ${resident.full_name}` : ' (Kosong / Belum terdata)';
                    const unitName = u.block && u.unit_number ? `Blok ${u.block}/${u.unit_number}` : (u.label || `Unit #${u.id}`);
                    return (
                      <option key={u.id} value={String(u.id)}>
                        {unitName}{residentName}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-xs text-forest-500">
                  Gunakan pilihan ini jika pengurus keliru memilih {template.unitLabel.toLowerCase()} saat pencatatan {template.billLabel}.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-forest-700 mb-1">Nominal Pembayaran *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Metode Pembayaran *</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
                    className="pv-input font-medium"
                  >
                    <option value="bank_transfer">Transfer Bank</option>
                    {showQrisOption && <option value="qris">QRIS</option>}
                    <option value="cash">Tunai</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Bayar *</label>
                  <input
                    type="date"
                    required
                    value={paymentForm.paid_at}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_at: e.target.value }))}
                    className="pv-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={3}
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="pv-input"
                  placeholder="Catatan pembayaran..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Ulang Bukti Pembayaran</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-forest-800 file:text-gold-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold cursor-pointer"
                />
                {selectedPayment.proof_file_name && !paymentForm.file && (
                  <p className="mt-1 text-xs text-slate-400">Bukti saat ini: {selectedPayment.proof_file_name}</p>
                )}
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={Boolean(activeActionId)}
                  className="pv-btn-primary flex-1 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60 shadow-xs"
                >
                  {activeActionId === selectedPayment.id ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('detail')}
                  disabled={Boolean(activeActionId)}
                  className="pv-btn-ghost rounded-xl px-4 py-2.5 text-xs shadow-xs"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {modalMode === 'reject' && selectedPayment && (
        <div className="pv-dialog-backdrop">
          <div className="pv-dialog-panel">
            <h2 className="text-lg font-bold text-red-700 mb-1">Tolak Pembayaran</h2>
            <p className="mb-4 break-words text-sm leading-5 text-forest-500">
              Tolak bukti transfer dari <strong>{(selectedPayment._profile || getResident(selectedPayment.resident_id))?.full_name}</strong>.
              Warga akan dapat mengirim ulang bukti baru atau membatalkan pembayaran.
            </p>

            <div>
              <label className="block text-sm font-medium text-forest-700 mb-1">Alasan Penolakan *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2.5 text-sm text-forest-900 placeholder:text-forest-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 outline-none"
                placeholder="Contoh: Bukti transfer tidak jelas, nominal tidak sesuai..."
              />
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleReject}
                disabled={Boolean(activeActionId) || !canWrite}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white py-2.5 text-sm font-medium hover:bg-red-700 transition-colors"
              >
                ❌ Tolak Pembayaran
              </button>
              <button
                onClick={() => setModalMode('detail')}
                className="pv-btn-ghost w-full rounded-lg px-4 py-2.5 text-sm sm:w-auto"
              >
                Kembali
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

