import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AiOutlineCheck,
  AiOutlineArrowLeft,
  AiOutlineThunderbolt,
  AiOutlineCalculator,
  AiOutlineSafetyCertificate,
  AiOutlinePlus,
  AiOutlineMinus,
  AiOutlineArrowRight,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';
import {
  calculateOptimalBlocks,
  calculateSubscriptionBill,
  DEFAULT_PERIOD_DISCOUNTS,
} from '../../utils/billingCalculator';

export default function ChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { activeTenant, activeTenantId, userTenants, isDemo } = useTenant();
  const template = useTenantTemplate();

  // Ambil tenant yang ditargetkan (bisa dari query param atau activeTenant)
  const targetTenantId = searchParams.get('tenantId') || activeTenantId;
  const currentTenant = userTenants.find((t) => t.id === targetTenantId) || activeTenant;
  const tenantType = currentTenant?.type || 'rt_rw';

  // State input estimasi kapasitas
  const [estimatedUnits, setEstimatedUnits] = useState(15);
  const [isManualOverride, setIsManualOverride] = useState(false);

  // State manual override
  const [customBlocks10, setCustomBlocks10] = useState(1);
  const [customBlocks5, setCustomBlocks5] = useState(1);

  // State durasi langganan (default 12 bulan sesuai rekomendasi hemat 20%)
  const [selectedDuration, setSelectedDuration] = useState(12);

  // Hitung rekomendasi optimal secara otomatis saat estimatedUnits berubah
  const optimalResult = useMemo(() => {
    return calculateOptimalBlocks(estimatedUnits, tenantType);
  }, [estimatedUnits, tenantType]);

  // Sinkronkan rekomendasi ke manual override saat tidak manual
  useEffect(() => {
    if (!isManualOverride && optimalResult?.recommended) {
      setCustomBlocks10(optimalResult.recommended.blocks10);
      setCustomBlocks5(optimalResult.recommended.blocks5);
    }
  }, [optimalResult, isManualOverride]);

  // Hitung tagihan final berdasarkan kombinasi aktif dan durasi
  const activeBlocks10 = isManualOverride ? customBlocks10 : optimalResult.recommended.blocks10;
  const activeBlocks5 = isManualOverride ? customBlocks5 : optimalResult.recommended.blocks5;

  const billSummary = useMemo(() => {
    return calculateSubscriptionBill(activeBlocks10, activeBlocks5, selectedDuration, tenantType);
  }, [activeBlocks10, activeBlocks5, selectedDuration, tenantType]);

  const handleProceedToPayment = () => {
    if (billSummary.totalCapacity < 5) {
      toast.error('Pilih minimal 1 blok kapasitas (minimal 5 unit).');
      return;
    }

    // Arahkan ke halaman konfirmasi pembayaran / QRIS checkout
    navigate(`/account/subscription/checkout`, {
      state: {
        tenantId: currentTenant?.id,
        tenantName: currentTenant?.name,
        tenantType,
        blocks10: activeBlocks10,
        blocks5: activeBlocks5,
        totalCapacity: billSummary.totalCapacity,
        durationMonths: selectedDuration,
        finalTotal: billSummary.finalTotal,
        billSummary,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Tombol Kembali */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <AiOutlineArrowLeft /> Kembali
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold mb-2">
              <AiOutlineThunderbolt />
              <span>Paket Langganan Platform RuangWarga</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tracking-tight">
              Pilih Kapasitas &amp; Masa Aktif Layanan
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Untuk layanan: <strong className="text-slate-900">{currentTenant?.name || 'Komunitas Anda'}</strong> &bull;{' '}
              Tipe: <span className="text-slate-900 font-semibold">{template.name}</span>
            </p>
          </div>
        </div>

        {/* SECTION 1: Kalkulator Estimasi Kebutuhan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-lg">
                <AiOutlineCalculator />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900 font-display">
                  1. Masukkan Perkiraan Jumlah {template.unitLabel}
                </h2>
                <p className="text-xs text-slate-500">
                  Sistem akan otomatis merekomendasikan kombinasi blok harga paling hemat untuk Anda.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsManualOverride(!isManualOverride)}
              className="text-xs text-slate-700 hover:text-slate-900 font-semibold underline underline-offset-4"
            >
              {isManualOverride ? 'Gunakan Rekomendasi Otomatis' : 'Kustomisasi Manual'}
            </button>
          </div>

          {!isManualOverride ? (
            /* Mode Otomatis dengan Slider / Input */
            <div className="p-5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="estimated-units-slider" className="text-xs text-slate-700 font-semibold">
                  Perkiraan Kebutuhan Kapasitas:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="estimated-units-slider"
                    type="number"
                    value={estimatedUnits}
                    onChange={(e) => setEstimatedUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 px-3 py-1.5 bg-white border border-slate-300 focus:border-slate-900 rounded-lg text-sm text-center font-bold text-slate-900 focus:outline-none shadow-xs"
                    min="1"
                    max="500"
                  />
                  <span className="text-xs text-slate-500 font-semibold">{template.unitLabel}</span>
                </div>
              </div>

              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={estimatedUnits}
                onChange={(e) => setEstimatedUnits(parseInt(e.target.value, 10))}
                className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg cursor-pointer"
              />

              {/* Rekomendasi Banner */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 uppercase">
                    <AiOutlineCheck /> Rekomendasi Terbaik (Biaya Terendah)
                  </div>
                  <h3 className="text-base font-bold text-slate-900 font-display">
                    {optimalResult.recommended.blocks10 > 0 && `${optimalResult.recommended.blocks10} Blok Besar (10)`}
                    {optimalResult.recommended.blocks10 > 0 && optimalResult.recommended.blocks5 > 0 && ' + '}
                    {optimalResult.recommended.blocks5 > 0 && `${optimalResult.recommended.blocks5} Blok Kecil (5)`}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Kapasitas Terpenuhi: <strong className="text-slate-900">{optimalResult.recommended.totalCapacity} {template.unitLabel}</strong>{' '}
                    (Sisa slot cadangan: {optimalResult.recommended.excessCapacity} {template.unitLabel})
                  </p>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-emerald-200/60">
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold">
                    Base Price Bulanan
                  </span>
                  <span className="text-lg font-bold text-slate-900 font-mono">
                    Rp {optimalResult.recommended.monthlyBasePrice.toLocaleString('id-ID')}
                    <span className="text-xs font-normal text-slate-500">/bln</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Mode Manual Override */
            <div className="p-5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
                <AiOutlineInfoCircle className="text-base shrink-0 mt-0.5 text-amber-600" />
                <p>
                  Anda berada dalam mode manual. Sesuaikan jumlah blok kapasitas sesuai kebutuhan spesifik Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Counter Blok 10 */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Blok Besar (10 {template.unitLabel})</span>
                    <span className="text-[10px] text-slate-500">Kapasitas 10 unit per blok</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomBlocks10(Math.max(0, customBlocks10 - 1))}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                    >
                      <AiOutlineMinus />
                    </button>
                    <span className="w-8 text-center font-bold font-mono text-sm text-slate-900">
                      {customBlocks10}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomBlocks10(customBlocks10 + 1)}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                    >
                      <AiOutlinePlus />
                    </button>
                  </div>
                </div>

                {/* Counter Blok 5 */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Blok Kecil (5 {template.unitLabel})</span>
                    <span className="text-[10px] text-slate-500">Kapasitas 5 unit per blok</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomBlocks5(Math.max(0, customBlocks5 - 1))}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                    >
                      <AiOutlineMinus />
                    </button>
                    <span className="w-8 text-center font-bold font-mono text-sm text-slate-900">
                      {customBlocks5}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomBlocks5(customBlocks5 + 1)}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                    >
                      <AiOutlinePlus />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Pilihan Durasi & Diskon Periode */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-lg">
              ⏳
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                2. Pilih Durasi Periode Langganan
              </h2>
              <p className="text-xs text-slate-500">
                Pilih komitmen periode untuk mendapatkan potongan harga spesial.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                months: 12,
                label: '1 Tahun (12 Bulan)',
                badge: 'Hemat 20%',
                badgeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                desc: 'Paling hemat & direkomendasikan untuk komunitas',
              },
              {
                months: 6,
                label: '6 Bulan',
                badge: 'Hemat 10%',
                badgeStyle: 'bg-amber-100 text-amber-800 border-amber-200',
                desc: 'Pilihan fleksibel setengah tahunan',
              },
              {
                months: 3,
                label: '3 Bulan',
                badge: 'Reguler',
                badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
                desc: 'Paket dasar komitmen 3 bulanan',
              },
            ].map((plan) => {
              const isSelected = selectedDuration === plan.months;

              return (
                <button
                  key={plan.months}
                  type="button"
                  onClick={() => setSelectedDuration(plan.months)}
                  className={`rounded-2xl p-5 border-2 text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-50 border-slate-900 ring-2 ring-slate-900/10 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900 font-display">{plan.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${plan.badgeStyle}`}>
                        {plan.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">{plan.desc}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Diskon:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {DEFAULT_PERIOD_DISCOUNTS[plan.months]}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 3: Ringkasan Tagihan & Aksi Checkout */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-md space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
              <AiOutlineSafetyCertificate className="text-slate-700" />
              <span>Rincian Tagihan Langganan</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono">Periode: {selectedDuration} Bulan</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3">
              <div className="flex justify-between text-slate-600">
                <span>Kapasitas Unit Didapat:</span>
                <strong className="text-slate-900">{billSummary.totalCapacity} {template.unitLabel}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Rincian Blok:</span>
                <span className="text-slate-800 font-medium">
                  {billSummary.blocks10} Blok 10 + {billSummary.blocks5} Blok 5
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tarif Dasar Bulanan:</span>
                <span className="font-mono text-slate-900">Rp {billSummary.monthlyBasePrice.toLocaleString('id-ID')} / bln</span>
              </div>
            </div>

            <div className="space-y-3 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-6">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({selectedDuration} Bulan):</span>
                <span className="font-mono text-slate-900">Rp {billSummary.rawTotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Potongan Diskon ({billSummary.discountPercent}%):</span>
                <span className="font-mono font-semibold">- Rp {billSummary.discountAmount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-900 text-sm">Total Pembayaran:</span>
                <span className="text-2xl font-extrabold text-slate-900 font-mono">
                  Rp {billSummary.finalTotal.toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-[11px] text-right text-slate-500">
                (Setara <strong className="text-emerald-700 font-mono font-bold">Rp {billSummary.effectiveMonthlyPrice.toLocaleString('id-ID')}/bln</strong> nett)
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 text-center sm:text-left">
              Pembayaran instan diproses via <strong className="text-slate-900">Mayar QRIS</strong> dengan verifikasi otomatis.
            </p>

            <button
              type="button"
              onClick={handleProceedToPayment}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs transition-all"
            >
              <span>Lanjut ke Pembayaran QRIS</span>
              <AiOutlineArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
