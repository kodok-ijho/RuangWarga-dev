import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineCheckCircle,
  AiOutlineSwap,
  AiOutlineArrowRight,
  AiOutlineSetting,
  AiOutlineTeam,
  AiOutlineTable,
  AiOutlineWallet,
  AiOutlineBarChart,
  AiOutlineUserAdd,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineInfoCircle,
  AiOutlineWarning,
  AiOutlineReload,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import TrialCountdownBanner from '../../components/TrialCountdownBanner';
import { formatRupiah, MONTHS_LONG } from '../../services/dataHelpers';
import { fetchTenantDashboardData } from '../../services/tenantOperationalService';

export default function TenantDashboard() {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const {
    activeTenant,
    activeTenantId,
    switchTenant,
    subscriptionStatus,
    userRole,
    isTenantAdmin,
    isOwner,
    activeRoleName,
    hasPermission,
  } = useTenant();

  const template = useTenantTemplate();
  const { isReadOnly } = useSubscriptionGate();

  const tenantId = routeTenantId || activeTenantId;

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (routeTenantId && routeTenantId !== activeTenantId) {
      switchTenant(routeTenantId);
    }
  }, [routeTenantId, activeTenantId, switchTenant]);

  const currentDate = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [dashData, setDashData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const selectedPeriod = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const loadDashboard = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const data = await fetchTenantDashboardData(tenantId, {
        role: userRole,
        period: selectedPeriod,
      });
      setDashData(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Gagal memuat dashboard operasional tenant:', err);
      setDashData({
        pendingRegistrationCount: 0,
        pendingPaymentCount: 0,
        units: { total: 0, occupied: 0, vacant: 0 },
        members: { total: 0 },
        finance: { totalIncome: 0, totalExpense: 0, netCashflow: 0 },
        billing: { totalBilled: 0, totalCollected: 0, totalOutstanding: 0, billCount: 0, collectionRate: 0 },
        recentPayments: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, userRole, selectedPeriod]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleCopyInviteLink = () => {
    const inviteCode = activeTenant?.settings?.invite_code;
    if (!inviteCode) return;
    const fullUrl = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(fullUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const pendingReg = dashData?.pendingRegistrationCount || 0;
  const pendingPay = dashData?.pendingPaymentCount || 0;
  const billing = dashData?.billing || {
    totalBilled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    billCount: 0,
    collectionRate: 0,
  };
  const finance = dashData?.finance || { totalIncome: 0, totalExpense: 0, netCashflow: 0 };
  const units = dashData?.units || { total: 0, occupied: 0, vacant: 0 };
  const members = dashData?.members || { total: 0 };

  const canManageRoles = isOwner || hasPermission('manage_tenant_users');
  const isStaff =
    isOwner ||
    isTenantAdmin ||
    ['admin', 'bendahara', 'pengurus'].includes(userRole) ||
    hasPermission('view_reports') ||
    hasPermission('manage_members') ||
    hasPermission('manage_billing_cash') ||
    hasPermission('manage_billing_transfer');

  return (
    <div className="min-h-screen bg-[#071f13] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="bg-forest-900/80 border border-forest-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-forest-800">
            <div className="flex items-center gap-4">
              <span className="text-4xl p-3 bg-forest-950 rounded-2xl border border-forest-700 shadow-inner">
                {template.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-forest-300 font-semibold">{template.name}</span>
                  <span className="text-forest-600">&bull;</span>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase font-bold tracking-wider ${
                      subscriptionStatus === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : subscriptionStatus === 'trial'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {subscriptionStatus === 'trial'
                      ? 'Trial 15 Hari'
                      : subscriptionStatus === 'active'
                      ? 'Berlangganan Aktif'
                      : 'Mode Baca Saja (Read-Only)'}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
                  {activeTenant?.name || 'Dashboard Operasional'}
                </h1>
                <p className="text-xs text-forest-300 mt-1">
                  Tenant ID: <span className="font-mono text-forest-400">{tenantId}</span> &bull; Peran Anda:{' '}
                  <strong className="text-gold-400 capitalize">{activeRoleName || userRole}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={loadDashboard}
                title="Refresh Data"
                className="p-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 hover:text-white border border-forest-700 transition-colors"
              >
                <AiOutlineReload className={`text-base ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              {canManageRoles && (
                <button
                  type="button"
                  onClick={() => navigate(`/t/${tenantId}/roles`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-semibold border border-purple-500/40 transition-colors"
                >
                  <AiOutlineTeam className="text-sm" />
                  <span>Kelola Role & Akses</span>
                </button>
              )}

              {isTenantAdmin && (
                <button
                  type="button"
                  onClick={() => navigate(`/t/${tenantId}/setup`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold-500/20 hover:bg-gold-500/30 text-gold-300 text-xs font-semibold border border-gold-500/40 transition-colors"
                >
                  <AiOutlineSetting className="text-sm" />
                  <span>Pengaturan Komplek</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate('/account/tenants')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 hover:text-white text-xs font-semibold border border-forest-700 transition-colors"
              >
                <AiOutlineSwap className="text-sm" />
                <span>Ganti Tenant</span>
              </button>
            </div>
          </div>

          {/* Konteks & Kamus Istilah Vertikal */}
          <div className="pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Satuan Unit</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{template.unitLabel}</span>
              </div>
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Jenis Iuran / Tagihan</span>
                <span className="text-sm font-bold text-gold-300 mt-0.5 block">{template.billLabel}</span>
              </div>
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Sebutan Anggota</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{template.memberLabel}</span>
              </div>
              <div className="p-3 bg-forest-950/70 rounded-xl border border-forest-800">
                <span className="text-[10px] text-forest-400 block font-medium">Tindakan Bayar</span>
                <span className="text-sm font-bold text-emerald-300 mt-0.5 block">{template.paymentActionLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trial Countdown Banner */}
        <TrialCountdownBanner tenantId={tenantId} />

        {/* Read-Only Warning Banner */}
        {isReadOnly && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-200 flex items-start gap-3 text-xs shadow-lg">
            <AiOutlineWarning className="text-xl text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-bold text-rose-300 text-sm mb-0.5">
                Masa Langganan Telah Berakhir &mdash; Mode Baca Saja Aktif
              </strong>
              <span>
                Tenant Anda saat ini berada dalam mode Read-Only. Anda tetap dapat meninjau data historis, namun aksi
                pencatatan transaksi kas baru, approval warga, dan verifikasi bayar dinonaktifkan sementara.
              </span>
            </div>
            <Link
              to="/account/subscriptions"
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shrink-0 self-center"
            >
              Perpanjang Sekarang
            </Link>
          </div>
        )}

        {/* Setup Wizard Warning Banner jika belum selesai */}
        {isTenantAdmin && !activeTenant?.settings?.onboarding_completed && (
          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <h4 className="text-sm font-bold text-amber-300">Pengaturan Awal Komplek Belum Selesai</h4>
                <p className="text-xs text-forest-300 mt-0.5">
                  Lengkapi daftar {template.unitLabel.toLowerCase()} dan rincian komponen tarif {template.billLabel} untuk mulai mengelola tagihan warga secara terstruktur.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/setup`)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-colors shrink-0"
            >
              <span>Mulai Setup Wizard</span>
              <AiOutlineArrowRight />
            </button>
          </div>
        )}

        {/* Pending Actions Notification Banners */}
        {isStaff && (pendingReg > 0 || pendingPay > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {pendingReg > 0 && (
              <Link
                to={`/t/${tenantId}/approval`}
                className="flex items-center justify-between rounded-2xl bg-amber-500/15 border border-amber-500/40 p-4 hover:bg-amber-500/25 transition-all shadow-md group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                    <AiOutlineUserAdd />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-300">Pendaftaran {template.memberLabel} Baru</h4>
                    <p className="text-xs text-forest-300">Ada {pendingReg} permohonan menunggu persetujuan.</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-amber-500 text-forest-950 px-3 py-1.5 rounded-xl group-hover:bg-amber-400 transition-colors shadow-sm">
                  Proses →
                </span>
              </Link>
            )}
            {pendingPay > 0 && (
              <Link
                to={`/t/${tenantId}/payment-verification`}
                className="flex items-center justify-between rounded-2xl bg-emerald-500/15 border border-emerald-500/40 p-4 hover:bg-emerald-500/25 transition-all shadow-md group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl shrink-0">
                    <AiOutlineCheckCircle />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-300">Verifikasi Pembayaran {template.billLabel}</h4>
                    <p className="text-xs text-forest-300">Ada {pendingPay} bukti transfer menunggu verifikasi.</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-emerald-500 text-forest-950 px-3 py-1.5 rounded-xl group-hover:bg-emerald-400 transition-colors shadow-sm">
                  Verifikasi →
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Invite Code & Link Card */}
        {activeTenant?.settings?.invite_code && (
          <div className="p-4 rounded-2xl bg-forest-950/90 border border-forest-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔗</span>
              <div>
                <span className="text-forest-400">Kode Undangan {template.memberLabel}: </span>
                <strong className="font-mono text-gold-300 text-base tracking-wider ml-1">
                  {activeTenant.settings.invite_code}
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-700 text-forest-200 hover:text-white border border-forest-700 transition-colors font-medium"
              >
                {copySuccess ? <AiOutlineCheck className="text-emerald-400" /> : <AiOutlineCopy />}
                <span>{copySuccess ? 'Tautan Tersalin!' : 'Salin Tautan'}</span>
              </button>
              <Link
                to={`/join/${activeTenant.settings.invite_code}`}
                target="_blank"
                className="text-gold-400 hover:text-gold-300 inline-flex items-center gap-1 font-bold px-3 py-1.5 rounded-lg bg-gold-500/10 border border-gold-500/30"
              >
                <span>Buka Formulir Pendaftaran</span>
                <AiOutlineArrowRight className="text-xs" />
              </Link>
            </div>
          </div>
        )}

        {/* Filter Periode & Ringkasan Keuangan */}
        <div className="bg-forest-900/60 border border-forest-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-forest-800">
            <div>
              <h2 className="text-lg font-bold text-white font-display">
                Ringkasan Tagihan {template.billLabel} &amp; Keuangan Kas
              </h2>
              <p className="text-xs text-forest-300 mt-0.5">
                Statistik penerimaan dan arus kas operasional {template.name.toLowerCase()} bulan {MONTHS_LONG[selectedMonth - 1]} {selectedYear}.
              </p>
            </div>

            {/* Periode Selector */}
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-forest-950 border border-forest-700 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-gold-500"
              >
                {MONTHS_LONG.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-forest-950 border border-forest-700 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-gold-500"
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metric Cards */}
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 h-8 w-8 rounded-full border-4 border-forest-800 border-t-gold-500 animate-spin" />
              <p className="text-xs text-forest-400">Memuat metrik operasional...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Row 1: IPL Billing Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 shadow-sm">
                  <span className="text-[11px] text-forest-400 block font-medium">Total Tagihan {template.billLabel}</span>
                  <span className="text-lg sm:text-xl font-bold text-white mt-1 block">
                    {formatRupiah(billing.totalBilled)}
                  </span>
                  <span className="text-[10px] text-forest-400 mt-1 block">
                    {billing.billCount} {template.unitLabel.toLowerCase()} ditagih
                  </span>
                </div>

                <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 shadow-sm">
                  <span className="text-[11px] text-emerald-400 block font-medium">Terkumpul</span>
                  <span className="text-lg sm:text-xl font-bold text-emerald-300 mt-1 block">
                    {formatRupiah(billing.totalCollected)}
                  </span>
                  <span className="text-[10px] text-emerald-400/80 mt-1 block">
                    {billing.totalBilled > 0
                      ? `${((billing.totalCollected / billing.totalBilled) * 100).toFixed(0)}% terbayar`
                      : '0% terbayar'}
                  </span>
                </div>

                <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 shadow-sm">
                  <span className="text-[11px] text-amber-400 block font-medium">Tunggakan</span>
                  <span className="text-lg sm:text-xl font-bold text-amber-300 mt-1 block">
                    {formatRupiah(billing.totalOutstanding)}
                  </span>
                  <span className="text-[10px] text-amber-400/80 mt-1 block">
                    {billing.totalOutstanding > 0 ? 'Perlu tindak lanjut' : 'Nihil tunggakan'}
                  </span>
                </div>

                <div className="p-4 bg-forest-950/80 rounded-2xl border border-forest-800 shadow-sm">
                  <span className="text-[11px] text-gold-400 block font-medium">Kolektibilitas</span>
                  <span className="text-lg sm:text-xl font-bold text-gold-300 mt-1 block">
                    {billing.collectionRate.toFixed(0)}%
                  </span>
                  <div className="w-full bg-forest-800 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-gold-500 to-emerald-400 h-1.5 rounded-full"
                      style={{ width: `${Math.min(billing.collectionRate, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Cashflow & Occupancy Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-forest-950/60 rounded-2xl border border-forest-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-forest-400 block font-medium">Arus Kas Bersih (Net)</span>
                    <span
                      className={`text-base sm:text-lg font-bold mt-1 block ${
                        finance.netCashflow >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatRupiah(finance.netCashflow)}
                    </span>
                    <span className="text-[10px] text-forest-400 mt-0.5 block">
                      Masuk: {formatRupiah(finance.totalIncome)} &bull; Keluar: {formatRupiah(finance.totalExpense)}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-forest-900 border border-forest-700 flex items-center justify-center text-forest-300 text-lg">
                    <AiOutlineWallet />
                  </div>
                </div>

                <div className="p-4 bg-forest-950/60 rounded-2xl border border-forest-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-forest-400 block font-medium">
                      Okupansi {template.unitLabel}
                    </span>
                    <span className="text-base sm:text-lg font-bold text-white mt-1 block">
                      {units.occupied} <span className="text-xs text-forest-400 font-normal">/ {units.total} unit</span>
                    </span>
                    <span className="text-[10px] text-forest-400 mt-0.5 block">
                      {units.vacant} unit kosong / belum terisi
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-forest-900 border border-forest-700 flex items-center justify-center text-forest-300 text-lg">
                    <AiOutlineHome />
                  </div>
                </div>

                <div className="p-4 bg-forest-950/60 rounded-2xl border border-forest-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-forest-400 block font-medium">
                      Total {template.memberLabel} Terdaftar
                    </span>
                    <span className="text-base sm:text-lg font-bold text-white mt-1 block">
                      {members.total} <span className="text-xs text-forest-400 font-normal">orang</span>
                    </span>
                    <span className="text-[10px] text-forest-400 mt-0.5 block">
                      {pendingReg} menunggu verifikasi
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-forest-900 border border-forest-700 flex items-center justify-center text-forest-300 text-lg">
                    <AiOutlineTeam />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feature Navigation Grid (Feature Parity RT/RW Portal) */}
        <div>
          <h3 className="text-sm font-bold text-forest-400 uppercase tracking-wider mb-4">
            Menu Operasional {template.name}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Matriks Tagihan */}
            <Link
              to={`/t/${tenantId}/payment-matrix`}
              className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-gold-500/50 transition-all shadow-md group flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-forest-800 text-gold-300 group-hover:bg-gold-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                  <AiOutlineTable />
                </div>
                <AiOutlineArrowRight className="text-forest-500 group-hover:text-gold-300 transition-colors" />
              </div>
              <div className="mt-4">
                <h4 className="text-base font-bold text-white group-hover:text-gold-300 transition-colors">
                  Matriks Tagihan {template.billLabel}
                </h4>
                <p className="text-xs text-forest-300 mt-1">
                  Pantau dan kelola matriks pembayaran {template.billLabel.toLowerCase()} seluruh {template.unitLabel.toLowerCase()} per bulan.
                </p>
              </div>
            </Link>

            {/* Verifikasi Bayar */}
            {isStaff && (
              <Link
                to={`/t/${tenantId}/payment-verification`}
                className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-emerald-500/50 transition-all shadow-md group flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-forest-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                    <AiOutlineCheckCircle />
                  </div>
                  {pendingPay > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                      {pendingPay} Pending
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                    Verifikasi Pembayaran
                  </h4>
                  <p className="text-xs text-forest-300 mt-1">
                    Pemeriksaan dan persetujuan bukti transfer iuran dari {template.memberLabel.toLowerCase()}.
                  </p>
                </div>
              </Link>
            )}

            {/* Persetujuan Warga */}
            {isTenantAdmin && (
              <Link
                to={`/t/${tenantId}/approval`}
                className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-amber-500/50 transition-all shadow-md group flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-forest-800 text-amber-400 group-hover:bg-amber-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                    <AiOutlineUserAdd />
                  </div>
                  {pendingReg > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                      {pendingReg} Antre
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                    Persetujuan {template.memberLabel}
                  </h4>
                  <p className="text-xs text-forest-300 mt-1">
                    Validasi pendaftaran mandiri dan penetapan nomor unit bagi pemohon baru.
                  </p>
                </div>
              </Link>
            )}

            {/* Catatan Pengeluaran */}
            {isStaff && (
              <Link
                to={`/t/${tenantId}/expenses`}
                className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-forest-600 transition-all shadow-md group flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-forest-800 text-forest-300 group-hover:bg-forest-700 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                    <AiOutlineWallet />
                  </div>
                  <AiOutlineArrowRight className="text-forest-500 group-hover:text-forest-200 transition-colors" />
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-white group-hover:text-forest-200 transition-colors">
                    Pengeluaran Kas
                  </h4>
                  <p className="text-xs text-forest-300 mt-1">
                    Catat biaya kebersihan, keamanan, perbaikan fasilitas, dan operasional komplek.
                  </p>
                </div>
              </Link>
            )}

            {/* Laporan Keuangan */}
            {isStaff && (
              <Link
                to={`/t/${tenantId}/reports`}
                className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-forest-600 transition-all shadow-md group flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-forest-800 text-forest-300 group-hover:bg-forest-700 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                    <AiOutlineBarChart />
                  </div>
                  <AiOutlineArrowRight className="text-forest-500 group-hover:text-forest-200 transition-colors" />
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-white group-hover:text-forest-200 transition-colors">
                    Laporan Keuangan
                  </h4>
                  <p className="text-xs text-forest-300 mt-1">
                    Laporan kas bulanan, breakdown pengeluaran, saldo berjalan, dan export rekapitulasi.
                  </p>
                </div>
              </Link>
            )}

            {/* Setup Wizard */}
            {isTenantAdmin && (
              <Link
                to={`/t/${tenantId}/setup`}
                className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-gold-500/50 transition-all shadow-md group flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-forest-800 text-gold-400 group-hover:bg-gold-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                    <AiOutlineSetting />
                  </div>
                  <AiOutlineArrowRight className="text-forest-500 group-hover:text-gold-300 transition-colors" />
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-white group-hover:text-gold-300 transition-colors">
                    Setup &amp; Tarif {template.billLabel}
                  </h4>
                  <p className="text-xs text-forest-300 mt-1">
                    Sesuaikan rincian unit, komponen biaya iuran, dan denda keterlambatan.
                  </p>
                </div>
              </Link>
            )}

            {/* Putaran Arisan (Khusus Arisan) */}
            {template.features.hasArisanDraw && (
              <>
                <Link
                  to={`/t/${tenantId}/arisan/rounds`}
                  className="p-5 rounded-2xl bg-purple-950/30 hover:bg-purple-950/50 border border-purple-500/40 hover:border-purple-400 transition-all shadow-md group flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-900/60 text-purple-300 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                      📋
                    </div>
                    <AiOutlineArrowRight className="text-purple-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">
                      Kelola Putaran Arisan
                    </h4>
                    <p className="text-xs text-forest-300 mt-1">
                      Kelola putaran pengundian, tagihan iuran peserta, dan kesiapan putaran.
                    </p>
                  </div>
                </Link>

                <Link
                  to={`/t/${tenantId}/arisan/draw`}
                  className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/40 to-amber-950/30 hover:from-purple-900/50 hover:to-amber-900/40 border border-amber-500/40 hover:border-amber-400 transition-all shadow-md group flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                      🎲
                    </div>
                    <AiOutlineArrowRight className="text-amber-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                      Ruang Pengocokan &amp; Undian
                    </h4>
                    <p className="text-xs text-forest-300 mt-1">
                      Kocok pemenang putaran, pantau kandidat berhak undi, dan riwayat pemenang.
                    </p>
                  </div>
                </Link>
              </>
            )}

            {/* Modul Pasang & Kelola Iklan Publik (Kos & RT/RW) - T10.4 & T10.5 */}
            {(activeTenant?.type === 'kos' || activeTenant?.type === 'rt_rw') && (
              <>
                <Link
                  to={`/t/${tenantId}/listings/post`}
                  className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/30 to-forest-900/60 hover:from-amber-950/50 hover:to-forest-900/90 border border-gold-500/40 hover:border-gold-400 transition-all shadow-md group flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-gold-500/20 text-gold-400 group-hover:bg-gold-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                      <HiOutlineSparkles />
                    </div>
                    <AiOutlineArrowRight className="text-gold-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-white group-hover:text-gold-300 transition-colors">
                      {activeTenant?.type === 'kos' ? 'Iklankan Kamar Kos' : 'Pasang Iklan UMKM'}
                    </h4>
                    <p className="text-xs text-forest-300 mt-1">
                      {activeTenant?.type === 'kos'
                        ? 'Iklankan kamar kosong ke direktori publik RuangWarga agar cepat tersewa.'
                        : 'Promosikan produk kuliner dan jasa warga ke publik di luar komplek RT.'}
                    </p>
                  </div>
                </Link>

                <Link
                  to={`/t/${tenantId}/listings`}
                  className="p-5 rounded-2xl bg-forest-900/60 hover:bg-forest-900/90 border border-forest-800 hover:border-forest-600 transition-all shadow-md group flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-forest-800 text-forest-300 group-hover:bg-forest-700 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                      📑
                    </div>
                    <AiOutlineArrowRight className="text-forest-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-white group-hover:text-forest-200 transition-colors">
                      Kelola Iklan Saya
                    </h4>
                    <p className="text-xs text-forest-300 mt-1">
                      Pantau masa aktif iklan, tandai kamar tersewa/terjual, dan perpanjang masa tayang.
                    </p>
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Milestone Confirmation Footer Card */}
        <div className="p-6 rounded-2xl bg-forest-950/80 border border-gold-500/40 shadow-xl flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold-500/20 text-gold-400 flex items-center justify-center shrink-0 border border-gold-500/40 text-xl">
            <AiOutlineCheckCircle />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white font-display">
              Template Vertikal RT/RW Beroperasi Penuh di Atas SaaS Multi-Tenant!
            </h3>
            <p className="text-xs text-forest-300 mt-1 leading-relaxed">
              Mulai dari pendaftaran tenant, setup wizard komponen IPL, pendaftaran warga melalui kode invite,
              approval pendaftaran, matriks tagihan bulanan generik, verifikasi transfer, hingga laporan keuangan
              telah terintegrasi secara modular dengan isolasi keamanan RLS dan pembatasan subscription gate.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-forest-800/80">
              <Link
                to={`/t/${tenantId}/payment-matrix`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-xs font-bold text-forest-950 transition-colors shadow-sm"
              >
                <AiOutlineTable />
                <span>Buka Matriks Pembayaran</span>
              </Link>
              <Link
                to="/account/tenants"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-xs font-semibold text-white transition-colors"
              >
                <span>Kelola Tenant Saya</span>
                <AiOutlineArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
