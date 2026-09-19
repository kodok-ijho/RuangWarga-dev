import React, { useState, useEffect } from 'react';
import { NavLink, Link, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineTable,
  AiOutlineTeam,
  AiOutlineWallet,
  AiOutlineBarChart,
  AiOutlineSetting,
  AiOutlineMenu,
  AiOutlineClose,
  AiOutlineLogout,
  AiOutlineAppstore,
  AiOutlineArrowLeft,
  AiOutlineCheckCircle,
  AiOutlineCalendar,
  AiOutlineFileText,
  AiOutlineSafetyCertificate,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import TenantSwitcher from '../TenantSwitcher';
import TrialCountdownBanner from '../TrialCountdownBanner';
import { Avatar } from '../ui/Avatar';
import { Drawer } from '../ui/Drawer';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import { Badge } from '../ui/Badge';
import { roleLabel, isStaffRole, canViewFinancialReports } from '../../services/dataHelpers';

export default function TenantShell() {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, signOut, role } = useAuth();
  const {
    activeTenant,
    activeTenantId,
    switchTenant,
    subscriptionStatus,
    isPlatformAdmin,
    isOwner,
    userRole,
    hasPermission,
  } = useTenant();

  const template = useTenantTemplate();
  const { isReadOnly } = useSubscriptionGate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tenantId = routeTenantId || activeTenantId;

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (routeTenantId && routeTenantId !== activeTenantId) {
      switchTenant(routeTenantId);
    }
  }, [routeTenantId, activeTenantId, switchTenant]);

  // Tutup mobile drawer saat pindah rute
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      // ignore
    }
  };

  const tenantBase = `/t/${tenantId}`;

  // Menu navigasi kontekstual per tenant type
  const isArisan = activeTenant?.type === 'arisan';
  const isKos = activeTenant?.type === 'kos';

  const desktopNavLinks = [
    { to: `${tenantBase}/dashboard`, label: 'Ringkasan', icon: AiOutlineHome },
    {
      to: isArisan ? `${tenantBase}/arisan/rounds` : `${tenantBase}/payment-matrix`,
      label: isArisan ? 'Putaran Arisan' : template.billLabel || 'Tagihan',
      icon: isArisan ? AiOutlineCalendar : AiOutlineTable,
    },
    { to: '/residents', label: template.memberLabel || 'Anggota', icon: AiOutlineTeam },
    { to: `${tenantBase}/expenses`, label: 'Pengeluaran', icon: AiOutlineWallet },
    ...(canViewFinancialReports(role) || hasPermission('view_reports')
      ? [{ to: `${tenantBase}/reports`, label: 'Laporan', icon: AiOutlineBarChart }]
      : []),
  ];

  // Mobile Bottom Nav: 4 Destinasi Utama Sesuai Spesifikasi (Spec §9, TASK-044)
  const mobileNavTabs = [
    {
      to: `${tenantBase}/dashboard`,
      label: 'Beranda',
      icon: AiOutlineHome,
      isActive: location.pathname.endsWith('/dashboard') || location.pathname === tenantBase,
    },
    {
      to: isArisan ? `${tenantBase}/arisan/rounds` : `${tenantBase}/payment-matrix`,
      label: isArisan ? 'Putaran' : template.billLabel || 'Tagihan',
      icon: isArisan ? AiOutlineCalendar : AiOutlineTable,
      isActive:
        location.pathname.includes('/payment-matrix') ||
        location.pathname.includes('/arisan'),
    },
    {
      to: '/residents',
      label: template.memberLabel || 'Anggota',
      icon: AiOutlineTeam,
      isActive: location.pathname.startsWith('/residents'),
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white"
      style={{
        '--tenant-primary': activeTenant?.primary_color || '#0f172a',
        '--tenant-accent': activeTenant?.accent_color || '#2563eb',
      }}
    >
      {/* ── Tenant Workspace Header (TASK-041, TASK-042) ────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Kiri: Tenant Identity & Account Switcher */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Tombol kembali ke account portal */}
            <Link
              to="/account"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              title="Kembali ke Portal Akun RuangWarga"
            >
              <AiOutlineArrowLeft className="text-base" />
            </Link>

            {/* Tenant Identity Box */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl sm:text-2xl p-1.5 bg-slate-100 rounded-lg border border-slate-200 shrink-0 select-none">
                {template.icon}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                    {activeTenant?.name || 'Ruang Kerja Komunitas'}
                  </h1>
                  {subscriptionStatus === 'trial' && (
                    <Badge variant="amber" size="sm" className="hidden sm:inline-flex shrink-0">
                      Trial
                    </Badge>
                  )}
                  {subscriptionStatus === 'read_only' && (
                    <Badge variant="rose" size="sm" className="hidden sm:inline-flex shrink-0">
                      Read-Only
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-medium truncate">
                  {template.name} &bull; {roleLabel(role, activeTenant?.type)}
                </p>
              </div>
            </div>
          </div>

          {/* Tengah: Navigasi Desktop Workspace */}
          <nav className="hidden lg:flex items-center gap-1">
            {desktopNavLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="text-sm" />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Kanan: Tenant Switcher + Profile Menu */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Switcher */}
            <div className="hidden sm:block">
              <TenantSwitcher />
            </div>

            {/* User Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-slate-200 transition-all focus:outline-none"
                  aria-label="Menu Pengguna"
                >
                  <Avatar
                    name={profile?.full_name || user?.email || 'User'}
                    size="sm"
                  />
                </button>
              }
            >
              {({ close }) => (
                <div className="py-1">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {profile?.full_name || 'Pengguna'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold capitalize">
                        {roleLabel(role, activeTenant?.type)}
                      </span>
                    </div>
                  </div>

                  <DropdownItem
                    icon={AiOutlineAppstore}
                    onClick={() => {
                      close();
                      navigate('/account');
                    }}
                  >
                    Portal Akun (Ganti Komunitas)
                  </DropdownItem>

                  {(isOwner || hasPermission('manage_settings')) && (
                    <DropdownItem
                      icon={AiOutlineSetting}
                      onClick={() => {
                        close();
                        navigate('/settings');
                      }}
                    >
                      Pengaturan Komunitas
                    </DropdownItem>
                  )}

                  {isPlatformAdmin && (
                    <DropdownItem
                      icon={AiOutlineSafetyCertificate}
                      onClick={() => {
                        close();
                        navigate('/platform');
                      }}
                    >
                      Platform Superadmin
                    </DropdownItem>
                  )}

                  <div className="my-1 border-t border-slate-100" />
                  <DropdownItem
                    icon={AiOutlineLogout}
                    danger
                    onClick={() => {
                      close();
                      handleSignOut();
                    }}
                  >
                    Keluar (Sign Out)
                  </DropdownItem>
                </div>
              )}
            </Dropdown>
          </div>
        </div>
      </header>

      {/* ── Trial / Subscription Warning Banner ─────────────────────────── */}
      <TrialCountdownBanner />

      {/* ── Main Workspace Content ───────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-20 md:pb-8">
        <Outlet />
      </main>

      {/* ── Mobile Fixed Bottom Nav (<= 4 Destinations, TASK-044) ───────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-rw-popover px-2"
        style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
        aria-label="Navigasi Komunitas Ponsel"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          {mobileNavTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center justify-center py-1 select-none transition-colors ${
                  tab.isActive
                    ? 'text-slate-900 font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <div className="relative">
                  <Icon className="text-xl" />
                  {tab.isActive && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-slate-900" />
                  )}
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[70px]">
                  {tab.label}
                </span>
              </NavLink>
            );
          })}

          {/* Tab 4: Menu Lengkap */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center py-1 select-none transition-colors ${
              mobileMenuOpen
                ? 'text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            aria-label="Buka menu workspace lengkap"
          >
            <AiOutlineMenu className="text-xl" />
            <span className="text-[10px] mt-0.5 tracking-tight">Menu</span>
          </button>
        </div>
      </nav>

      {/* ── Slide-over Drawer for Full Workspace Navigation ──────────────── */}
      <Drawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Navigasi Komunitas"
        description={activeTenant?.name || 'RuangWarga'}
      >
        <div className="space-y-4">
          {/* Tenant Switcher on Mobile */}
          <div className="pb-3 border-b border-slate-100">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Ganti Komunitas</p>
            <TenantSwitcher isMobile={true} />
          </div>

          {/* Operational Links */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 px-1">Operasional</p>
            {desktopNavLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.to}
                  onClick={() => navigate(link.to)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-left transition-colors"
                >
                  <Icon className="text-base text-slate-500" />
                  <span>{link.label}</span>
                </button>
              );
            })}
          </div>

          {/* Settings & Account */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 px-1">Akun & Sistem</p>
            <button
              onClick={() => navigate('/account')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-left transition-colors"
            >
              <AiOutlineAppstore className="text-base text-slate-500" />
              <span>Portal Komunitas Saya</span>
            </button>
            {(isOwner || hasPermission('manage_settings')) && (
              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-left transition-colors"
              >
                <AiOutlineSetting className="text-base text-slate-500" />
                <span>Pengaturan Komunitas</span>
              </button>
            )}
            {isPlatformAdmin && (
              <button
                onClick={() => navigate('/platform')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 text-left transition-colors"
              >
                <AiOutlineSafetyCertificate className="text-base" />
                <span>Platform Superadmin</span>
              </button>
            )}
          </div>

          {/* Logout */}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
            >
              <AiOutlineLogout className="text-sm" />
              <span>Keluar dari Akun</span>
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
