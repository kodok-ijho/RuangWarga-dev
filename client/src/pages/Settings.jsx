import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineCloseCircle,
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineMail,
  AiOutlinePlayCircle,
  AiOutlineSave,
} from 'react-icons/ai';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { useToast } from '../hooks/useToast';
import {
  formatRupiah,
  hasMinRole,
  isBendaharaOrAbove,
  canModifyData,
  canManageSettings,
  canManagePaymentSchemas,
  getQrisProviderLabel,
} from '../services/dataHelpers';
import {
  fetchSettings,
  runPaymentSmokeTest,
  updatePaymentSmokeTestSettings,
  updateSettings,
} from '../services/dataService';

function computeSchemaAmount(schema) {
  if (!schema || !schema.components) return 0;
  return schema.components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export default function Settings() {
  const { role, session, isReadOnly } = useAuth();
  const toast = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Local state for settings form fields
  const [dueDay, setDueDay] = useState(10);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(true);
  const [lateFeeType, setLateFeeType] = useState('percent');
  const [lateFeeValue, setLateFeeValue] = useState(5);
  const [billRecipient, setBillRecipient] = useState('occupant');
  const [qrisEnabled, setQrisEnabled] = useState(true);
  const [qrisProvider, setQrisProvider] = useState('doku');
  const [schemas, setSchemas] = useState([]);
  const [smokeTest, setSmokeTest] = useState(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchSettings(session?.access_token);
      setDueDay(data.due_day);
      setLateFeeEnabled(data.late_fee_enabled);
      setLateFeeType(data.late_fee_type);
      setLateFeeValue(data.late_fee_value);
      setBillRecipient(data.bill_recipient || 'occupant');
      setQrisEnabled(data.qris_enabled ?? true);
      setQrisProvider(String(data.qris_provider || 'doku').toLowerCase());
      setSmokeTest({
        notification_email: data.smoke_test?.notification_email || session?.user?.email || '',
        notify_recovery: data.smoke_test?.notify_recovery ?? true,
        last_run: data.smoke_test?.last_run || { status: 'never', checks: [] },
      });
      setSchemas(
        (data.ipl_schemas || []).map((s) => ({
          ...s,
          components: (s.components || []).map((c) => ({ ...c })),
        }))
      );
    } catch (err) {
      const msg = err.message || 'Gagal memuat pengaturan IPL.';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, session?.user?.email, toast]);

  useEffect(() => {
    if (hasMinRole(role, 'pengurus')) {
      loadSettings();
    }
  }, [loadSettings, role]);

  // Staff-only guard (pengurus, bendahara, admin)
  if (!hasMinRole(role, 'pengurus')) {
    return <Navigate to="/" replace />;
  }

  const canWrite = canModifyData(role) && !isReadOnly;
  const canEdit = canManageSettings(role, isReadOnly);
  const canEditSchema = canManagePaymentSchemas(role, isReadOnly);
  // Global billing/due-date controls are Admin-only. Bendahara may maintain
  // IPL component schemas, matching the production role contract.
  const canEditBilling = canManageSettings(role, isReadOnly);

  const handleAddSchema = () => {
    const newId = `schema-${Date.now()}`;
    setSchemas((prev) => [
      ...prev,
      {
        id: newId,
        name: 'Skema IPL Baru',
        description: 'Deskripsi skema biaya IPL untuk tipe unit tertentu.',
        components: [
          { name: 'Keamanan', amount: 80000 },
          { name: 'Kebersihan', amount: 30000 },
        ],
      },
    ]);
  };

  const handleRemoveSchema = (id) => {
    if (schemas.length <= 1) {
      toast.error('Minimal harus ada 1 skema biaya IPL.');
      return;
    }
    setSchemas((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSchemaChange = (id, field, value) => {
    setSchemas((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleAddComponent = (schemaId) => {
    setSchemas((prev) =>
      prev.map((s) =>
        s.id === schemaId
          ? {
              ...s,
              components: [...s.components, { name: 'Komponen Baru', amount: 10000 }],
            }
          : s
      )
    );
  };

  const handleRemoveComponent = (schemaId, index) => {
    setSchemas((prev) =>
      prev.map((s) => {
        if (s.id !== schemaId) return s;
        if (s.components.length <= 1) {
          toast.error('Minimal 1 komponen dalam sebuah skema.');
          return s;
        }
        const nextComp = s.components.filter((_, idx) => idx !== index);
        return { ...s, components: nextComp };
      })
    );
  };

  const handleComponentChange = (schemaId, index, field, value) => {
    setSchemas((prev) =>
      prev.map((s) => {
        if (s.id !== schemaId) return s;
        const nextComp = s.components.map((c, idx) =>
          idx === index ? { ...c, [field]: value } : c
        );
        return { ...s, components: nextComp };
      })
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEditBilling && !canEditSchema) {
      toast.error('Anda tidak memiliki hak untuk mengubah pengaturan ini.');
      return;
    }

    // Validasi pengaturan denda oleh Admin & Bendahara.
    if (canEditBilling) {
      if (lateFeeEnabled && lateFeeValue < 0) {
        toast.error('Nilai denda tidak boleh negatif.');
        return;
      }
      if (lateFeeEnabled && lateFeeType === 'percent' && Number(lateFeeValue) > 100) {
        toast.error('Persentase denda tidak boleh lebih dari 100%.');
        return;
      }
    }
    if (canEdit) {
      if (dueDay < 1 || dueDay > 28) {
        toast.error('Tanggal jatuh tempo harus antara 1-28.');
        return;
      }
      if (!['midtrans', 'doku'].includes(String(qrisProvider).toLowerCase())) {
        toast.error('Provider QRIS harus Midtrans atau DOKU.');
        return;
      }
    }

    // Validasi Skema (Admin & Bendahara)
    if (canEditSchema) {
      if (schemas.some((s) => !s.name.trim())) {
        toast.error('Semua skema IPL harus punya nama.');
        return;
      }
      if (schemas.some((s) => s.components.length === 0)) {
        toast.error('Setiap skema IPL minimal harus punya 1 komponen biaya.');
        return;
      }
      if (schemas.some((s) => s.components.some((c) => !c.name.trim()))) {
        toast.error('Semua komponen dalam skema IPL harus punya nama.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {};
      if (canEdit) {
        payload.due_day = Number(dueDay);
        payload.bill_recipient = billRecipient;
        payload.qris_enabled = !!qrisEnabled;
        payload.qris_provider = String(qrisProvider).toLowerCase();
      }
      if (canEditBilling) {
        payload.late_fee_enabled = lateFeeEnabled;
        payload.late_fee_type = lateFeeType;
        payload.late_fee_value = Number(lateFeeValue);
      }
      if (canEditSchema) {
        payload.ipl_schemas = schemas.map((s) => ({
          id: s.id,
          name: s.name.trim(),
          description: s.description.trim(),
          components: s.components.map((c) => ({
            name: c.name.trim(),
            amount: Number(c.amount) || 0,
          })),
        }));
      }

      await updateSettings(session?.access_token, payload);
      toast.success('Pengaturan Profil Skema IPL & sistem berhasil disimpan.');
      loadSettings();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pv-card p-10 text-center max-w-4xl">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-forest-100 border-t-gold-500 animate-spin" />
        <p className="text-sm text-forest-500">Memuat pengaturan sistem...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pv-card p-8 text-center max-w-4xl bg-red-50 border border-red-200">
        <p className="text-sm text-red-600 font-medium mb-4">{loadError}</p>
        <button onClick={loadSettings} className="pv-btn-primary px-4 py-2 text-xs">
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Pengaturan IPL & Skema Biaya</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Atur profil skema biaya IPL yang menempel pada unit rumah, tanggal jatuh tempo, dan denda keterlambatan.
        </p>
      </div>

      {!canEditBilling && !canEditSchema && (
        <div className="pv-card p-3 bg-blue-50/60 border border-blue-200 text-blue-800 text-xs flex items-center gap-2 rounded-xl">
          <span>ℹ️</span>
          <span>Anda melihat pengaturan dalam mode read-only.</span>
        </div>
      )}
      {!canEdit && canEditSchema && !canEditBilling && (
        <div className="pv-card p-3 bg-emerald-50/60 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 rounded-xl">
          <span>ℹ️</span>
          <span>Sebagai <b>Bendahara</b>, Anda memiliki hak akses untuk menambah, mengedit, dan menghapus Profil Skema Biaya IPL.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Ringkasan Skema & Jatuh Tempo */}
        <div className="pv-card p-5 border border-slate-200 bg-white shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Ringkasan Skema Aktif & Jatuh Tempo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Profil Skema IPL Aktif
              </label>
              <div className="flex flex-wrap gap-2">
                {schemas.map((s) => {
                  const total = computeSchemaAmount(s);
                  return (
                    <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
                      <span className="font-bold text-slate-900 block">{s.name}</span>
                      <span className="text-emerald-700 font-extrabold">{formatRupiah(total)} / bln</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Skema ini akan ditempelkan pada masing-masing unit di halaman Daftar Rumah.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tanggal Jatuh Tempo Bulanan
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Tgl</span>
                <input
                  type="number"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  min="1"
                  max="28"
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-200 bg-white disabled:bg-slate-50 pl-10 pr-3 py-2.5 text-sm font-bold text-slate-900 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Berlaku untuk seluruh tagihan warga setiap bulan (tanggal 1-28).</p>
            </div>
          </div>
        </div>

        {/* Profil Skema Biaya IPL */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">Profil Skema Biaya IPL</h3>
              <p className="text-xs text-slate-500">
                Tentukan paket komponen biaya IPL (mis. Rumah Ditempati vs Rumah Kosong).
              </p>
            </div>
            {canEditSchema && (
              <button
                type="button"
                onClick={handleAddSchema}
                className="pv-btn-primary text-xs"
              >
                <AiOutlinePlus /> Tambah Skema Baru
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {schemas.map((schema) => {
              const schemaTotal = computeSchemaAmount(schema);
              return (
                <div key={schema.id} className="pv-card p-5 border border-slate-200 border-l-4 border-l-gold-500 bg-white shadow-xs hover:shadow-sm transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={schema.name}
                          onChange={(e) => handleSchemaChange(schema.id, 'name', e.target.value)}
                          placeholder="Nama Skema (mis. IPL Komplit)"
                          disabled={!canEditSchema}
                          className="font-bold text-base text-slate-900 rounded-lg border border-slate-200 bg-white disabled:bg-transparent px-3 py-1.5 focus:border-gold-500 outline-none w-full max-w-sm"
                        />
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {formatRupiah(schemaTotal)} / bulan
                        </span>
                      </div>
                      <input
                        type="text"
                        value={schema.description || ''}
                        onChange={(e) => handleSchemaChange(schema.id, 'description', e.target.value)}
                        placeholder="Deskripsi peruntukan skema..."
                        disabled={!canEditSchema}
                        className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-white disabled:bg-transparent px-3 py-1.5 focus:border-gold-500 outline-none w-full"
                      />
                    </div>
                    {canEditSchema && schemas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSchema(schema.id)}
                        className="self-start md:self-center px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <AiOutlineDelete /> Hapus Skema
                      </button>
                    )}
                  </div>

                  {/* Komponen dalam skema */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
                      <span>Rincian Komponen Biaya</span>
                      {canEditSchema && (
                        <button
                          type="button"
                          onClick={() => handleAddComponent(schema.id)}
                          className="text-gold-600 hover:text-gold-700 font-bold flex items-center gap-1 normal-case text-xs"
                        >
                          <AiOutlinePlus /> Tambah Komponen
                        </button>
                      )}
                    </div>

                    {schema.components.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 italic">Belum ada komponen biaya dalam skema ini.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {schema.components.map((comp, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <input
                              type="text"
                              value={comp.name}
                              onChange={(e) => handleComponentChange(schema.id, idx, 'name', e.target.value)}
                              placeholder="Nama Komponen"
                              disabled={!canEditSchema}
                              className="flex-1 rounded border border-slate-200 bg-white disabled:bg-transparent px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-gold-500 outline-none"
                            />
                            <div className="relative w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">Rp</span>
                              <input
                                type="number"
                                value={comp.amount}
                                onChange={(e) => handleComponentChange(schema.id, idx, 'amount', e.target.value)}
                                min="0"
                                step="1000"
                                disabled={!canEditSchema}
                                className="w-full rounded border border-slate-200 bg-white disabled:bg-transparent pl-7 pr-2 py-1.5 text-xs font-bold text-slate-900 focus:border-gold-500 outline-none"
                              />
                            </div>
                            {canEditSchema && (
                              <button
                                type="button"
                                onClick={() => handleRemoveComponent(schema.id, idx)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                aria-label="Hapus komponen"
                              >
                                <AiOutlineDelete size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pv-card p-5 border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-sm font-bold text-slate-900">QRIS & Provider</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Aktifkan QRIS untuk warga, pengurus, bendahara, dan admin. Provider aktif: DOKU Production.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 font-semibold">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${qrisEnabled ? 'bg-emerald-500' : 'bg-rose-400'}`} />
              <span>{qrisEnabled ? 'QRIS aktif' : 'QRIS nonaktif'}</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors">
              <span>
                <span className="block text-sm font-semibold text-slate-900">Aktifkan QRIS</span>
                <span className="block text-[11px] text-slate-500">Jika dimatikan, opsi QRIS disembunyikan dan request ditolak backend.</span>
              </span>
              <input
                type="checkbox"
                checked={qrisEnabled}
                onChange={(e) => setQrisEnabled(e.target.checked)}
                disabled={!canEdit}
                className="h-5 w-5 accent-gold-500 cursor-pointer"
              />
            </label>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Provider QRIS</label>
              <select
                value={qrisProvider}
                onChange={(e) => setQrisProvider(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-gold-500 disabled:bg-slate-50 font-semibold"
              >
                <option value="midtrans">Midtrans</option>
                <option value="doku">DOKU</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Aktif saat ini: {getQrisProviderLabel(qrisProvider)}.
              </p>
            </div>
          </div>
        </div>

        {/* Penerima Tagihan & Denda */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Penerima Tagihan */}
          <div className="pv-card p-5 border border-slate-200 bg-white shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Penerima Tagihan IPL</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Tentukan ke siapa tagihan IPL ditujukan untuk seluruh unit.
            </p>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border ${!canEdit ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer'} transition-colors ${
                  billRecipient === 'occupant'
                    ? 'border-gold-400 bg-gold-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="billRecipient"
                  checked={billRecipient === 'occupant'}
                  onChange={() => setBillRecipient('occupant')}
                  disabled={!canEdit}
                  className="mt-1 accent-gold-500"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Penghuni (Occupant)</p>
                  <p className="text-[11px] text-slate-500">
                    Tagihan ke yang tinggal di unit — penyewa bila ada, kalau kosong fallback ke pemilik.
                  </p>
                </div>
              </label>
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border ${!canEdit ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer'} transition-colors ${
                  billRecipient === 'owner'
                    ? 'border-gold-400 bg-gold-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="billRecipient"
                  checked={billRecipient === 'owner'}
                  onChange={() => setBillRecipient('owner')}
                  disabled={!canEdit}
                  className="mt-1 accent-gold-500"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Pemilik (Owner)</p>
                  <p className="text-[11px] text-slate-500">
                    Tagihan selalu ke pemilik unit, terlepas siapa yang menempati.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Denda */}
          <div className="pv-card p-5 border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Denda Keterlambatan</h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={lateFeeEnabled}
                  onChange={(e) => setLateFeeEnabled(e.target.checked)}
                  disabled={!canEditBilling}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
              </label>
            </div>

            {lateFeeEnabled ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Jenis Denda</label>
                  <select
                    value={lateFeeType}
                    onChange={(e) => setLateFeeType(e.target.value)}
                    disabled={!canEditBilling}
                    className="w-full rounded-lg border border-slate-200 bg-white disabled:bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-gold-500 outline-none font-semibold"
                  >
                    <option value="percent">Persentase (%)</option>
                    <option value="fixed">Nominal Tetap (Rp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nilai Denda {lateFeeType === 'percent' ? '(%)' : '(Rp)'}
                  </label>
                  <input
                    type="number"
                    value={lateFeeValue}
                    onChange={(e) => setLateFeeValue(e.target.value)}
                    min="0"
                    step={lateFeeType === 'percent' ? '0.5' : '1000'}
                    disabled={!canEditBilling}
                    className="w-full rounded-lg border border-slate-200 bg-white disabled:bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 focus:border-gold-500 outline-none transition-all"
                  />
                  {lateFeeType === 'percent' && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Contoh: 5% denda keterlambatan atas tagihan jatuh tempo.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-4 italic">Denda keterlambatan saat ini dinonaktifkan.</p>
            )}
          </div>
        </div>

        {/* Save Button */}
        {(canEdit || canEditSchema) && (
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="pv-btn-primary px-6 py-3 text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AiOutlineSave size={18} /> {isSaving ? 'Menyimpan...' : 'Simpan Perubahan Pengaturan'}
            </button>
          </div>
        )}
      </form>

      {canEdit && canWrite && smokeTest && (
        <PaymentSmokeTestPanel
          session={session}
          value={smokeTest}
          onChange={setSmokeTest}
          onRefresh={loadSettings}
        />
      )}

      {/* Generasi Tagihan Bulanan (Staff Only - Bendahara & Admin) */}
      {isBendaharaOrAbove(role) && canWrite && (
        <div className="pv-card p-6 mt-8 border border-slate-200 border-t-4 border-t-forest-800 bg-white shadow-xs">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight mb-1">Generasi Tagihan IPL Massal</h3>
          <p className="text-xs text-slate-500 mb-5">
            Jalankan pembuatan tagihan IPL massal secara otomatis untuk seluruh unit rumah pada periode tertentu.
          </p>

          <BillingGenerator session={session} />
        </div>
      )}
    </div>
  );
}

function PaymentSmokeTestPanel({ session, value, onChange, onRefresh }) {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const lastRun = value.last_run || { status: 'never', checks: [] };
  const statusStyles = {
    pass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    fail: 'bg-red-50 border-red-200 text-red-700',
    never: 'bg-slate-50 border-slate-200 text-slate-500',
  };

  const updateField = (field, nextValue) => {
    onChange((current) => ({ ...current, [field]: nextValue }));
  };

  const handleSave = async () => {
    const email = value.notification_email.trim().toLowerCase();
    if (value.enabled && !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error('Masukkan alamat email notifikasi yang valid.');
      return;
    }

    setIsSaving(true);
    try {
      await updatePaymentSmokeTestSettings(session?.access_token, {
        enabled: !!value.enabled,
        frequency: value.frequency,
        run_hour: Number(value.run_hour),
        timezone: value.timezone,
        notification_email: email,
        notify_recovery: !!value.notify_recovery,
      });
      toast.success('Jadwal smoke test pembayaran berhasil disimpan.');
      await onRefresh();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan jadwal smoke test.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const result = await runPaymentSmokeTest(session?.access_token);
      onChange((current) => ({ ...current, last_run: result }));
      if (result.status === 'pass') {
        toast.success('Smoke test pembayaran selesai tanpa masalah.');
      } else {
        toast.error('Smoke test menemukan kegagalan. Detail dan notifikasi email sudah diproses.');
      }
    } catch (err) {
      toast.error(err.message || 'Smoke test tidak dapat dijalankan.');
    } finally {
      setIsRunning(false);
    }
  };

  const finishedAt = lastRun.finished_at
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: value.timezone,
      }).format(new Date(lastRun.finished_at))
    : 'Belum pernah dijalankan';

  return (
    <section className="pv-card p-5 border border-slate-200 border-t-4 border-t-gold-500 bg-white shadow-xs" aria-labelledby="payment-smoke-test-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AiOutlineClockCircle className="text-gold-600" size={20} />
            <h3 id="payment-smoke-test-title" className="text-base font-extrabold text-slate-900 tracking-tight">
              Smoke Test Pembayaran Transfer
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Memeriksa Supabase serta proses upload, permission, dan cleanup bukti bayar di Google Drive.
          </p>
        </div>
        <div className={`inline-flex min-h-9 items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-xs font-bold ${statusStyles[lastRun.status] || statusStyles.never}`}>
          {lastRun.status === 'pass' ? <AiOutlineCheckCircle size={16} /> : lastRun.status === 'fail' ? <AiOutlineCloseCircle size={16} /> : <AiOutlineClockCircle size={16} />}
          {lastRun.status === 'pass' ? 'Terakhir PASS' : lastRun.status === 'fail' ? 'Terakhir FAIL' : 'Belum Dijalankan'}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 cursor-pointer hover:bg-slate-100/60 transition-colors">
          <span>
            <span className="block text-sm font-semibold text-slate-900">Jalankan Otomatis</span>
            <span className="block text-[11px] text-slate-500">Workflow tetap berjalan saat portal ditutup.</span>
          </span>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => updateField('enabled', event.target.checked)}
            className="h-5 w-5 accent-gold-500 cursor-pointer"
          />
        </label>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="smoke-test-email">
            Email Saat Gagal
          </label>
          <div className="relative">
            <AiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="smoke-test-email"
              type="email"
              value={value.notification_email}
              onChange={(event) => updateField('notification_email', event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-gold-500 font-medium"
              placeholder="nama@gmail.com"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="smoke-test-frequency">
            Frekuensi
          </label>
          <select
            id="smoke-test-frequency"
            value={value.frequency}
            onChange={(event) => updateField('frequency', event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-gold-500"
          >
            <option value="every_6_hours">Setiap 6 jam</option>
            <option value="daily">Setiap hari</option>
            <option value="weekly">Setiap Senin</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="smoke-test-hour">
            Jam Eksekusi ({value.timezone})
          </label>
          <select
            id="smoke-test-hour"
            value={value.run_hour}
            onChange={(event) => updateField('run_hour', Number(event.target.value))}
            disabled={value.frequency === 'every_6_hours'}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-gold-500 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={value.notify_recovery}
          onChange={(event) => updateField('notify_recovery', event.target.checked)}
          className="h-4 w-4 accent-gold-500 cursor-pointer"
        />
        Kirim email pemulihan ketika hasil kembali PASS setelah sebelumnya gagal.
      </label>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">Eksekusi terakhir:</span> {finishedAt}
            {lastRun.duration_ms != null && <span> ({lastRun.duration_ms} ms)</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunNow}
              disabled={isRunning || isSaving}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
            >
              <AiOutlinePlayCircle size={17} />
              {isRunning ? 'Menjalankan...' : 'Jalankan Sekarang'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isRunning || isSaving}
              className="pv-btn-primary min-h-10 px-4 py-2 text-xs font-bold disabled:opacity-50 shadow-xs"
            >
              <AiOutlineSave size={16} />
              {isSaving ? 'Menyimpan...' : 'Simpan Jadwal'}
            </button>
          </div>
        </div>

        {Array.isArray(lastRun.checks) && lastRun.checks.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {lastRun.checks.map((check) => (
              <div key={check.key} className="flex min-h-14 items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                {check.status === 'pass' ? (
                  <AiOutlineCheckCircle className="mt-0.5 shrink-0 text-emerald-600" size={16} />
                ) : (
                  <AiOutlineCloseCircle className="mt-0.5 shrink-0 text-red-600" size={16} />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{check.label}</p>
                  <p className="mt-0.5 break-words text-[11px] text-slate-500">{check.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Inner helper component to keep Settings component clean
function BillingGenerator({ session }) {
  const toast = useToast();
  const { activeTenantId } = useTenant();
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const [period, setPeriod] = useState(currentPeriod);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async (dryRun) => {
    setLoading(true);
    try {
      const data = await import('../services/dataService').then(m => m.generateBills(session?.access_token, {
        period,
        dry_run: dryRun,
        tenantId: activeTenantId,
      }));
      setResult(data);
      if (dryRun) {
        toast.info(`Dry run selesai: ${data.total_preview} tagihan siap dibuat, ${data.skipped_count} dilewati.`);
      } else {
        toast.success(`Berhasil membuat ${data.generated_count} tagihan IPL untuk periode ${period}!`);
        setResult(null); // Reset preview on successful commit
      }
    } catch (err) {
      toast.error(err.message || 'Gagal menjalankan generasi tagihan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-end gap-3 max-w-md">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Pilih Periode Tagihan</label>
          <input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setResult(null);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-gold-500 outline-none"
          />
        </div>
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => handleRun(true)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 shadow-2xs"
        >
          Cek Preview (Dry Run)
        </button>
      </div>

      {loading && (
        <div className="text-xs text-slate-500 py-2 flex items-center gap-2">
          <div className="h-4 w-4 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
          <span>Sedang memproses...</span>
        </div>
      )}

      {result && (
        <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="block text-[10px] uppercase text-slate-400 font-bold">Periode</span>
              <span className="text-sm font-bold text-slate-900">{result.period}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="block text-[10px] uppercase text-slate-400 font-bold">Siap Dibuat</span>
              <span className="text-sm font-extrabold text-emerald-700">{result.total_preview ?? result.generated_count} unit</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="block text-[10px] uppercase text-slate-400 font-bold">Dilewati</span>
              <span className="text-sm font-extrabold text-amber-700">{result.skipped_count} unit</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="block text-[10px] uppercase text-slate-400 font-bold">Total Nominal</span>
              <span className="text-sm font-extrabold text-slate-900">
                {formatRupiah((result.preview || []).reduce((sum, b) => sum + b.amount, 0))}
              </span>
            </div>
          </div>

          {result.skipped_count > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2.5 border border-amber-200 font-medium">
              💡 {result.skipped_count} unit tidak digenerate karena sudah memiliki tagihan untuk periode ini.
            </div>
          )}

          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white text-xs divide-y divide-slate-100">
            {(result.preview || []).map((b, idx) => (
              <div key={idx} className="p-2.5 flex justify-between items-center hover:bg-slate-50/60">
                <span className="font-bold text-slate-900">{b.unit_info || `Unit ID: ${b.unit_id}`}</span>
                <span className="text-slate-500 font-medium">{b.resident_name || 'Kosong'}</span>
                <span className="font-extrabold text-emerald-700">{formatRupiah(b.amount)}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={loading || (result.total_preview ?? 0) === 0}
              onClick={() => handleRun(false)}
              className="pv-btn-primary px-5 py-2.5 text-xs font-bold shadow-xs disabled:opacity-50"
            >
              🚀 Konfirmasi & Buat Tagihan Sekarang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
