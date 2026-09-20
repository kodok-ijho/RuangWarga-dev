import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AiOutlineSwap,
  AiOutlineReload,
  AiOutlineWarning,
  AiOutlineArrowRight,
  AiOutlineSetting,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import TrialCountdownBanner from '../../components/TrialCountdownBanner';
import { MONTHS_LONG } from '../../services/dataHelpers';
import { fetchTenantDashboardData } from '../../services/tenantOperationalService';
import { Button, StatusBadge } from '../../components/ui';

// Persona Dashboards & Skeletons
import { CitizenDashboard } from '../../components/dashboard/CitizenDashboard';
import { StaffDashboard } from '../../components/dashboard/StaffDashboard';
import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton';

export default function TenantDashboard() {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
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
  const [loadError, setLoadError] = useState(null);

  const selectedPeriod = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const periodLabel = `${MONTHS_LONG[selectedMonth - 1]} ${selectedYear}`;

  // Tentukan persona: Staff (pengurus/admin/bendahara) vs Citizen (anggota/warga)
  const isStaff =
    isOwner ||
    isTenantAdmin ||
    ['admin', 'bendahara', 'pengurus'].includes(userRole) ||
    hasPermission('view_reports') ||
    hasPermission('manage_members') ||
    hasPermission('manage_billing_cash') ||
    hasPermission('manage_billing_transfer');

  // Greeting kontekstual waktu
  const greeting = useMemo(() => {
    const hour = currentDate.getHours();
    const name = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || '';
    const salutation =
      hour >= 4 && hour < 12
        ? 'Selamat pagi'
        : hour >= 12 && hour < 15
        ? 'Selamat siang'
        : hour >= 15 && hour < 18
        ? 'Selamat sore'
        : 'Selamat malam';
    return name ? `${salutation}, ${name}` : 'Selamat datang kembali';
  }, [currentDate, profile, user]);

  const loadDashboard = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchTenantDashboardData(tenantId, {
        role: userRole,
        period: selectedPeriod,
        userId: user?.id,
        userEmail: user?.email,
      });
      setDashData(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Gagal memuat dashboard operasional tenant:', err);
      setLoadError(err.message || 'Gagal menyinkronkan data operasional komunitas.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, userRole, selectedPeriod, user?.id, user?.email]);

  useEffect(() => {
    setDashData(null);
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-4 sm:py-6 px-3 sm:px-6 lg:px-8 font-sans selection:bg-slate-900 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {/* ── 1. TENANT IDENTITY & CONTEXT HEADER ────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80">
          {/* Identity & Greeting */}
          <div className="flex items-center gap-3">
            <span
              className="text-2xl sm:text-3xl p-2.5 sm:p-3 bg-white text-slate-800 rounded-2xl border border-slate-200/90 shrink-0"
              aria-hidden="true"
            >
              {template.icon}
            </span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-semibold text-slate-500">{template.name}</span>
                <span className="text-slate-300">•</span>
                <StatusBadge status={subscriptionStatus} size="sm" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate tracking-tight">
                {activeTenant?.name || 'Komunitas RuangWarga'}
              </h1>
              <p className="text-xs text-slate-500">
                {greeting} ·{' '}
                <span className="font-medium text-slate-700 capitalize">
                  {activeRoleName || userRole || 'Anggota'}
                </span>
              </p>
            </div>
          </div>

          {/* Action Bar: Period Selector & Switcher */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {/* Periode Selector Ringkas */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 text-xs">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
                aria-label="Pilih Bulan Operasional"
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
                aria-label="Pilih Tahun Operasional"
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
              className="h-9 w-9 px-0 min-h-[36px]"
              aria-label="Segarkan Data Dashboard"
            >
              <AiOutlineReload className={`text-sm ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/account/tenants')}
              icon={AiOutlineSwap}
              className="text-xs min-h-[36px]"
            >
              Ganti Komunitas
            </Button>
          </div>
        </header>

        {/* ── 2. CONTEXTUAL SYSTEM BANNERS (Trial, Read-Only, Setup) ────────── */}
        <TrialCountdownBanner tenantId={tenantId} />

        {isReadOnly && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 sm:p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
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
              variant="destructive"
              size="sm"
              onClick={() => navigate('/account/subscription')}
              className="shrink-0 self-start sm:self-center font-bold text-xs"
            >
              Perpanjang Sekarang
            </Button>
          </div>
        )}

        {isTenantAdmin && !activeTenant?.settings?.onboarding_completed && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">⚙️</span>
              <div>
                <h4 className="font-bold text-amber-950">Konfigurasi Awal Belum Selesai</h4>
                <p className="text-amber-800">
                  Lengkapi daftar unit dan komponen tarif untuk mengaktifkan tagihan otomatis.
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

        {/* ── 3. STATE DISPATCHER: LOADING | ERROR | CITIZEN | STAFF ────────── */}
        {isLoading && !dashData ? (
          <DashboardSkeleton isStaff={isStaff} />
        ) : loadError ? (
          <div className="p-8 rounded-2xl border border-rose-200 bg-rose-50/50 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto text-lg">
              <AiOutlineWarning />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">
                Data dashboard belum dapat dimuat
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Terjadi kendala saat menyinkronkan data operasional komunitas. Periksa koneksi Anda dan coba lagi.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={loadDashboard}
              icon={AiOutlineReload}
              className="text-xs min-h-[38px]"
            >
              Coba Lagi
            </Button>
          </div>
        ) : isStaff ? (
          <StaffDashboard
            tenantId={tenantId}
            template={template}
            dashData={dashData}
            periodLabel={periodLabel}
            activeTenant={activeTenant}
          />
        ) : (
          <CitizenDashboard
            tenantId={tenantId}
            template={template}
            dashData={dashData}
            periodLabel={periodLabel}
            isReadOnly={isReadOnly}
            userProfile={profile}
          />
        )}
      </div>
    </div>
  );
}
