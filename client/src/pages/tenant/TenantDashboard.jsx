import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineWarning,
  AiOutlineReload,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import TrialCountdownBanner from '../../components/TrialCountdownBanner';
import { formatRupiah, MONTHS_LONG } from '../../services/dataHelpers';
import { fetchTenantDashboardData } from '../../services/tenantOperationalService';
import AnimatedCounter from '../../components/AnimatedCounter';

// UI Primitives & Dashboard Sub-Components
import { Card, Button, StatusBadge, PageHeader, Badge } from '../../components/ui';
import { ResidentBillingHero } from '../../components/dashboard/ResidentBillingHero';
import { StaffCollectionHero } from '../../components/dashboard/StaffCollectionHero';
import { QuickActionsGrid } from '../../components/dashboard/QuickActionsGrid';
import { AnnouncementBanner } from '../../components/community';
import { getAnnouncementsByTenant } from '../../services/communityData';

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
  const periodLabel = `${MONTHS_LONG[selectedMonth - 1]} ${selectedYear}`;

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
    <div className="min-h-screen bg-[#f8faf9] text-slate-900 py-4 sm:py-6 px-3 sm:px-6 lg:px-8 font-sans selection:bg-gold-500 selection:text-forest-950">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* ── 1. Top Header Ramping (REQ-005, REQ-006) ────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl p-2.5 sm:p-3 bg-white text-forest-800 rounded-2xl border border-slate-200/90 shadow-card shrink-0">
              {template.icon}
            </span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500">{template.name}</span>
                <span className="text-slate-300">•</span>
                <StatusBadge status={subscriptionStatus} size="sm" />
              </div>
              <h1 className="text-title-page truncate">
                {activeTenant?.name || 'Dashboard Komunitas'}
              </h1>
              <p className="text-meta">
                Peran:{' '}
                <strong className="text-forest-900 font-bold capitalize">
                  {activeRoleName || userRole}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {/* Periode Selector Ringkas */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 shadow-xs">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
                aria-label="Pilih Bulan"
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
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer border-l border-slate-200 pl-1.5"
                aria-label="Pilih Tahun"
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboard}
              title="Segarkan Data"
              className="h-8 w-8 px-0"
              aria-label="Segarkan Data"
            >
              <AiOutlineReload className={`text-sm ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            {canManageRoles && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/t/${tenantId}/roles`)}
                icon={AiOutlineTeam}
                className="hidden lg:inline-flex text-xs"
              >
                Role &amp; Akses
              </Button>
            )}

            <Button
              variant="slate"
              size="sm"
              onClick={() => navigate('/account/tenants')}
              icon={AiOutlineSwap}
              className="text-xs"
            >
              Ganti Tenant
            </Button>
          </div>
        </div>

        {/* ── 2. Contextual Urgent Banners (Jika Ada) ────────────────────────── */}
        <TrialCountdownBanner tenantId={tenantId} />

        {isReadOnly && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-start gap-2.5">
              <AiOutlineWarning className="text-xl text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-rose-950">
                  Mode Baca Saja (Read-Only) Aktif
                </strong>
                <p className="text-rose-800 mt-0.5">
                  Masa aktif langganan telah selesai. Pencatatan transaksi baru dinonaktifkan sementara.
                </p>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => navigate('/account/subscriptions')}
              className="shrink-0 self-start sm:self-center font-bold"
            >
              Perpanjang Sekarang
            </Button>
          </div>
        )}

        {isTenantAdmin && !activeTenant?.settings?.onboarding_completed && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚙️</span>
              <div>
                <h4 className="text-xs font-bold text-amber-950">Setup Awal Belum Selesai</h4>
                <p className="text-xs text-amber-800">
                  Lengkapi daftar unit dan komponen tarif untuk mulai mengelola tagihan secara otomatis.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/t/${tenantId}/setup`)}
              className="shrink-0 text-xs font-bold"
            >
              <span>Setup Wizard</span>
              <AiOutlineArrowRight />
            </Button>
          </div>
        )}

        {/* ── 3. HERO SECTION (Level 1 - Kritis): Status Tagihan / Kolektibilitas ── */}
        {isStaff ? (
          <StaffCollectionHero
            billing={billing}
            pendingPayCount={pendingPay}
            pendingRegCount={pendingReg}
            periodLabel={periodLabel}
            template={template}
            onOpenMatrix={() => navigate(`/t/${tenantId}/payment-matrix`)}
            onOpenVerification={() => navigate(`/t/${tenantId}/payment-verification`)}
            onOpenApproval={() => navigate(`/t/${tenantId}/approval`)}
          />
        ) : (
          <ResidentBillingHero
            myBill={{
              status: billing.collectionRate >= 100 ? 'paid' : 'unpaid',
              amount: 150000,
            }}
            myUnit="CB1/05"
            periodLabel={periodLabel}
            template={template}
            isReadOnly={isReadOnly}
            onPayClick={() => navigate(`/t/${tenantId}/payment-matrix`)}
          />
        )}

        {/* ── 4. Announcement Banner (Priority 3 - Pengumuman Warga Penting) ── */}
        {(() => {
          const topAnnouncement = getAnnouncementsByTenant(tenantId)[0];
          return topAnnouncement ? (
            <AnnouncementBanner
              announcement={topAnnouncement}
              tenantId={tenantId}
            />
          ) : null;
        })()}

        {/* ── 5. Quick Actions Grid (Level 2 - Akses Cepat) ─────────────────── */}
        <QuickActionsGrid
          tenantId={tenantId}
          template={template}
          isStaff={isStaff}
          isTenantAdmin={isTenantAdmin}
        />

        {/* ── 5. Kode Undangan Kompak (Level 2 - Berguna) ───────────────────── */}
        {activeTenant?.settings?.invite_code && (
          <Card padding="sm" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <span className="text-base">🔗</span>
              <span>
                Kode Undangan {template.memberLabel}:{' '}
                <strong className="font-mono text-slate-900 font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100">
                  {activeTenant.settings.invite_code}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInviteLink}
                icon={copySuccess ? AiOutlineCheck : AiOutlineCopy}
                className="text-xs"
              >
                <span>{copySuccess ? 'Tersalin!' : 'Salin Tautan Form'}</span>
              </Button>

              <Link
                to={`/join/${activeTenant.settings.invite_code}`}
                target="_blank"
                className="text-xs font-semibold text-forest-800 hover:text-forest-950 px-2.5 py-1 rounded-lg hover:bg-forest-50 transition"
              >
                <span>Buka Form ↗</span>
              </Link>
            </div>
          </Card>
        )}

        {/* ── 6. Secondary Financial & Unit Summary (Level 3 - Progressive Disclosure) ── */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Statistik Operasional &amp; Kas Komunitas
            </h3>
            {isStaff && (
              <Link
                to={`/t/${tenantId}/reports`}
                className="text-xs font-semibold text-forest-800 hover:text-forest-900 transition inline-flex items-center gap-1"
              >
                <span>Laporan Lengkap</span>
                <AiOutlineArrowRight className="text-[10px]" />
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Net Cashflow */}
            <Card padding="md" className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Arus Kas Bersih (Net)</span>
                <div
                  className={`text-lg sm:text-xl font-mono font-bold mt-1 ${
                    finance.netCashflow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  <AnimatedCounter value={finance.netCashflow} formatter={formatRupiah} />
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Masuk: {formatRupiah(finance.totalIncome)} · Keluar: {formatRupiah(finance.totalExpense)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-forest-50 text-forest-800 flex items-center justify-center text-lg shrink-0">
                <AiOutlineWallet />
              </div>
            </Card>

            {/* Okupansi Unit */}
            <Card padding="md" className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">
                  Hunian {template.unitLabel}
                </span>
                <div className="text-lg sm:text-xl font-mono font-bold text-slate-900 mt-1">
                  <AnimatedCounter value={units.occupied} />{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    / {units.total} unit
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {units.vacant} unit kosong / belum terisi
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg shrink-0">
                <AiOutlineHome />
              </div>
            </Card>

            {/* Anggota Terdaftar */}
            <Card padding="md" className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">
                  Total {template.memberLabel}
                </span>
                <div className="text-lg sm:text-xl font-mono font-bold text-slate-900 mt-1">
                  <AnimatedCounter value={members.total} />{' '}
                  <span className="text-xs text-slate-500 font-normal">orang</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {pendingReg > 0 ? `${pendingReg} menunggu approval` : 'Semua data tervalidasi'}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg shrink-0">
                <AiOutlineTeam />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
