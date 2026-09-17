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
import AnimatedCounter from '../../components/AnimatedCounter';

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
    <div className="min-h-screen bg-[#f8faf9] text-slate-900 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="pv-card p-6 sm:p-8 shadow-card border border-slate-200/90">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <span className="text-4xl p-3 bg-forest-50 text-forest-800 rounded-2xl border border-forest-100 shadow-xs">
                {template.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-slate-500 font-semibold">{template.name}</span>
                  <span className="text-slate-300">&bull;</span>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase font-bold tracking-wider ${
                      subscriptionStatus === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : subscriptionStatus === 'trial'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {subscriptionStatus === 'trial'
                      ? 'Trial 15 Hari'
                      : subscriptionStatus === 'active'
                      ? 'Berlangganan Aktif'
                      : 'Mode Baca Saja (Read-Only)'}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-forest-950 font-display">
                  {activeTenant?.name || 'Dashboard Operasional'}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Tenant ID: <span className="font-mono text-slate-600">{tenantId}</span> &bull; Peran Anda:{' '}
                  <strong className="text-forest-900 capitalize font-bold">{activeRoleName || userRole}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={loadDashboard}
                title="Refresh Data"
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
              >
                <AiOutlineReload className={`text-base ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              {canManageRoles && (
                <button
                  type="button"
                  onClick={() => navigate(`/t/${tenantId}/roles`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 transition-colors"
                >
                  <AiOutlineTeam className="text-sm" />
                  <span>Kelola Role & Akses</span>
                </button>
              )}

              {isTenantAdmin && (
                <button
                  type="button"
                  onClick={() => navigate(`/t/${tenantId}/setup`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 transition-colors"
                >
                  <AiOutlineSetting className="text-sm" />
                  <span>Pengaturan Komplek</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate('/account/tenants')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <AiOutlineSwap className="text-sm" />
                <span>Ganti Tenant</span>
              </button>
            </div>
          </div>

          {/* Konteks & Kamus Istilah Vertikal */}
          <div className="pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block font-medium">Satuan Unit</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">{template.unitLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block font-medium">Jenis Iuran / Tagihan</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">{template.billLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block font-medium">Sebutan Anggota</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">{template.memberLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block font-medium">Tindakan Bayar</span>
                <span className="text-sm font-bold text-emerald-700 mt-0.5 block">{template.paymentActionLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trial Countdown Banner */}
        <TrialCountdownBanner tenantId={tenantId} />

        {/* Read-Only Warning Banner */}
        {isReadOnly && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-xs shadow-xs">
            <AiOutlineWarning className="text-xl text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-bold text-rose-900 text-sm mb-0.5">
                Masa Langganan Telah Berakhir &mdash; Mode Baca Saja Aktif
              </strong>
              <span>
                Tenant Anda saat ini berada dalam mode Read-Only. Anda tetap dapat meninjau data historis, namun aksi
                pencatatan transaksi kas baru, approval warga, dan verifikasi bayar dinonaktifkan sementara.
              </span>
            </div>
            <Link
              to="/account/subscriptions"
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 self-center shadow-xs"
            >
              Perpanjang Sekarang
            </Link>
          </div>
        )}

        {/* Setup Wizard Warning Banner jika belum selesai */}
        {isTenantAdmin && !activeTenant?.settings?.onboarding_completed && (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <h4 className="text-sm font-bold text-amber-900">Pengaturan Awal Komplek Belum Selesai</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Lengkapi daftar {template.unitLabel.toLowerCase()} dan rincian komponen tarif {template.billLabel} untuk mulai mengelola tagihan warga secara terstruktur.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/setup`)}
              className="pv-btn-primary text-xs px-4 py-2"
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
                className="flex items-center justify-between rounded-2xl bg-amber-50 border border-amber-200 p-4 hover:bg-amber-100/70 transition-all shadow-xs group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl shrink-0">
                    <AiOutlineUserAdd />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">Pendaftaran {template.memberLabel} Baru</h4>
                    <p className="text-xs text-amber-700">Ada {pendingReg} permohonan menunggu persetujuan.</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-amber-500 text-forest-950 px-3 py-1.5 rounded-xl group-hover:bg-amber-400 transition-colors shadow-xs">
                  Proses →
                </span>
              </Link>
            )}
            {pendingPay > 0 && (
              <Link
                to={`/t/${tenantId}/payment-verification`}
                className="flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 p-4 hover:bg-emerald-100/70 transition-all shadow-xs group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl shrink-0">
                    <AiOutlineCheckCircle />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">Verifikasi Pembayaran {template.billLabel}</h4>
                    <p className="text-xs text-emerald-700">Ada {pendingPay} bukti transfer menunggu verifikasi.</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-xl group-hover:bg-emerald-500 transition-colors shadow-xs">
                  Verifikasi →
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Invite Code & Link Card */}
        {activeTenant?.settings?.invite_code && (
          <div className="p-4 rounded-2xl pv-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-card">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔗</span>
              <div>
                <span className="text-slate-500">Kode Undangan {template.memberLabel}: </span>
                <strong className="font-mono text-forest-900 text-base tracking-wider ml-1">
                  {activeTenant.settings.invite_code}
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors font-medium"
              >
                {copySuccess ? <AiOutlineCheck className="text-emerald-600" /> : <AiOutlineCopy />}
                <span>{copySuccess ? 'Tautan Tersalin!' : 'Salin Tautan'}</span>
              </button>
              <Link
                to={`/join/${activeTenant.settings.invite_code}`}
                target="_blank"
                className="text-forest-800 hover:text-forest-950 inline-flex items-center gap-1 font-bold px-3 py-1.5 rounded-lg bg-forest-50 border border-forest-200"
              >
                <span>Buka Formulir Pendaftaran</span>
                <AiOutlineArrowRight className="text-xs" />
              </Link>
            </div>
          </div>
        )}

        {/* Filter Periode & Ringkasan Keuangan */}
        <div className="pv-card p-6 sm:p-8 shadow-card border border-slate-200/90 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 font-display">
                Ringkasan Tagihan {template.billLabel} &amp; Keuangan Kas
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Statistik penerimaan dan arus kas operasional {template.name.toLowerCase()} bulan {MONTHS_LONG[selectedMonth - 1]} {selectedYear}.
              </p>
            </div>

            {/* Periode Selector */}
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-forest-600 shadow-xs"
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
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-forest-600 shadow-xs"
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
              <div className="mx-auto mb-3 h-8 w-8 rounded-full border-4 border-forest-200 border-t-gold-500 animate-spin" />
              <p className="text-xs text-slate-500">Memuat metrik operasional...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Row 1: IPL Billing Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 sm:p-5 bg-slate-50/70 rounded-2xl border border-slate-200/80 shadow-xs hover:bg-white hover:shadow-sm transition-all">
                  <span className="text-xs text-slate-500 block font-medium">Total Tagihan {template.billLabel}</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1.5 block tracking-tight font-display">
                    <AnimatedCounter value={billing.totalBilled} formatter={formatRupiah} />
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {billing.billCount} {template.unitLabel.toLowerCase()} ditagih
                  </span>
                </div>

                <div className="p-4 sm:p-5 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 shadow-xs hover:bg-emerald-50 hover:shadow-sm transition-all">
                  <span className="text-xs text-emerald-800 block font-medium">Terkumpul</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-emerald-700 mt-1.5 block tracking-tight font-display">
                    <AnimatedCounter value={billing.totalCollected} formatter={formatRupiah} />
                  </span>
                  <span className="text-[11px] text-emerald-700/90 mt-1 block font-medium">
                    {billing.totalBilled > 0
                      ? `${((billing.totalCollected / billing.totalBilled) * 100).toFixed(0)}% terbayar`
                      : '0% terbayar'}
                  </span>
                </div>

                <div className="p-4 sm:p-5 bg-amber-50/50 rounded-2xl border border-amber-200/80 shadow-xs hover:bg-amber-50 hover:shadow-sm transition-all">
                  <span className="text-xs text-amber-800 block font-medium">Tunggakan</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-amber-700 mt-1.5 block tracking-tight font-display">
                    <AnimatedCounter value={billing.totalOutstanding} formatter={formatRupiah} />
                  </span>
                  <span className="text-[11px] text-amber-700/90 mt-1 block font-medium">
                    {billing.totalOutstanding > 0 ? 'Perlu tindak lanjut' : 'Nihil tunggakan'}
                  </span>
                </div>

                <div className="p-4 sm:p-5 bg-slate-50/70 rounded-2xl border border-slate-200/80 shadow-xs hover:bg-white hover:shadow-sm transition-all">
                  <span className="text-xs text-slate-600 block font-medium">Kolektibilitas</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-forest-950 mt-1.5 block tracking-tight font-display">
                    <AnimatedCounter value={billing.collectionRate} formatter={(v) => `${v.toFixed(0)}%`} />
                  </span>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-forest-700 to-emerald-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(billing.collectionRate, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Cashflow & Occupancy Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 sm:p-5 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center justify-between shadow-xs hover:bg-white hover:shadow-sm transition-all">
                  <div>
                    <span className="text-xs text-slate-500 block font-medium">Arus Kas Bersih (Net)</span>
                    <span
                      className={`text-lg sm:text-xl font-extrabold mt-1.5 block tracking-tight ${
                        finance.netCashflow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      <AnimatedCounter value={finance.netCashflow} formatter={formatRupiah} />
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      Masuk: {formatRupiah(finance.totalIncome)} &bull; Keluar: {formatRupiah(finance.totalExpense)}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-forest-800 text-lg shrink-0 shadow-xs">
                    <AiOutlineWallet />
                  </div>
                </div>

                <div className="p-4 sm:p-5 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center justify-between shadow-xs hover:bg-white hover:shadow-sm transition-all">
                  <div>
                    <span className="text-xs text-slate-500 block font-medium">
                      Okupansi {template.unitLabel}
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5 block tracking-tight">
                      <AnimatedCounter value={units.occupied} /> <span className="text-xs text-slate-500 font-normal">/ {units.total} {template.unitLabel.toLowerCase()}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      {units.vacant} unit belum terisi
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-forest-800 text-lg shrink-0 shadow-xs">
                    <AiOutlineHome />
                  </div>
                </div>

                <div className="p-4 sm:p-5 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center justify-between shadow-xs hover:bg-white hover:shadow-sm transition-all">
                  <div>
                    <span className="text-xs text-slate-500 block font-medium">
                      Total {template.memberLabel} Terdaftar
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5 block tracking-tight">
                      <AnimatedCounter value={members.total} /> <span className="text-xs text-slate-500 font-normal">orang</span>
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      {pendingReg} menunggu verifikasi
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-forest-800 text-lg shrink-0 shadow-xs">
                    <AiOutlineTeam />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feature Navigation Grid (Feature Parity RT/RW Portal) */}
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            Menu Operasional {template.name}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Matriks Tagihan */}
            <Link
              to={`/t/${tenantId}/payment-matrix`}
              className="pv-card p-5 hover:border-forest-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-forest-50 text-forest-800 group-hover:bg-forest-800 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                  <AiOutlineTable />
                </div>
                <AiOutlineArrowRight className="text-slate-400 group-hover:text-forest-800 transition-colors" />
              </div>
              <div className="mt-4">
                <h4 className="text-base font-bold text-slate-900 group-hover:text-forest-900 transition-colors">
                  Matriks Tagihan {template.billLabel}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Pantau dan kelola matriks pembayaran {template.billLabel.toLowerCase()} seluruh {template.unitLabel.toLowerCase()} per bulan.
                </p>
              </div>
            </Link>

            {/* Verifikasi Bayar */}
            {isStaff && (
              <Link
                to={`/t/${tenantId}/payment-verification`}
                className="pv-card p-5 hover:border-emerald-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                    <AiOutlineCheckCircle />
                  </div>
                  {pendingPay > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                      {pendingPay} Pending
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                    Verifikasi Pembayaran
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Pemeriksaan dan persetujuan bukti transfer iuran dari {template.memberLabel.toLowerCase()}.
                  </p>
                </div>
              </Link>
            )}

            {/* Persetujuan Warga */}
            {isTenantAdmin && (
              <Link
                to={`/t/${tenantId}/approval`}
                className="pv-card p-5 hover:border-amber-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 group-hover:bg-amber-600 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                    <AiOutlineUserAdd />
                  </div>
                  {pendingReg > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold">
                      {pendingReg} Antre
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                    Persetujuan {template.memberLabel}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Validasi pendaftaran mandiri dan penetapan nomor unit bagi pemohon baru.
                  </p>
                </div>
              </Link>
            )}

            {/* Catatan Pengeluaran */}
            {isStaff && (
              <Link
                to={`/t/${tenantId}/expenses`}
                className="pv-card p-5 hover:border-slate-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                    <AiOutlineWallet />
                  </div>
                  <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-800 transition-colors" />
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-slate-900 transition-colors">
                    Pengeluaran Kas
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Catat biaya kebersihan, keamanan, perbaikan fasilitas, dan operasional komplek.
                  </p>
                </div>
              </Link>
            )}

            {/* Laporan Keuangan */}
            {isStaff && (
              <Link
                to={`/t/${tenantId}/reports`}
                className="pv-card p-5 hover:border-slate-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                    <AiOutlineBarChart />
                  </div>
                  <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-800 transition-colors" />
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-slate-900 transition-colors">
                    Laporan Keuangan
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Laporan kas bulanan, breakdown pengeluaran, saldo berjalan, dan export rekapitulasi.
                  </p>
                </div>
              </Link>
            )}

            {/* Setup Wizard */}
            {isTenantAdmin && (
              <Link
                to={`/t/${tenantId}/setup`}
                className="pv-card p-5 hover:border-amber-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 group-hover:bg-gold-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                    <AiOutlineSetting />
                  </div>
                  <AiOutlineArrowRight className="text-slate-400 group-hover:text-forest-800 transition-colors" />
                </div>
                <div className="mt-4">
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-forest-950 transition-colors">
                    Setup &amp; Tarif {template.billLabel}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
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
                  className="pv-card p-5 hover:border-purple-300 hover:shadow-md transition-all group flex flex-col justify-between border border-purple-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                      📋
                    </div>
                    <AiOutlineArrowRight className="text-purple-400 group-hover:text-purple-700 transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-purple-800 transition-colors">
                      Kelola Putaran Arisan
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Kelola putaran pengundian, tagihan iuran peserta, dan kesiapan putaran.
                    </p>
                  </div>
                </Link>

                <Link
                  to={`/t/${tenantId}/arisan/draw`}
                  className="pv-card p-5 hover:border-amber-300 hover:shadow-md transition-all group flex flex-col justify-between border border-amber-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                      🎲
                    </div>
                    <AiOutlineArrowRight className="text-amber-500 group-hover:text-amber-700 transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                      Ruang Pengocokan &amp; Undian
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Kocok pemenang putaran, pantau kandidat berhak undi, dan riwayat pemenang.
                    </p>
                  </div>
                </Link>
              </>
            )}

            {/* Modul Pasang & Kelola Iklan Publik (Kos & RT/RW) */}
            {(activeTenant?.type === 'kos' || activeTenant?.type === 'rt_rw') && (
              <>
                <Link
                  to={`/t/${tenantId}/listings/post`}
                  className="pv-card p-5 hover:border-amber-300 hover:shadow-md transition-all group flex flex-col justify-between border border-amber-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 group-hover:bg-amber-500 group-hover:text-forest-950 flex items-center justify-center text-xl transition-colors">
                      <HiOutlineSparkles />
                    </div>
                    <AiOutlineArrowRight className="text-amber-500 group-hover:text-amber-700 transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                      {activeTenant?.type === 'kos' ? 'Iklankan Kamar Kos' : 'Pasang Iklan UMKM'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      {activeTenant?.type === 'kos'
                        ? 'Iklankan kamar kosong ke direktori publik RuangWarga agar cepat tersewa.'
                        : 'Promosikan produk kuliner dan jasa warga ke publik di luar komplek RT.'}
                    </p>
                  </div>
                </Link>

                <Link
                  to={`/t/${tenantId}/listings`}
                  className="pv-card p-5 hover:border-slate-300 hover:shadow-md transition-all group flex flex-col justify-between border border-slate-200/90"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white flex items-center justify-center text-xl transition-colors">
                      📑
                    </div>
                    <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-800 transition-colors" />
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-slate-900 transition-colors">
                      Kelola Iklan Saya
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Pantau masa aktif iklan, tandai kamar tersewa/terjual, dan perpanjang masa tayang.
                    </p>
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Milestone Confirmation Footer Card */}
        <div className="p-6 rounded-2xl pv-card border border-slate-200/90 shadow-card flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-forest-50 text-forest-800 flex items-center justify-center shrink-0 border border-forest-100 text-xl shadow-xs">
            <AiOutlineCheckCircle />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
              Template Vertikal RT/RW Beroperasi Penuh di Atas SaaS Multi-Tenant!
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Mulai dari pendaftaran tenant, setup wizard komponen IPL, pendaftaran warga melalui kode invite,
              approval pendaftaran, matriks tagihan bulanan generik, verifikasi transfer, hingga laporan keuangan
              telah terintegrasi secara modular dengan isolasi keamanan RLS dan pembatasan subscription gate.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-100">
              <Link
                to={`/t/${tenantId}/payment-matrix`}
                className="pv-btn-primary text-xs px-4 py-2"
              >
                <AiOutlineTable />
                <span>Buka Matriks Pembayaran</span>
              </Link>
              <Link
                to="/account/tenants"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 border border-slate-200 transition-colors"
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
