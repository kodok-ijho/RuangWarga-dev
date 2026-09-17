import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import QrisCheckoutModal from '../components/QrisCheckoutModal';
import {
  createNonIplIncome,
  updateNonIplIncome,
  deleteNonIplIncome,
  approveNonIplIncome,
  rejectNonIplIncome,
  createNonIplQrisPayment,
  fetchEvents,
  fetchMyEventAccess,
  fetchNonIplIncomes,
} from '../services/dataService';
import {
  canManageGeneralExpenses,
  formatDate,
  formatRupiah,
  isBendaharaOrAbove,
} from '../services/dataHelpers';
import { AiOutlineCheck, AiOutlineClose, AiOutlineEye, AiOutlineClockCircle } from 'react-icons/ai';

const EMPTY_FORM = {
  income_date: new Date().toISOString().slice(0, 10),
  scope: 'general',
  event_id: '',
  category: '',
  source_name: '',
  amount: '',
  payment_method: 'bank_transfer',
  reference_number: '',
  description: '',
};

export default function NonIplIncomes() {
  const { role, profile, session, isReadOnly } = useAuth();
  const toast = useToast();
  const token = session?.access_token;

  const isStaff = isBendaharaOrAbove(role) && !isReadOnly;
  const isWarga = role === 'warga';

  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [access, setAccess] = useState({ events: [] });
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    source_name: profile?.full_name || '',
    payment_method: isStaff ? 'cash' : 'bank_transfer',
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // QRIS Checkout State
  const [qrisCheckoutData, setQrisCheckoutData] = useState(null);

  // Filters
  const [activeTab, setActiveTab] = useState('all'); // all | pending_verification | verified | rejected
  const [filterScope, setFilterScope] = useState('all'); // all | general | event
  const [filterEventId, setFilterEventId] = useState('');

  // Modals
  const [previewImage, setPreviewImage] = useState(null);
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const canManageGeneral = canManageGeneralExpenses(role, isReadOnly);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [incomeRows, eventRows, accessData] = await Promise.all([
        fetchNonIplIncomes(token),
        fetchEvents(token, { role, profileId: profile?.id }),
        fetchMyEventAccess(token, { role, profileId: profile?.id }),
      ]);
      setRows(incomeRows || []);
      setEvents(eventRows || []);
      setAccess(accessData || { events: [] });
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil data pemasukan non-IPL.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, role, toast, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Set default source_name when profile is loaded
  useEffect(() => {
    if (profile?.full_name && !form.source_name) {
      setForm((prev) => ({ ...prev, source_name: profile.full_name }));
    }
  }, [profile?.full_name, form.source_name]);

  const manageableEventIds = useMemo(() => new Set(
    (access.events || []).filter((item) => item.can_manage_finance).map((item) => item.event_id)
  ), [access.events]);

  const canManageForm = form.scope === 'general' ? canManageGeneral : manageableEventIds.has(form.event_id);

  // Submit Handler
  const submit = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.source_name.trim() || !form.description.trim() || Number(form.amount) <= 0) {
      toast.error('Kategori, nama pembayar/sumber, keterangan, dan nominal wajib diisi.');
      return;
    }
    if (form.scope === 'event' && !form.event_id) {
      toast.error('Pilih event / kegiatan untuk scope event.');
      return;
    }

    // Role Rule Guard: Warga only allowed bank_transfer or qris
    if (isWarga && !['bank_transfer', 'qris'].includes(form.payment_method)) {
      toast.error('Warga hanya dapat memilih metode Transfer Bank atau QRIS.');
      return;
    }

    // If QRIS is chosen -> Generate Authentic DOKU Production QRIS & Open Modal
    if (form.payment_method === 'qris') {
      setSubmitting(true);
      try {
        const baseAmount = Number(form.amount);
        const qrisFee = Math.ceil(baseAmount * 0.007);
        const totalAmount = baseAmount + qrisFee;
        const desc = `${form.category} - ${form.source_name} (${form.scope === 'event' ? getEventName(form.event_id) : 'Kas Umum'})`;
        const qrisData = await createNonIplQrisPayment(token, {
          amount: baseAmount,
          base_amount: baseAmount,
          qris_fee_amount: qrisFee,
          description: desc,
          category: form.category,
          provider: 'doku',
        });

        setQrisCheckoutData({
          order_id: qrisData.parent_order_id,
          parent_order_id: qrisData.parent_order_id,
          doku_reference_no: qrisData.doku_reference_no,
          base_amount: qrisData.base_amount || baseAmount,
          qris_fee_amount: qrisData.qris_fee_amount || qrisFee,
          total: qrisData.total_amount || totalAmount,
          amount: qrisData.total_amount || totalAmount,
          total_amount: qrisData.total_amount || totalAmount,
          qr_content: qrisData.qr_content,
          provider: qrisData.provider || 'doku',
          category: form.category,
          description: desc,
          formPayload: { ...form, amount: baseAmount },
        });
      } catch (err) {
        toast.error(err.message || 'Gagal memproses pembayaran QRIS DOKU.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Transfer Bank requires receipt proof upload
    if (form.payment_method === 'bank_transfer' && !file && !editingId) {
      toast.error('Wajib mengunggah foto / screenshot bukti transfer bank.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        event_id: form.scope === 'event' ? form.event_id : null,
        file,
        is_warga: isWarga,
        role,
        recorded_by: profile?.id || null,
      };

      if (editingId) {
        await updateNonIplIncome(token, editingId, payload);
        toast.success('Pemasukan non-IPL berhasil diperbarui.');
      } else {
        await createNonIplIncome(token, payload);
        if (isWarga) {
          toast.success('Bukti transfer berhasil dikirim! Menunggu verifikasi dari Bendahara / Admin.');
        } else {
          toast.success('Pemasukan non-IPL berhasil dicatat.');
        }
      }

      setForm({
        ...EMPTY_FORM,
        source_name: profile?.full_name || '',
        payment_method: isStaff ? 'cash' : 'bank_transfer',
      });
      setFile(null);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan pembayaran non-IPL.');
    } finally {
      setSubmitting(false);
    }
  };

  // QRIS Checkout Confirmation (when user finishes paying in modal)
  const handleQrisPaymentConfirm = async () => {
    if (!qrisCheckoutData) return;
    try {
      const payload = {
        ...qrisCheckoutData.formPayload,
        payment_method: 'qris',
        reference_number: qrisCheckoutData.order_id,
        event_id: qrisCheckoutData.formPayload.scope === 'event' ? qrisCheckoutData.formPayload.event_id : null,
        is_warga: isWarga,
        role,
        recorded_by: profile?.id || null,
      };

      await createNonIplIncome(token, payload);
      toast.success('Pembayaran QRIS berhasil! Transaksi Anda telah dicatat.');
      setQrisCheckoutData(null);
      setForm({
        ...EMPTY_FORM,
        source_name: profile?.full_name || '',
        payment_method: isStaff ? 'cash' : 'bank_transfer',
      });
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menyelesaikan transaksi QRIS.');
    }
  };

  // Verification: Approve
  const handleApprove = async (income) => {
    if (!window.confirm(`Verifikasi dan terima pembayaran non-IPL sebesar ${formatRupiah(income.amount)} dari ${income.source_name}?`)) return;
    try {
      await approveNonIplIncome(token, { income_id: income.id });
      toast.success('Pembayaran non-IPL berhasil diverifikasi.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal memverifikasi pembayaran.');
    }
  };

  // Verification: Reject
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectingItem) return;
    if (!rejectionReason.trim()) {
      toast.error('Alasan penolakan wajib diisi.');
      return;
    }
    try {
      await rejectNonIplIncome(token, {
        income_id: rejectingItem.id,
        reason: rejectionReason.trim(),
      });
      toast.success('Pembayaran non-IPL telah ditolak.');
      setRejectingItem(null);
      setRejectionReason('');
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menolak pembayaran.');
    }
  };

  // Delete
  const remove = async (id) => {
    if (!window.confirm('Hapus pemasukan ini? Data akan disimpan sebagai soft delete.')) return;
    try {
      await deleteNonIplIncome(token, id);
      toast.success('Pemasukan berhasil dihapus.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menghapus pemasukan.');
    }
  };

  // Filters & Tabs calculation
  const pendingCount = useMemo(() => {
    return rows.filter((r) => r.status === 'pending_verification').length;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Tab filter
      if (activeTab !== 'all' && (row.status || 'verified') !== activeTab) return false;

      // Scope filter
      if (filterScope !== 'all' && row.scope !== filterScope) return false;
      if (filterScope === 'event' && filterEventId && row.event_id !== filterEventId) return false;

      return true;
    });
  }, [rows, activeTab, filterScope, filterEventId]);

  const totalAmount = useMemo(() => {
    // Only count verified payments in total finance summary
    return filteredRows
      .filter((r) => (r.status || 'verified') === 'verified')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [filteredRows]);

  const getEventName = (eventId) => {
    const event = events.find((e) => e.id === eventId);
    return event ? event.title : 'Event Kegiatan';
  };

  const getMethodBadge = (method) => {
    switch (method) {
      case 'bank_transfer':
        return <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">🏦 Transfer Bank</span>;
      case 'qris':
        return <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 border border-purple-200">📱 QRIS</span>;
      case 'cash':
        return <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">💵 Tunai</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-200">Lainnya</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            <AiOutlineClockCircle className="animate-spin" /> Menunggu Verifikasi
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200">
            <AiOutlineClose /> Ditolak
          </span>
        );
      case 'verified':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <AiOutlineCheck /> Terverifikasi
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {isWarga ? 'Pembayaran & Donasi Non-IPL' : 'Pemasukan Non-IPL & Event'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isWarga
              ? 'Kirim kontribusi, donasi komplek, atau iuran partisipasi event melalui Transfer Bank atau QRIS.'
              : 'Kelola pemasukan kas umum, kegiatan event, serta verifikasi bukti pembayaran transfer/QRIS warga.'}
          </p>
        </div>
      </div>

      {/* Form Section */}
      <div className="pv-card overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              {editingId
                ? '✏️ Edit Data Pemasukan'
                : isWarga
                ? '📝 Formulir Pembayaran / Donasi Warga'
                : '💰 Pencatatan Kas Masuk (Staff / Pengurus)'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isWarga
                ? 'Pilih tujuan pembayaran, metode (Transfer/QRIS), dan sertakan bukti transfer untuk diverifikasi pengurus.'
                : 'Catat penerimaan kas tunai, bank, QRIS, atau donasi langsung.'}
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              className="text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors"
              onClick={() => {
                setEditingId(null);
                setForm({
                  ...EMPTY_FORM,
                  source_name: profile?.full_name || '',
                  payment_method: isStaff ? 'cash' : 'bank_transfer',
                });
                setFile(null);
              }}
            >
              Batal Edit
            </button>
          )}
        </div>

        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={submit}>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Tanggal Pembayaran *
            <input
              className="pv-input mt-1"
              type="date"
              value={form.income_date}
              onChange={(e) => setForm({ ...form, income_date: e.target.value })}
              required
            />
          </label>

          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Tujuan Pembayaran (Scope) *
            <select
              className="pv-input mt-1 font-semibold"
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value, event_id: '' })}
            >
              <option value="general">Umum / Donasi Komplek Non-Event</option>
              <option value="event">Event / Kegiatan Tertentu</option>
            </select>
          </label>

          {form.scope === 'event' && (
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider md:col-span-2">
              Pilih Event / Kegiatan *
              <select
                className="pv-input mt-1"
                value={form.event_id}
                onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                required
              >
                <option value="">-- Pilih Event Kegiatan --</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.event_code ? `[${ev.event_code}] ` : ''}{ev.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Kategori Pembayaran *
            <input
              className="pv-input mt-1"
              placeholder="Contoh: Donasi Fasum, Pendaftaran Lomba, Sponsor HUT"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              required
            />
          </label>

          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Nama Pembayar / Sumber *
            <input
              className="pv-input mt-1"
              placeholder="Nama warga atau instansi"
              value={form.source_name}
              onChange={(e) => setForm({ ...form, source_name: e.target.value })}
              required
            />
          </label>

          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Nominal Pembayaran (Rp) *
            <input
              className="pv-input mt-1 font-bold text-slate-900"
              type="number"
              min="1"
              step="1"
              placeholder="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </label>

          {/* Metode Pembayaran: Warga restricted to Transfer & QRIS */}
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Metode Pembayaran *
            <select
              className="pv-input mt-1 font-semibold"
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              {isStaff && <option value="cash">💵 Tunai / Cash (Langsung)</option>}
              <option value="bank_transfer">🏦 Transfer Bank (Manual)</option>
              <option value="qris">📱 QRIS Palm Village</option>
              {isStaff && <option value="other">Lainnya</option>}
            </select>
          </label>

          {/* Detail Instruksi Metode untuk Warga */}
          {form.payment_method === 'bank_transfer' && (
            <div className="md:col-span-2 rounded-xl bg-blue-50/60 p-4 border border-blue-200">
              <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900 mb-1">
                🏦 Instruksi Transfer Rekening Pengurus
              </h4>
              <p className="text-xs text-blue-800 mb-2">
                Silakan transfer ke rekening kas Palm Village:
                <span className="block font-semibold mt-1">Bank BCA: 123-456-7890 (a/n Paguyuban Palm Village)</span>
              </p>
              <label className="block text-xs font-bold text-blue-900 mt-2 uppercase tracking-wider">
                Upload Foto / Screenshot Bukti Transfer <span className="text-red-500">*</span>
                <input
                  className="pv-input mt-1 text-xs bg-white border-blue-200"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required={!editingId}
                />
                <span className="text-[11px] text-blue-600 font-normal normal-case block mt-0.5">Format: JPG, PNG. Maksimal 2MB.</span>
              </label>
            </div>
          )}

          {form.payment_method === 'qris' && (() => {
            const nonIplAmount = Number(form.amount || 0);
            const nonIplFee = Math.ceil(nonIplAmount * 0.007);
            const nonIplTotal = nonIplAmount + nonIplFee;
            return (
              <div className="md:col-span-2 rounded-xl bg-purple-50/50 p-4 border border-purple-200 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-purple-900 flex items-center gap-1.5">
                  <span>📱</span> Pembayaran QRIS Resmi Palm Village (+0,7%)
                </h4>
                <p className="text-xs text-purple-800 leading-relaxed">
                  Setelah Anda klik tombol <strong>"Buka Pembayaran QRIS →"</strong> di bawah, kode QRIS resmi akan dibuat secara instan. Anda dapat langsung memindai kode QR atau mengunduh gambarnya untuk pembayaran lewat galeri M-Banking / E-Wallet.
                </p>

                {nonIplAmount > 0 && (
                  <div className="rounded-lg bg-white border border-purple-200 p-3 text-xs text-slate-800 space-y-1 shadow-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Nominal Dasar:</span>
                      <span className="font-semibold text-slate-900">{formatRupiah(nonIplAmount)}</span>
                    </div>
                    <div className="flex justify-between text-amber-700 font-medium">
                      <span>Biaya Layanan QRIS (0,7%):</span>
                      <span>+ {formatRupiah(nonIplFee)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-slate-900">
                      <span>Total Pembayaran QRIS:</span>
                      <span className="text-emerald-700 text-sm">{formatRupiah(nonIplTotal)}</span>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                  <strong>ℹ️ Disclaimer Biaya QRIS:</strong> Sesuai regulasi Bank Indonesia (MDR QRIS), transaksi QRIS dikenakan biaya administrasi <strong>0,7% {nonIplAmount > 0 ? `(${formatRupiah(nonIplFee)})` : ''}</strong> yang dibebankan kepada pembayar.
                </div>
              </div>
            );
          })()}

          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider md:col-span-2">
            Keterangan / Catatan *
            <textarea
              className="pv-input mt-1"
              rows="2"
              placeholder="Deskripsi tujuan pembayaran, nomor unit rumah, atau peruntukan donasi..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </label>

          <div className="md:col-span-2 flex items-center justify-between pt-2">
            <button
              className="pv-btn-primary px-6"
              type="submit"
              disabled={submitting || (!isWarga && !canManageForm)}
            >
              {submitting
                ? 'Memproses...'
                : editingId
                ? 'Simpan Perubahan'
                : form.payment_method === 'qris'
                ? '💳 Buka Pembayaran QRIS →'
                : isWarga
                ? 'Kirim Bukti Transfer'
                : 'Simpan Pemasukan'}
            </button>
            {!isWarga && !canManageForm && (
              <span className="text-xs text-red-500">
                Akun Anda tidak memiliki hak kelola finance pada scope ini.
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Tabs & Table Section */}
      <div className="pv-card overflow-hidden">
        {/* Status Tab Bar */}
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 pt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-forest-800 text-forest-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('all')}
          >
            Semua ({rows.length})
          </button>
          <button
            type="button"
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'pending_verification'
                ? 'border-amber-600 text-amber-900'
                : 'border-transparent text-slate-500 hover:text-amber-700'
            }`}
            onClick={() => setActiveTab('pending_verification')}
          >
            <span>⏳ Menunggu Verifikasi</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.5 font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'verified'
                ? 'border-emerald-600 text-emerald-900'
                : 'border-transparent text-slate-500 hover:text-emerald-700'
            }`}
            onClick={() => setActiveTab('verified')}
          >
            🟢 Terverifikasi
          </button>
          <button
            type="button"
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'rejected'
                ? 'border-red-600 text-red-900'
                : 'border-transparent text-slate-500 hover:text-red-700'
            }`}
            onClick={() => setActiveTab('rejected')}
          >
            🔴 Ditolak
          </button>

          {/* Scope Filters on the Right */}
          <div className="ml-auto flex items-center gap-2 pb-2">
            <select
              className="pv-input py-1 text-xs border-slate-200"
              value={filterScope}
              onChange={(e) => {
                setFilterScope(e.target.value);
                if (e.target.value !== 'event') setFilterEventId('');
              }}
            >
              <option value="all">Semua Scope</option>
              <option value="general">Umum</option>
              <option value="event">Event</option>
            </select>
            {filterScope === 'event' && (
              <select
                className="pv-input py-1 text-xs max-w-[180px] border-slate-200"
                value={filterEventId}
                onChange={(e) => setFilterEventId(e.target.value)}
              >
                <option value="">Semua Event</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-sm text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-t-transparent mb-4"></div>
            Memuat daftar transaksi non-IPL...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <div className="text-4xl mb-2 opacity-50">📋</div>
            Tidak ada transaksi non-IPL untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100/90 border-b border-slate-200 text-xs uppercase text-slate-700 font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Tujuan & Kategori</th>
                  <th className="px-5 py-3">Pembayar</th>
                  <th className="px-5 py-3">Metode</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Nominal</th>
                  <th className="px-5 py-3 text-center">Aksi / Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const isRowPending = row.status === 'pending_verification';
                  const canVerifyRow = isStaff || (row.scope === 'event' && manageableEventIds.has(row.event_id));

                  return (
                    <tr key={row.id} className={`hover:bg-slate-50/80 transition-colors ${isRowPending ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600 font-medium text-xs">
                        {formatDate(row.income_date)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          {row.scope === 'event' ? `🎪 ${getEventName(row.event_id)}` : '🏡 Kas Umum'}
                        </div>
                        <div className="font-bold text-slate-900">{row.category}</div>
                        <p className="text-xs text-slate-500 line-clamp-1">{row.description}</p>
                        {row.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1 font-medium">
                            ⚠️ Alasan ditolak: {row.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {row.source_name}
                      </td>
                      <td className="px-5 py-3">
                        {getMethodBadge(row.payment_method)}
                      </td>
                      <td className="px-5 py-3">
                        {getStatusBadge(row.status)}
                      </td>
                      <td className="px-5 py-3 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                        {formatRupiah(row.amount)}
                      </td>
                      <td className="px-5 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Bukti Transfer Viewer */}
                          {row.receipt_file_url ? (
                            <button
                              type="button"
                              className="pv-btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs font-semibold"
                              onClick={() => setPreviewImage(row.receipt_file_url)}
                              title="Lihat Bukti Transfer"
                            >
                              <AiOutlineEye /> Bukti
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Tanpa bukti</span>
                          )}

                          {/* Action Buttons for Staff / Event Treasurer on Pending Rows */}
                          {isRowPending && canVerifyRow && (
                            <>
                              <button
                                type="button"
                                className="py-1 px-2.5 text-xs font-bold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1 shadow-xs transition-colors"
                                onClick={() => handleApprove(row)}
                                title="Setujui dan Verifikasi"
                              >
                                <AiOutlineCheck /> Terima
                              </button>
                              <button
                                type="button"
                                className="py-1 px-2.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1 shadow-xs transition-colors"
                                onClick={() => {
                                  setRejectingItem(row);
                                  setRejectionReason('');
                                }}
                                title="Tolak Pembayaran"
                              >
                                <AiOutlineClose /> Tolak
                              </button>
                            </>
                          )}

                          {/* Edit / Delete for Authorized Staff */}
                          {canVerifyRow && (
                            <div className="flex items-center gap-2 ml-1 border-l border-slate-200 pl-2">
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-600 hover:underline"
                                onClick={() => {
                                  setEditingId(row.id);
                                  setForm({
                                    income_date: row.income_date ? new Date(row.income_date).toISOString().slice(0, 10) : '',
                                    scope: row.scope,
                                    event_id: row.event_id || '',
                                    category: row.category,
                                    source_name: row.source_name,
                                    amount: row.amount,
                                    payment_method: row.payment_method || 'bank_transfer',
                                    reference_number: row.reference_number || '',
                                    description: row.description || '',
                                  });
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-xs font-semibold text-red-600 hover:underline"
                                onClick={() => remove(row.id)}
                              >
                                Hapus
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                <tr>
                  <td colSpan="5" className="px-5 py-3 text-right text-slate-700 text-xs uppercase tracking-wider">
                    Total Pemasukan Terverifikasi:
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-extrabold text-emerald-700">
                    {formatRupiah(totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal Preview Bukti Transfer */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-w-2xl w-full rounded-2xl bg-white p-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">Lampiran Bukti Transfer</h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                onClick={() => setPreviewImage(null)}
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center bg-slate-100 rounded-xl p-2 max-h-[70vh] overflow-auto">
              <img
                src={previewImage}
                alt="Bukti Transfer"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-xs"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <a
                href={previewImage}
                target="_blank"
                rel="noreferrer"
                className="pv-btn-ghost text-xs"
              >
                Buka Gambar di Tab Baru
              </a>
              <button
                type="button"
                className="pv-btn-primary text-xs"
                onClick={() => setPreviewImage(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alasan Penolakan */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm">Tolak Pembayaran Non-IPL</h3>
            <p className="text-xs text-slate-500 mt-1">
              Masukkan alasan penolakan untuk transaksi sebesar{' '}
              <span className="font-bold text-slate-900">
                {formatRupiah(rejectingItem.amount)}
              </span>{' '}
              dari <span className="font-bold text-slate-900">{rejectingItem.source_name}</span>.
            </p>
            <form onSubmit={handleRejectSubmit} className="mt-4 space-y-3">
              <textarea
                className="pv-input text-xs"
                rows="3"
                placeholder="Contoh: Bukti transfer tidak jelas / nominal tidak sesuai rekening koran."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="pv-btn-ghost text-xs"
                  onClick={() => setRejectingItem(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors shadow-xs"
                >
                  Konfirmasi Tolak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal QRIS Checkout Interaktif (Sama seperti Matriks Bayar) */}
      {qrisCheckoutData && (
        <QrisCheckoutModal
          data={qrisCheckoutData}
          title={qrisCheckoutData.category ? `QRIS ${qrisCheckoutData.category.toUpperCase()}` : 'PEMBAYARAN QRIS RESMI'}
          onConfirm={handleQrisPaymentConfirm}
          onCancel={() => setQrisCheckoutData(null)}
          onClose={() => setQrisCheckoutData(null)}
        />
      )}
    </div>
  );
}

