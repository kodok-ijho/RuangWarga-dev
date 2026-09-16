import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineUser,
  AiOutlineTable,
  AiOutlineWallet,
  AiOutlineBarChart,
  AiOutlineSetting,
  AiOutlineLogout,
  AiOutlineTeam,
  AiOutlineFileText,
  AiOutlineUserAdd,
  AiOutlineCheckCircle,
  AiOutlineDown,
  AiOutlineMenu,
  AiOutlineClose,
  AiOutlineEdit,
  AiOutlineCalendar,
  AiOutlineBulb,
  AiOutlineSafetyCertificate,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { useTenantTemplate } from '../hooks/useTenantTemplate';
import { useToast } from '../hooks/useToast';
import { useTour } from '../context/TourContext';
import TenantSwitcher from './TenantSwitcher';
import {
  isStaffRole,
  isBendaharaOrAbove,
  hasMinRole,
  canModifyData,
  canViewFinancialReports,
  canViewPaymentVerification,
  canViewHouses,
  canViewLogs,
  roleLabel,
} from '../services/dataHelpers';
import { fetchDashboardData, fetchMyEventAccess } from '../services/dataService';
import pkg from '../../package.json';

const APP_VERSION = `v${pkg.version || '1.0.1'}`;

export default function Header() {
  const { isAuthenticated, profile, role, isReadOnly, signOut, updateProfile, session } = useAuth();
  const { isPlatformAdmin, activeTenant } = useTenant();
  const template = useTenantTemplate();
  const { startTour } = useTour();
  const canWrite = canModifyData(role) && !isReadOnly;
  const location = useLocation();
  const toast = useToast();
  const [openDropdown, setOpenDropdown] = useState(null); // null | 'keuangan' | 'warga' | 'sistem'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const dropdownRef = useRef(null);

  const handleStartCurrentPageTour = () => {
    const path = location.pathname;
    if (path.startsWith('/payment-matrix')) {
      startTour('payment_matrix');
    } else if (path.startsWith('/houses')) {
      startTour('houses');
    } else if (path.startsWith('/residents')) {
      startTour('residents');
    } else {
      startTour('dashboard');
    }
  };

  const openProfileModal = () => {
    if (!canWrite) {
      toast.info('Akun read-only tidak dapat mengubah profil.');
      return;
    }
    setEditName(profile?.full_name || '');
    setEditPhone(profile?.phone || '');
    setProfileModalOpen(true);
    setMobileMenuOpen(false);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!canWrite) {
      toast.error('Akun read-only tidak dapat mengubah profil.');
      return;
    }
    if (!editName.trim()) {
      toast.error('Nama lengkap tidak boleh kosong.');
      return;
    }
    try {
      if (updateProfile) {
        await updateProfile({ full_name: editName.trim(), phone: editPhone.trim() });
        toast.success('Profil & No. Telepon berhasil diperbarui!');
        setProfileModalOpen(false);
      }
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui profil.');
    }
  };

  const [pendingRegCount, setPendingRegCount] = useState(0);
  const [pendingPayCount, setPendingPayCount] = useState(0);
  const [eventAccess, setEventAccess] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDashboardData(session?.access_token, { role });
        if (!cancelled) {
          setPendingRegCount(data?.pendingRegistrationCount || 0);
          setPendingPayCount(data?.pendingPaymentCount || 0);
        }
        // Event capability is additive. A backend without the new endpoint
        // must not disable existing dashboard badges/navigation.
        try {
          const access = await fetchMyEventAccess(session?.access_token, { role, profileId: profile?.id });
          if (!cancelled) setEventAccess(access || null);
        } catch {
          if (!cancelled) setEventAccess(null);
        }
      } catch {
        // Non-critical — don't break header
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, profile?.id, session?.access_token, role]);

  // Tutup dropdown saat pindah halaman
  useEffect(() => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Klik di luar untuk menutup dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Definisikan grup menu
  const navGroups = [
    {
      key: 'beranda',
      label: 'Beranda',
      icon: AiOutlineHome,
      to: '/',
      end: true,
    },
    {
      key: 'keuangan',
      label: `Keuangan & ${template.billLabel}`,
      icon: AiOutlineWallet,
      badgeCount: isStaffRole(role) ? pendingPayCount : 0,
      activePaths: ['/payment-matrix', '/payment-verification', '/expenses', '/reports', '/events', '/incomes'],
      items: [
        { to: '/payment-matrix', label: `Matriks ${template.billLabel}`, icon: AiOutlineTable, desc: `Matriks pembayaran ${template.billLabel.toLowerCase()}` },
        ...(canViewPaymentVerification(role)
          ? [
              {
                to: '/payment-verification',
                label: 'Verifikasi Bayar',
                icon: AiOutlineCheckCircle,
                badge: pendingPayCount,
                desc: `Verifikasi bukti transfer ${template.memberLabel.toLowerCase()}`,
              },
            ]
          : []),
        ...(isStaffRole(role)
          ? [
              { to: '/expenses', label: 'Pengeluaran', icon: AiOutlineWallet, desc: `Catat & kelola pengeluaran ${template.communityLabel.toLowerCase()}` },
            ]
          : []),
        ...(canViewFinancialReports(role)
          ? [
              { to: '/reports', label: 'Laporan Keuangan', icon: AiOutlineBarChart, desc: 'Laporan arus kas bulanan' },
            ]
          : []),
        ...(isStaffRole(role) || role === 'bendahara' || role === 'admin_viewer'
          ? [
              { to: '/events', label: 'Event / Kegiatan', icon: AiOutlineCalendar, desc: 'Master dan akses event' },
              { to: '/incomes', label: 'Pemasukan Non-IPL', icon: AiOutlineWallet, desc: 'Pemasukan umum dan event' },
              ...(!isStaffRole(role)
                ? [{ to: '/expenses', label: 'Pengeluaran Event', icon: AiOutlineWallet, desc: 'Pengeluaran event assignment' }]
                : []),
              ...((eventAccess?.events?.length > 0)
                ? [{ to: `/events/${eventAccess.events[0].event_id}`, label: 'Event Saya', icon: AiOutlineCalendar, desc: 'Laporan keuangan event' }]
                : []),
            ]
          : []),
      ],
    },
    {
      key: 'warga',
      label: `${template.memberLabel} & ${template.unitLabel}`,
      icon: AiOutlineTeam,
      badgeCount: isStaffRole(role) ? pendingRegCount : 0,
      activePaths: ['/residents', '/houses', '/user-approval', '/users'],
      items: [
        { to: '/residents', label: `Daftar ${template.memberLabel}`, icon: AiOutlineUser, desc: `Direktori ${template.memberLabel.toLowerCase()}` },
        ...(canViewHouses(role)
          ? [
              { to: '/houses', label: `Daftar ${template.unitLabel}`, icon: AiOutlineHome, desc: isStaffRole(role) ? `Maintain data ${template.unitLabel.toLowerCase()}` : `Data status ${template.unitLabel.toLowerCase()}` },
            ]
          : []),
        ...(isStaffRole(role)
          ? [
              {
                to: '/user-approval',
                label: `Approval ${template.memberLabel}`,
                icon: AiOutlineUserAdd,
                badge: pendingRegCount,
                desc: `Verifikasi pendaftaran ${template.memberLabel.toLowerCase()} baru`,
              },
              { to: '/users', label: `Kelola ${template.memberLabel}`, icon: AiOutlineTeam, desc: `Hak akses profil ${template.memberLabel.toLowerCase()}` },
            ]
          : []),
      ],
    },
    ...(isStaffRole(role) || isPlatformAdmin
      ? [
          {
            key: 'sistem',
            label: 'Sistem & Pengaturan',
            icon: AiOutlineSetting,
            activePaths: ['/settings', '/logs', '/platform'],
            items: [
              ...(isStaffRole(role)
                ? [
                    { to: '/settings', label: 'Pengaturan', icon: AiOutlineSetting, desc: `Atur tarif ${template.billLabel} dan preferensi` },
                    ...(canViewLogs(role)
                      ? [{ to: '/logs', label: 'Log Sistem', icon: AiOutlineFileText, desc: 'Audit log aktivitas portal' }]
                      : []),
                  ]
                : []),
              ...(isPlatformAdmin
                ? [
                    {
                      to: '/platform',
                      label: 'Platform Owner',
                      icon: AiOutlineSafetyCertificate,
                      desc: 'Kelola seluruh tenant, harga & MRR',
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  const handleDropdownToggle = (key) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  return (
    <header className="bg-forest-800 border-b border-forest-700/60 sticky top-0 z-50 shadow-lg">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        {/* Kiri: Brand Logo */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-10 w-auto rounded-lg object-cover ring-2 ring-gold-500/30 group-hover:ring-gold-400 transition"
            />
            <div>
              <h1 className="text-sm md:text-base font-bold text-white leading-none tracking-wide flex items-center gap-1.5 font-display">
                {activeTenant?.name || 'RuangWarga'}
                <span className="inline-flex items-center rounded bg-gold-500/20 text-gold-300 px-1.5 py-0.5 text-[10px] font-mono font-bold border border-gold-400/30">
                  {APP_VERSION}
                </span>
                {IS_DEMO_MODE && (
                  <span className="bg-amber-400/90 text-forest-900 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 origin-left">
                    Demo
                  </span>
                )}
                {isReadOnly && (
                  <span className="bg-amber-400 text-forest-950 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm flex items-center gap-0.5">
                    <span>👁️</span> View Only
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-forest-300 leading-tight tracking-wider uppercase mt-0.5">
                {activeTenant?.type ? template?.communityLabel || 'Komunitas' : 'Platform Multi-Tenant'}
              </p>
            </div>
          </Link>
          {isAuthenticated && (
            <div className="hidden xl:flex items-center ml-3">
              <TenantSwitcher />
            </div>
          )}
        </div>

        {/* Tengah: Navigasi Desktop Dropdown (Bebas Scrollbar) */}
        {isAuthenticated && (
          <nav ref={dropdownRef} className="hidden md:flex items-center gap-1 h-full z-50">
            {navGroups.map((group) => {
              const Icon = group.icon;
              const isGroupActive =
                group.to === location.pathname ||
                (group.activePaths && group.activePaths.some((path) => location.pathname.startsWith(path)));
              const isOpen = openDropdown === group.key;

              if (group.to) {
                return (
                  <NavLink
                    key={group.key}
                    to={group.to}
                    end={group.end}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                        isActive
                          ? 'bg-forest-700/60 text-gold-400 shadow-inner'
                          : 'text-forest-200 hover:text-white hover:bg-forest-700/30'
                      }`
                    }
                  >
                    <Icon className="text-sm" />
                    <span>{group.label}</span>
                  </NavLink>
                );
              }

              return (
                <div key={group.key} className="relative h-full flex items-center">
                  <button
                    type="button"
                    data-tour={group.key === 'keuangan' ? 'nav-payment-matrix' : undefined}
                    onClick={() => handleDropdownToggle(group.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all outline-none ${
                      isGroupActive || isOpen
                        ? 'bg-forest-700/60 text-gold-400'
                        : 'text-forest-200 hover:text-white hover:bg-forest-700/30'
                    }`}
                  >
                    <Icon className="text-sm" />
                    <span>{group.label}</span>
                    {group.badgeCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow animate-pulse">
                        {group.badgeCount}
                      </span>
                    )}
                    <AiOutlineDown
                      className={`text-[10px] transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-gold-400' : 'opacity-70'
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu Overlay */}
                  {isOpen && (
                    <div className="absolute top-[calc(100%-8px)] left-0 w-72 bg-[#082315] border border-forest-700/70 rounded-xl shadow-2xl py-2 mt-1 z-[100] animate-fadeIn">
                      <div className="px-4 py-1 text-[9px] font-bold uppercase tracking-wider text-forest-400 border-b border-forest-800/80 pb-1.5 mb-1.5">
                        {group.label}
                      </div>
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isItemActive = location.pathname === item.to;
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              data-tour={item.to === '/payment-matrix' ? 'nav-payment-matrix' : undefined}
                              className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-forest-800 ${
                                isItemActive
                                  ? 'bg-forest-800 text-gold-400 border-l-2 border-gold-500'
                                  : 'text-forest-200'
                              }`}
                            >
                              <ItemIcon className="text-base mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold">{item.label}</span>
                                  {item.badge > 0 && (
                                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                                {item.desc && (
                                  <p className="text-[10px] text-forest-400 leading-tight mt-0.5 truncate">
                                    {item.desc}
                                  </p>
                                )}
                              </div>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* Kanan: Profil & Keluar */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {/* Tombol Panduan Aplikasi */}
              <button
                type="button"
                onClick={() => handleStartCurrentPageTour()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 text-gold-300 text-xs font-bold border border-gold-500/30 transition-all hover:scale-105"
                title="Panduan Interaktif Halaman Ini"
              >
                <AiOutlineBulb className="text-base text-gold-400" />
                <span className="hidden lg:inline">Panduan</span>
              </button>

              {/* Shortcut 17 Agustus */}
              <a
                href="https://drive.google.com/drive/folders/1-CIioJe6MkyBUeepB9I9yBSjsiR1h5HY"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold border border-red-400/40 shadow-xs transition-all hover:scale-105"
                title="Dokumentasi Kegiatan 17 Agustus Palm Village (Google Drive)"
              >
                <span>🇮🇩</span>
                <span className="hidden lg:inline">Dokumentasi 17-an</span>
                <span className="lg:hidden">17-an</span>
                <span className="text-[10px] opacity-80">↗</span>
              </a>

              {isPlatformAdmin && (
                <NavLink
                  to="/platform"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/40 shadow-xs transition-all hover:scale-105"
                  title="Buka Platform Owner Dashboard"
                >
                  <AiOutlineSafetyCertificate className="text-sm" />
                  <span className="hidden xl:inline">Platform</span>
                </NavLink>
              )}

              {profile?.full_name && (
                <button
                  type="button"
                  data-tour="user-profile-button"
                  onClick={openProfileModal}
                  disabled={!canWrite}
                  className="text-right flex items-center gap-2 hover:bg-forest-700/40 p-1.5 rounded-lg transition-colors group text-left border border-transparent hover:border-gold-500/30"
                  title={canWrite ? 'Klik untuk Edit Profil / No. HP' : 'Akun read-only'}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-forest-700 border border-gold-400/50 flex items-center justify-center text-xs font-bold text-gold-300">
                      {profile.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white leading-tight group-hover:text-gold-400 transition-colors">{profile.full_name}</p>
                      <p className="text-[10px] text-gold-400 font-medium uppercase tracking-wider">{roleLabel(role, activeTenant?.type)}</p>
                    </div>
                  </div>
                  <AiOutlineEdit className="text-forest-300 group-hover:text-gold-400 transition-colors text-sm ml-1" />
                </button>
              )}
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center justify-center p-2 rounded-lg text-forest-300 hover:text-white hover:bg-forest-700/40 transition-colors"
                title="Keluar"
              >
                <AiOutlineLogout className="text-lg" />
              </button>
            </>
          ) : null}
        </div>

        {/* Burger Button untuk Mobile */}
        {isAuthenticated && (
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => handleStartCurrentPageTour()}
              className="p-2 rounded-lg text-gold-400 hover:bg-forest-750 transition-colors"
              title="Panduan Halaman Ini"
            >
              <AiOutlineBulb className="text-xl" />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg text-forest-200 hover:text-white hover:bg-forest-750 transition-colors relative"
            >
              <AiOutlineMenu className="text-xl" />
              {(pendingRegCount + pendingPayCount) > 0 && (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-forest-800 animate-ping"></span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Laci Menu Mobile (100% Solid & Opaque via createPortal di atas segalanya) */}
      {mobileMenuOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex flex-col w-screen h-screen bg-[#0a2f1d] text-white overflow-hidden md:hidden animate-fadeIn">
            {/* Topbar Mobile Menu */}
            <div className="flex items-center justify-between p-4 border-b border-forest-800 shrink-0 bg-[#0a2f1d]">
              <div className="flex items-center gap-2.5">
                <img src="/logo.png" alt="Logo" className="h-8 w-auto rounded ring-1 ring-gold-500/40" />
                <div>
                  <h2 className="text-sm font-bold text-white font-display">Palm Village</h2>
                  <p className="text-[10px] text-forest-300 uppercase tracking-wider">Portal Warga</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-forest-300 hover:text-white hover:bg-forest-800 rounded-lg transition-colors"
              >
                <AiOutlineClose className="text-xl" />
              </button>
            </div>

            {/* Profil Mobile + Tombol Edit */}
            {profile && (
              <div
                data-tour="user-profile-button"
                className="p-4 bg-[#082315] border-b border-forest-800 shrink-0 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-forest-800 border border-gold-400/50 flex items-center justify-center text-sm font-bold text-gold-300">
                    {profile.full_name?.charAt(0).toUpperCase() || 'W'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{profile.full_name}</p>
                    <p className="text-xs text-gold-400 mt-0.5">{roleLabel(role, activeTenant?.type)}</p>
                    {profile.phone && <p className="text-[11px] text-forest-300 mt-0.5">📞 {profile.phone}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openProfileModal}
                  disabled={!canWrite}
                  className="flex items-center gap-1.5 bg-forest-800 hover:bg-forest-700 text-gold-400 px-3 py-1.5 rounded-xl text-xs font-semibold border border-forest-700 transition-colors shadow disabled:opacity-50"
                >
                  <AiOutlineEdit /> Edit
                </button>
              </div>
            )}

            {/* Tenant Switcher Mobile */}
            <div className="p-3 bg-[#082315] border-b border-forest-800 shrink-0">
              <p className="text-[10px] text-forest-400 uppercase tracking-wider font-semibold mb-1.5 px-1">Layanan Aktif</p>
              <TenantSwitcher isMobile={true} />
            </div>

            {/* Tombol Panduan Aplikasi Mobile */}
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleStartCurrentPageTour();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl bg-gold-500/10 text-gold-300 border border-gold-500/30 hover:bg-gold-500/20 transition-all shadow-xs"
              >
                <AiOutlineBulb className="text-base text-gold-400" /> Panduan Halaman Ini
              </button>
            </div>

            {/* Shortcut Layanan & Onboarding Mobile */}
            <div className="p-3 mx-3 mt-3 rounded-xl bg-forest-900 border border-gold-500/30 shadow-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl">🏢</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Layanan &amp; Komunitas</p>
                  <p className="text-[10px] text-forest-300 truncate">Kelola atau buat tenant baru</p>
                </div>
              </div>
              <Link
                to="/account/tenants"
                onClick={() => setMobileMenuOpen(false)}
                className="px-2.5 py-1.5 bg-gold-500 hover:bg-gold-400 text-forest-950 text-[11px] font-bold rounded-lg shadow-xs flex-shrink-0"
              >
                Layanan ↗
              </Link>
            </div>

            {/* Menu List */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4 bg-[#0a2f1d]">
              {navGroups.map((group) => {
                const Icon = group.icon;
                if (group.to) {
                  return (
                    <NavLink
                      key={group.key}
                      to={group.to}
                      end={group.end}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                          isActive ? 'bg-forest-800 text-gold-400 shadow-inner' : 'text-forest-200 hover:bg-forest-800/50'
                        }`
                      }
                    >
                      <Icon className="text-lg" />
                      <span>{group.label}</span>
                    </NavLink>
                  );
                }

                return (
                  <div key={group.key} className="space-y-1">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-forest-400 flex items-center justify-between">
                      <span>{group.label}</span>
                      {group.badgeCount > 0 && (
                        <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                          {group.badgeCount}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 pl-2 border-l border-forest-800">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isItemActive = location.pathname === item.to;
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                              isItemActive ? 'bg-forest-800 text-gold-400 shadow-inner' : 'text-forest-200 hover:bg-forest-800/30'
                            }`}
                          >
                            <ItemIcon className="text-base shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            {item.badge > 0 && (
                              <span className="bg-red-500 text-white rounded-full px-1 text-[9px] font-bold">
                                {item.badge}
                              </span>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logout Mobile */}
            <div className="p-4 border-t border-forest-800 bg-[#082315] shrink-0">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-xl bg-red-900/50 text-red-200 border border-red-800/50 hover:bg-red-800 hover:text-white transition-all shadow-md"
              >
                <AiOutlineLogout className="text-lg" /> Keluar Akun
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Edit Detail Profil Warga via createPortal */}
      {profileModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#0b2819] border border-forest-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl text-white">
              <div className="flex items-center justify-between border-b border-forest-800 pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-forest-800 border border-gold-400/50 flex items-center justify-center text-sm font-bold text-gold-300">
                    {profile?.full_name?.charAt(0).toUpperCase() || 'W'}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gold-400">Profil User Warga</h3>
                    <p className="text-[11px] text-forest-300">Detail akun & data kontak terdaftar</p>
                  </div>
                </div>
                <button
                  onClick={() => setProfileModalOpen(false)}
                  className="text-forest-400 hover:text-white p-1 rounded-lg hover:bg-forest-800 transition-colors"
                >
                  <AiOutlineClose className="text-lg" />
                </button>
              </div>

              {/* Status & Identitas Terdaftar */}
              <div className="mb-4 p-3 rounded-xl bg-forest-900/80 border border-forest-700/60 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-forest-400 uppercase tracking-wider block">Role Akun</span>
                  <span className="font-bold text-gold-300 inline-flex items-center gap-1 mt-0.5">
                    🏛️ {roleLabel(role, activeTenant?.type)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-forest-400 uppercase tracking-wider block">Status {template.memberLabel}</span>
                  <span className="font-semibold text-emerald-300 inline-flex items-center gap-1 mt-0.5">
                    ✅ Terdaftar Aktif
                  </span>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-forest-300 mb-1 uppercase tracking-wider">
                    Akun Google / Email (JWT Auth)
                  </label>
                  <input
                    type="email"
                    disabled
                    value={profile?.email || ''}
                    className="w-full rounded-xl bg-forest-950 border border-forest-800 px-3 py-2 text-xs text-forest-400 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-forest-400 mt-1">
                    🔒 Email terikat secara permanen pada autentikasi Google.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1 uppercase tracking-wider">
                    Nama Lengkap Warga
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama Lengkap Sesuai KTP"
                    required
                    className="w-full rounded-xl bg-forest-800 border border-forest-700 px-3.5 py-2 text-sm text-white placeholder-forest-400 focus:border-gold-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1 uppercase tracking-wider">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Contoh: 0812-3456-7890"
                    className="w-full rounded-xl bg-forest-800 border border-forest-700 px-3.5 py-2 text-sm text-white placeholder-forest-400 focus:border-gold-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-forest-400 mt-1">
                    💡 Digunakan oleh pengurus & bendahara untuk notifikasi tagihan IPL.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-forest-800/80 mt-6">
                  <button
                    type="button"
                    onClick={() => setProfileModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-forest-300 hover:text-white hover:bg-forest-800 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-gold-500 text-forest-950 hover:bg-gold-400 shadow-lg shadow-gold-500/20 transition-all"
                  >
                    Simpan Profil
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}
