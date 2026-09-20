import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineWarning,
  AiOutlineReload,
  AiOutlineCreditCard,
  AiOutlineArrowRight,
  AiOutlinePieChart,
  AiOutlineFileText,
  AiOutlineArrowLeft,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';

export default function SubscriptionStatus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeTenant, activeTenantId, userTenants, isDemo, isTenantAdmin } = useTenant();
  const template = useTenantTemplate();

  const targetTenantId = searchParams.get('tenantId') || activeTenantId;
  const currentTenant = userTenants.find((t) => t.id === targetTenantId) || activeTenant;

  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState(null);
  const [blocksData, setBlocksData] = useState([]);
  const [paymentsHistory, setPaymentsHistory] = useState([]);
  const [usedUnitsCount, setUsedUnitsCount] = useState(0);

  const fetchSubscriptionDetails = async () => {
    setLoading(true);

    if (isDemo) {
      // Mock data untuk mode demo
      setSubData({
        status: currentTenant?.subscription?.status || 'active',
        trial_ends_at: currentTenant?.subscription?.trial_ends_at || null,
        current_period_start: '2026-01-01T00:00:00Z',
        current_period_end: '2026-12-31T23:59:59Z',
        period_duration: 12,
      });
      setBlocksData([
        { block_count: 2, block_size: 10, price_per_block: 12500 },
        { block_count: 1, block_size: 5, price_per_block: 8750 },
      ]);
      setUsedUnitsCount(18);
      setPaymentsHistory([
        {
          id: 'pay-demo-881',
          created_at: '2026-01-01T09:30:00Z',
          paid_at: '2026-01-01T09:32:10Z',
          amount: 324000,
          status: 'settled',
          payment_method: 'mayar_qris',
          payment_gateway_ref: 'MYR-DEMO-SUB-01',
          duration_months: 12,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      if (!currentTenant?.id) return;

      // 1. Ambil data subscription & blocks
      const { data: sub, error: sErr } = await supabase
        .from('tenant_subscriptions')
        .select(`
          id,
          status,
          trial_started_at,
          trial_ends_at,
          current_period_start,
          current_period_end,
          subscription_periods (
            duration_months,
            discount_percent
          ),
          tenant_subscription_blocks (
            block_count,
            block_pricing (
              block_size,
              price_per_block
            )
          )
        `)
        .eq('tenant_id', currentTenant.id)
        .single();

      if (sErr) throw sErr;

      setSubData({
        id: sub.id,
        status: sub.status,
        trial_ends_at: sub.trial_ends_at,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        period_duration: sub.subscription_periods?.duration_months || 12,
      });

      const parsedBlocks = (sub.tenant_subscription_blocks || []).map((b) => ({
        block_count: b.block_count,
        block_size: b.block_pricing?.block_size || 10,
        price_per_block: b.block_pricing?.price_per_block || 0,
      }));
      setBlocksData(parsedBlocks);

      // 2. Ambil total unit terpakai di tenant_units
      const { count: unitCount } = await supabase
        .from('tenant_units')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', currentTenant.id);

      setUsedUnitsCount(unitCount || 0);

      // 3. Ambil riwayat pembayaran
      const { data: payList } = await supabase
        .from('subscription_payments')
        .select(`
          id,
          created_at,
          paid_at,
          amount,
          status,
          payment_method,
          payment_gateway_ref,
          subscription_periods (
            duration_months
          )
        `)
        .eq('subscription_id', sub.id)
        .order('created_at', { ascending: false });

      const formattedPayments = (payList || []).map((p) => ({
        id: p.id,
        created_at: p.created_at,
        paid_at: p.paid_at,
        amount: Number(p.amount || 0),
        status: p.status,
        payment_method: p.payment_method,
        payment_gateway_ref: p.payment_gateway_ref,
        duration_months: p.subscription_periods?.duration_months || 12,
      }));

      setPaymentsHistory(formattedPayments);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SubscriptionStatus] Gagal memuat data langganan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionDetails();
  }, [currentTenant?.id]);

  // Hitung total kapasitas yang dibeli
  const totalPurchasedCapacity = blocksData.reduce(
    (acc, b) => acc + (b.block_count * b.block_size),
    0
  ) || 10; // Default minimal trial 10 unit

  const usagePercent = Math.min(100, Math.round((usedUnitsCount / totalPurchasedCapacity) * 100));

  const status = subData?.status || 'trial';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Tombol Navigasi Kembali */}
        <button
          type="button"
          onClick={() => navigate('/account/tenants')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <AiOutlineArrowLeft /> Kembali ke Daftar Layanan
        </button>

        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl p-2 bg-white rounded-xl border border-slate-200 shadow-xs text-slate-800">
                {template.icon}
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                  Status Langganan &amp; Kapasitas
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Layanan: <strong className="text-slate-900">{currentTenant?.name}</strong> &bull; Tipe: {template.name}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchSubscriptionDetails}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 shadow-xs transition-colors"
              title="Perbarui Data"
            >
              <AiOutlineReload className={loading ? 'animate-spin' : ''} />
            </button>

            {isTenantAdmin && (
              <button
                type="button"
                onClick={() => navigate(`/account/choose-plan?tenantId=${currentTenant?.id}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all"
              >
                <AiOutlineCreditCard className="text-sm font-bold" />
                <span>Perpanjang / Ubah Paket</span>
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* GRID KARTU STATUS & KAPASITAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Kartu Status Langganan */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status Langganan
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase ${badge.style}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-slate-900 font-display">
                    {sub?.status === 'trial' ? 'Masa Percobaan Aktif' : 'Paket Berlangganan Aktif'}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {sub?.status === 'trial'
                      ? 'Anda sedang menikmati fitur penuh platform dengan kuota trial gratis.'
                      : 'Komunitas Anda memiliki akses penuh ke fitur operasional RuangWarga.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Masa Aktif Berakhir:</span>
                  <strong className="text-slate-900 font-mono">
                    {sub?.trial_ends_at
                      ? new Date(sub.trial_ends_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : '-'}
                  </strong>
                </div>
              </div>

              {/* Kartu Kapasitas Unit Terpakai vs Dibeli */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <AiOutlinePieChart className="text-slate-700" />
                    <span>Kapasitas {template.unitLabel}</span>
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {usedUnitsCount} / {totalPurchasedCapacity} Terpakai
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className={`h-full transition-all duration-500 ${
                        usagePercent >= 90
                          ? 'bg-rose-500'
                          : usagePercent >= 75
                          ? 'bg-amber-500'
                          : 'bg-slate-900'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>{usagePercent}% Utilisasi</span>
                    <span>Sisa Kuota: {Math.max(0, totalPurchasedCapacity - usedUnitsCount)} {template.unitLabel}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Rincian Blok:</span>
                    <span className="text-slate-800 font-semibold">
                      {blocksData.length > 0
                        ? blocksData.map((b) => `${b.block_count}x Blok ${b.block_size}`).join(' + ')
                        : '1x Blok 10 (Trial Default)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/account/choose-plan?tenantId=${currentTenant?.id}`)}
                    className="text-slate-700 hover:text-slate-900 font-semibold underline text-xs"
                  >
                    Tambah Kuota
                  </button>
                </div>
              </div>
            </div>

            {/* TABEL RIWAYAT TRANSAKSI SUBSCRIPTION */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-display">Riwayat Pembayaran Langganan</h2>
                  <p className="text-xs text-slate-500">Daftar transaksi perpanjangan paket platform untuk layanan ini</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                {paymentsHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <AiOutlineFileText className="text-3xl mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-medium text-slate-600">Belum ada riwayat pembayaran langganan</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Layanan Anda saat ini masih aktif menggunakan paket masa percobaan (trial).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 uppercase tracking-wider font-bold text-[11px]">
                          <th className="py-3 px-4">No. Referensi / Tanggal</th>
                          <th className="py-3 px-4">Durasi Paket</th>
                          <th className="py-3 px-4">Metode Bayar</th>
                          <th className="py-3 px-4">Nominal</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paymentsHistory.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-slate-900 block">{p.payment_gateway_ref || p.id}</span>
                              <span className="text-[10px] text-slate-500">
                                {p.paid_at || p.created_at
                                   ? new Date(p.paid_at || p.created_at).toLocaleDateString('id-ID', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-700">{p.duration_months} Bulan</td>
                            <td className="py-3 px-4 uppercase font-mono text-[11px] text-slate-600">
                              {p.payment_method}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              Rp {p.amount.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  p.status === 'settled'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
