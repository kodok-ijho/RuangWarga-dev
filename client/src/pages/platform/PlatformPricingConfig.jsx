import { useState, useEffect } from 'react';
import {
  AiOutlineCheck,
  AiOutlineEdit,
  AiOutlineReload,
  AiOutlineSave,
  AiOutlineClose,
  AiOutlineInfoCircle,
  AiOutlineDollarCircle,
  AiOutlinePercentage,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { useToast } from '../../hooks/useToast';
import { getTenantTemplate } from '../../config/tenantTemplates';

const DEFAULT_BLOCK_PRICING = [
  { id: 'bp-1', tenant_type: 'rt_rw', block_size: 10, price_per_block: 12500, is_active: true },
  { id: 'bp-2', tenant_type: 'rt_rw', block_size: 5, price_per_block: 8750, is_active: true },
  { id: 'bp-3', tenant_type: 'kos', block_size: 10, price_per_block: 25000, is_active: true },
  { id: 'bp-4', tenant_type: 'kos', block_size: 5, price_per_block: 17500, is_active: true },
  { id: 'bp-5', tenant_type: 'arisan', block_size: 10, price_per_block: 12500, is_active: true },
  { id: 'bp-6', tenant_type: 'arisan', block_size: 5, price_per_block: 8750, is_active: true },
  { id: 'bp-7', tenant_type: 'kelas', block_size: 10, price_per_block: 6250, is_active: true },
  { id: 'bp-8', tenant_type: 'kelas', block_size: 5, price_per_block: 4375, is_active: true },
];

const DEFAULT_PERIODS = [
  { id: 'sp-1', duration_months: 3, discount_percent: 0, is_active: true },
  { id: 'sp-2', duration_months: 6, discount_percent: 10, is_active: true },
  { id: 'sp-3', duration_months: 12, discount_percent: 20, is_active: true },
];

export default function PlatformPricingConfig() {
  const toast = useToast();
  const { isDemo } = useTenant();

  const [pricingList, setPricingList] = useState([]);
  const [periodsList, setPeriodsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit states for block pricing
  const [editingPricingId, setEditingPricingId] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [editPricingActive, setEditPricingActive] = useState(true);

  // Edit states for periods
  const [editingPeriodId, setEditingPeriodId] = useState(null);
  const [editDiscountValue, setEditDiscountValue] = useState('');
  const [editPeriodActive, setEditPeriodActive] = useState(true);

  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    if (isDemo) {
      setPricingList(DEFAULT_BLOCK_PRICING);
      setPeriodsList(DEFAULT_PERIODS);
      setLoading(false);
      return;
    }

    try {
      const [pricingRes, periodsRes] = await Promise.all([
        supabase.from('block_pricing').select('*').order('tenant_type').order('block_size', { ascending: false }),
        supabase.from('subscription_periods').select('*').order('duration_months'),
      ]);

      if (pricingRes.error) throw pricingRes.error;
      if (periodsRes.error) throw periodsRes.error;

      setPricingList(pricingRes.data || []);
      setPeriodsList(periodsRes.data || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PlatformPricingConfig] Gagal memuat data harga:', err);
      toast.error('Gagal memuat konfigurasi harga dari database: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Handlers Block Pricing ---
  const handleStartEditPricing = (item) => {
    setEditingPricingId(item.id);
    setEditPriceValue(item.price_per_block.toString());
    setEditPricingActive(item.is_active);
  };

  const handleCancelEditPricing = () => {
    setEditingPricingId(null);
    setEditPriceValue('');
  };

  const handleSavePricing = async (item) => {
    const numPrice = parseFloat(editPriceValue);
    if (isNaN(numPrice) || numPrice < 0) {
      toast.error('Harga harus berupa angka positif.');
      return;
    }

    setSaving(true);
    if (isDemo) {
      setPricingList((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, price_per_block: numPrice, is_active: editPricingActive } : p
        )
      );
      setSaving(false);
      setEditingPricingId(null);
      toast.success('Harga blok berhasil diperbarui (Demo Mode).');
      return;
    }

    try {
      const { error } = await supabase
        .from('block_pricing')
        .update({
          price_per_block: numPrice,
          is_active: editPricingActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      setPricingList((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, price_per_block: numPrice, is_active: editPricingActive } : p
        )
      );
      setEditingPricingId(null);
      toast.success('Harga blok berhasil disimpan ke database.');
    } catch (err) {
      toast.error('Gagal menyimpan harga: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers Subscription Periods ---
  const handleStartEditPeriod = (period) => {
    setEditingPeriodId(period.id);
    setEditDiscountValue(period.discount_percent.toString());
    setEditPeriodActive(period.is_active);
  };

  const handleCancelEditPeriod = () => {
    setEditingPeriodId(null);
    setEditDiscountValue('');
  };

  const handleSavePeriod = async (period) => {
    const numDisc = parseFloat(editDiscountValue);
    if (isNaN(numDisc) || numDisc < 0 || numDisc > 100) {
      toast.error('Diskon harus berada di antara 0% dan 100%.');
      return;
    }

    setSaving(true);
    if (isDemo) {
      setPeriodsList((prev) =>
        prev.map((p) =>
          p.id === period.id ? { ...p, discount_percent: numDisc, is_active: editPeriodActive } : p
        )
      );
      setSaving(false);
      setEditingPeriodId(null);
      toast.success('Diskon periode berhasil diperbarui (Demo Mode).');
      return;
    }

    try {
      const { error } = await supabase
        .from('subscription_periods')
        .update({
          discount_percent: numDisc,
          is_active: editPeriodActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', period.id);

      if (error) throw error;

      setPeriodsList((prev) =>
        prev.map((p) =>
          p.id === period.id ? { ...p, discount_percent: numDisc, is_active: editPeriodActive } : p
        )
      );
      setEditingPeriodId(null);
      toast.success('Konfigurasi periode berhasil disimpan.');
    } catch (err) {
      toast.error('Gagal menyimpan periode: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Hitung diskon tahunan aktif untuk preview kalkulasi
  const annualDiscount = periodsList.find((p) => p.duration_months === 12)?.discount_percent ?? 20;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">💰</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
              Konfigurasi Harga &amp; Periode
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Atur skema tarif berlangganan platform berbasis blok kapasitas unit dan diskon durasi komitmen (FR-7 s/d FR-11).
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 shadow-xs transition-colors self-start sm:self-auto"
        >
          <AiOutlineReload className={loading ? 'animate-spin' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-start gap-3 text-xs text-amber-900 leading-relaxed shadow-xs">
        <AiOutlineInfoCircle className="text-lg text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-900">Prinsip Penetapan Tarif:</strong> Nilai <code>price_per_block</code> di bawah
          adalah tarif dasar (base price) per bulan. User yang memilih komitmen tahunan (12 bulan) mendapatkan diskon{' '}
          <strong className="text-amber-800">{annualDiscount}%</strong>, sehingga tarif efektif per bulannya lebih hemat.
          Tarif blok kecil (5 unit) memiliki unit cost ~40% lebih tinggi dibandingkan blok 10 unit untuk mendorong adopsi paket efisien.
        </div>
      </div>

      {/* SECTION 1: Block Pricing Matrix */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AiOutlineDollarCircle className="text-amber-500 text-xl" />
            <h2 className="text-lg font-bold text-slate-900 font-display">Matriks Harga Blok Kapasitas (Block Pricing)</h2>
          </div>
          <span className="text-xs text-slate-500">Total {pricingList.length} Entri Tarif</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 rounded-full border-2 border-forest-700 border-t-gold-500 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-3.5 px-4">Tipe Layanan</th>
                    <th className="py-3.5 px-4">Ukuran Blok</th>
                    <th className="py-3.5 px-4">Base Price / Bulan</th>
                    <th className="py-3.5 px-4">Efektif Tahunan (-{annualDiscount}%)</th>
                    <th className="py-3.5 px-4">Total Bayar / Thn</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricingList.map((item) => {
                    const tmpl = getTenantTemplate(item.tenant_type);
                    const isEditing = editingPricingId === item.id;
                    const basePrice = isEditing ? parseFloat(editPriceValue) || 0 : Number(item.price_per_block);
                    const discountedMonthly = basePrice * (1 - annualDiscount / 100);
                    const annualTotal = discountedMonthly * 12;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Tenant Type */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{tmpl.icon}</span>
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{tmpl.name}</div>
                              <span className="font-mono text-[10px] text-slate-400">{item.tenant_type}</span>
                            </div>
                          </div>
                        </td>

                        {/* Block Size */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${
                              item.block_size === 10
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {item.block_size} {tmpl.unitLabel}
                          </span>
                        </td>

                        {/* Base Price */}
                        <td className="py-3.5 px-4">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-xs">Rp</span>
                              <input
                                type="number"
                                value={editPriceValue}
                                onChange={(e) => setEditPriceValue(e.target.value)}
                                className="w-28 px-2.5 py-1 bg-white border border-forest-800 rounded text-xs text-slate-900 focus:outline-none shadow-xs"
                                step="250"
                                min="0"
                              />
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-900 font-mono text-xs">
                              Rp {Number(item.price_per_block).toLocaleString('id-ID')}
                            </span>
                          )}
                        </td>

                        {/* Effective Monthly Price */}
                        <td className="py-3.5 px-4">
                          <span className="text-emerald-700 font-bold font-mono text-xs">
                            Rp {Math.round(discountedMonthly).toLocaleString('id-ID')}
                            <span className="text-[10px] text-slate-400 font-normal">/bln</span>
                          </span>
                        </td>

                        {/* Annual Total */}
                        <td className="py-3.5 px-4">
                          <span className="text-slate-700 font-semibold font-mono text-xs">
                            Rp {Math.round(annualTotal).toLocaleString('id-ID')}
                          </span>
                        </td>

                        {/* Active Status */}
                        <td className="py-3.5 px-4">
                          {isEditing ? (
                            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={editPricingActive}
                                onChange={(e) => setEditPricingActive(e.target.checked)}
                                className="rounded border-slate-300 text-forest-800 focus:ring-forest-800"
                              />
                              <span>Aktif</span>
                            </label>
                          ) : (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                item.is_active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {item.is_active ? 'Aktif' : 'Non-Aktif'}
                            </span>
                          )}
                        </td>

                        {/* Action buttons */}
                        <td className="py-3.5 px-4 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSavePricing(item)}
                                disabled={saving}
                                className="p-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs"
                                title="Simpan Perubahan"
                              >
                                <AiOutlineSave className="text-base" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditPricing}
                                disabled={saving}
                                className="p-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs shadow-xs"
                                title="Batal"
                              >
                                <AiOutlineClose className="text-base" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEditPricing(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs transition-colors border border-slate-200 shadow-xs font-semibold"
                            >
                              <AiOutlineEdit />
                              <span>Edit</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Subscription Periods Matrix */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AiOutlinePercentage className="text-amber-500 text-xl" />
            <h2 className="text-lg font-bold text-slate-900 font-display">Opsi Periode Langganan &amp; Diskon (Subscription Periods)</h2>
          </div>
          <span className="text-xs text-slate-500">{periodsList.length} Periode Didukung</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {periodsList.map((period) => {
            const isEditing = editingPeriodId === period.id;

            return (
              <div
                key={period.id}
                className={`bg-white border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-xs ${
                  isEditing
                    ? 'border-2 border-forest-800 ring-4 ring-forest-800/10 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-900 font-display">
                      Paket {period.duration_months} Bulan
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                        period.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {period.is_active ? 'Aktif' : 'Non-Aktif'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mb-4">
                    Komitmen perpanjangan tagihan setiap {period.duration_months} bulan sekali.
                  </p>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Besar Diskon:</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={editDiscountValue}
                            onChange={(e) => setEditDiscountValue(e.target.value)}
                            className="w-16 px-2 py-0.5 bg-white border border-forest-800 rounded text-xs text-slate-900 focus:outline-none text-right font-bold shadow-xs"
                            step="1"
                            min="0"
                            max="100"
                          />
                          <span className="text-amber-800 font-bold">%</span>
                        </div>
                      ) : (
                        <span className="text-base font-extrabold text-amber-800 font-mono">
                          {Number(period.discount_percent)}%
                        </span>
                      )}
                    </div>

                    {isEditing && (
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Status Aktif:</span>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={editPeriodActive}
                            onChange={(e) => setEditPeriodActive(e.target.checked)}
                            className="rounded border-slate-300 text-forest-800 focus:ring-forest-800"
                          />
                          <span>Aktif</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCancelEditPeriod}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs shadow-xs"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSavePeriod(period)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs"
                      >
                        <AiOutlineSave />
                        <span>Simpan</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartEditPeriod(period)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs transition-colors border border-slate-200 shadow-xs font-semibold"
                    >
                      <AiOutlineEdit />
                      <span>Ubah Diskon</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
