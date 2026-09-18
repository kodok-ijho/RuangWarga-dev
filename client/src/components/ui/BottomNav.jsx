import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineTable,
  AiOutlineTeam,
  AiOutlineMenu,
  AiOutlineBarChart,
  AiOutlineWallet,
  AiOutlineSetting,
  AiOutlineFileText,
  AiOutlineLogout,
  AiOutlineUser,
  AiOutlineClose,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { Drawer } from './Drawer';
import {
  isStaffRole,
  isBendaharaOrAbove,
  canViewFinancialReports,
  canViewPaymentVerification,
  canViewHouses,
  roleLabel,
} from '../../services/dataHelpers';

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, profile, role, signOut, isReadOnly } = useAuth();
  const { activeTenant, activeTenantId, isPlatformAdmin } = useTenant();
  const template = useTenantTemplate();
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);

  // Jangan tampilkan jika belum login
  if (!isAuthenticated) return null;

  // Jangan tampilkan pada onboarding / setup wizard
  if (
    location.pathname.startsWith('/onboarding') ||
    location.pathname.endsWith('/setup')
  ) {
    return null;
  }

  const tenantPrefix = activeTenantId ? `/t/${activeTenantId}` : '';
  const homePath = activeTenantId ? `${tenantPrefix}/dashboard` : '/';
  const iplPath = activeTenantId ? `${tenantPrefix}/payment-matrix` : '/payment-matrix';
  const wargaPath = '/residents';

  const isHomeActive =
    location.pathname === homePath ||
    location.pathname === '/' ||
    location.pathname.endsWith('/dashboard');
  const isIplActive = location.pathname.includes('/payment-matrix');
  const isWargaActive =
    location.pathname.startsWith('/residents') ||
    location.pathname.includes('/members');

  const handleNavigate = (to) => {
    setMenuDrawerOpen(false);
    navigate(to);
  };

  const displayName = profile?.full_name || profile?.email || 'Pengguna';

  return (
    <>
      {/* ── Fixed Bottom Navigation Bar (Khusus Mobile < 768px) ─────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-lg px-2"
        style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
        aria-label="Navigasi Utama Ponsel"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          {/* Tab 1: Beranda */}
          <NavLink
            to={homePath}
            className={`flex flex-col items-center justify-center py-1 transition-colors select-none ${
              isHomeActive
                ? 'text-forest-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <AiOutlineHome className="text-xl" />
              {isHomeActive && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-gold-500" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Beranda</span>
          </NavLink>

          {/* Tab 2: Tagihan / IPL */}
          <NavLink
            to={iplPath}
            className={`flex flex-col items-center justify-center py-1 transition-colors select-none ${
              isIplActive
                ? 'text-forest-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <AiOutlineTable className="text-xl" />
              {isIplActive && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-gold-500" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">
              {template.billLabel || 'Tagihan'}
            </span>
          </NavLink>

          {/* Tab 3: Warga */}
          <NavLink
            to={wargaPath}
            className={`flex flex-col items-center justify-center py-1 transition-colors select-none ${
              isWargaActive
                ? 'text-forest-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <AiOutlineTeam className="text-xl" />
              {isWargaActive && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-gold-500" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">
              {template.memberLabel || 'Warga'}
            </span>
          </NavLink>

          {/* Tab 4: Menu / Lainnya */}
          <button
            type="button"
            onClick={() => setMenuDrawerOpen(true)}
            className={`flex flex-col items-center justify-center py-1 transition-colors select-none ${
              menuDrawerOpen
                ? 'text-forest-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            aria-label="Buka menu lengkap"
          >
            <AiOutlineMenu className="text-xl" />
            <span className="text-[10px] mt-0.5 tracking-tight">Menu</span>
          </button>
        </div>
      </nav>

      {/* ── Slide-over Menu Drawer untuk Akses Menu Tambahan ─────────── */}
      <Drawer
        isOpen={menuDrawerOpen}
        onClose={() => setMenuDrawerOpen(false)}
        title="Menu & Navigasi"
        description={activeTenant?.name || 'RuangWarga'}
      >
        <div className="space-y-5">
          {/* User Profile Summary */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="h-10 w-10 rounded-full bg-forest-800 text-white font-bold flex items-center justify-center shrink-0 text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">{displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-semibold text-forest-800 bg-forest-50 px-1.5 py-0.2 rounded border border-forest-200 capitalize">
                  {roleLabel(role, activeTenant?.type)}
                </span>
                {isReadOnly && (
                  <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                    Read-Only
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Navigasi Operasional */}
          <div className="space-y-1">
            <p className="text-label-caps px-2 mb-2">Operasional Komunitas</p>

            <button
              onClick={() => handleNavigate(homePath)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <AiOutlineHome className="text-base text-forest-800" />
              <span>Beranda Operasional</span>
            </button>

            <button
              onClick={() => handleNavigate(iplPath)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <AiOutlineTable className="text-base text-forest-800" />
              <span>{template.billLabel || 'Matriks Pembayaran'}</span>
            </button>

            <button
              onClick={() => handleNavigate(wargaPath)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <AiOutlineTeam className="text-base text-forest-800" />
              <span>Daftar {template.memberLabel || 'Warga'}</span>
            </button>

            {canViewHouses(role) && (
              <button
                onClick={() => handleNavigate('/houses')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <AiOutlineHome className="text-base text-forest-800" />
                <span>Data {template.unitLabel || 'Rumah / Unit'}</span>
              </button>
            )}
          </div>

          {/* Navigasi Keuangan */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <p className="text-label-caps px-2 mb-2">Keuangan & Kas</p>

            {canViewPaymentVerification(role) && (
              <button
                onClick={() => handleNavigate(activeTenantId ? `${tenantPrefix}/payment-verification` : '/payment-verification')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <AiOutlineFileText className="text-base text-forest-800" />
                <span>Verifikasi Pembayaran</span>
              </button>
            )}

            <button
              onClick={() => handleNavigate(activeTenantId ? `${tenantPrefix}/expenses` : '/expenses')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <AiOutlineWallet className="text-base text-forest-800" />
              <span>Pengeluaran Kas</span>
            </button>

            {canViewFinancialReports(role) && (
              <button
                onClick={() => handleNavigate(activeTenantId ? `${tenantPrefix}/reports` : '/reports')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <AiOutlineBarChart className="text-base text-forest-800" />
                <span>Laporan Arus Kas</span>
              </button>
            )}
          </div>

          {/* Pengaturan & Akun */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <p className="text-label-caps px-2 mb-2">Akun & Sistem</p>

            <button
              onClick={() => handleNavigate('/account/tenants')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <AiOutlineUser className="text-base text-forest-800" />
              <span>Kelola Tenant Anda</span>
            </button>

            {isStaffRole(role) && (
              <button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <AiOutlineSetting className="text-base text-forest-800" />
                <span>Pengaturan Iuran</span>
              </button>
            )}

            {isPlatformAdmin && (
              <button
                onClick={() => handleNavigate('/platform')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 transition"
              >
                <span className="text-base">👑</span>
                <span>Platform Owner Dashboard</span>
              </button>
            )}
          </div>

          {/* Tombol Logout */}
          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setMenuDrawerOpen(false);
                signOut();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold transition"
            >
              <AiOutlineLogout className="text-sm" />
              <span>Keluar dari Akun</span>
            </button>
          </div>
        </div>
      </Drawer>
    </>
  );
}

export default BottomNav;
