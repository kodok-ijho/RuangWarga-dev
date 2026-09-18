import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineArrowRight,
  AiOutlineSafetyCertificate,
  AiOutlineDollarCircle,
  AiOutlineCheckCircle,
  AiOutlineShop,
  AiOutlineAppstore,
  AiOutlineCreditCard,
  AiOutlineReload,
  AiOutlineUser,
} from 'react-icons/ai';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { TENANT_TYPE_OPTIONS } from './onboarding/ChooseTenantType';
import { getTenantTemplate } from '../config/tenantTemplates';
import pkg from '../../package.json';

const APP_VERSION = `v${pkg.version || '1.0.1'}`;

const STATUS_BADGES = {
  active: {
    label: 'Aktif',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  trial: {
    label: 'Trial 15 Hari',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  read_only: {
    label: 'Read-Only (Perlu Perpanjangan)',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

/**
 * GuestLandingView
 * Tampilan beranda bersih & minimalis (Model SumoPod) untuk pengunjung yang BELUM login.
 */
function GuestLandingView() {
  const [activeType, setActiveType] = useState('rt_rw');
  const activeOption = TENANT_TYPE_OPTIONS.find((opt) => opt.type === activeType) || TENANT_TYPE_OPTIONS[0];

  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-900 flex flex-col selection:bg-gold-500 selection:text-forest-950 font-sans">
      {/* ── Top Navigation Bar (Publik) ─────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 border-b border-slate-200/80 backdrop-blur-md shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="RuangWarga"
              className="h-10 w-auto rounded-xl object-cover ring-2 ring-forest-800/10 shadow-sm"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl font-display tracking-tight text-forest-950">
                  RuangWarga
                </span>
                <span className="inline-flex items-center rounded-md bg-forest-50 text-forest-800 px-1.5 py-0.5 text-[10px] font-mono font-bold border border-forest-200">
                  {APP_VERSION}
                </span>
                {IS_DEMO_MODE && (
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Demo
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 tracking-wider uppercase font-medium">
                Platform Komunitas &amp; Properti
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/listing"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-forest-900 rounded-lg hover:bg-slate-100 transition"
            >
              <AiOutlineShop className="text-sm text-forest-700" />
              <span>Direktori Listing</span>
            </Link>

            <Link
              to="/login"
              className="pv-btn-primary text-xs px-4 py-2"
            >
              Masuk ke Akun
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content Area (Publik) ──────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-16 sm:space-y-20">
        {/* ── Hero Section (Bersih, Fokus & Tegas) ─────────────────────────── */}
        <section className="text-center max-w-3xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-forest-50 border border-forest-200/80 text-forest-800 text-xs font-semibold tracking-wide shadow-xs">
            <span>✨ Solusi Terpadu Manajemen Komunitas &amp; Properti</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-forest-950 font-display tracking-tight leading-tight">
            Kelola Iuran &amp; Warga{' '}
            <span className="bg-gradient-to-r from-forest-800 via-forest-700 to-gold-600 bg-clip-text text-transparent">
              Lebih Rapi dan Transparan
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Aplikasi manajemen modern untuk RT/RW, kos-kosan, arisan, dan kelas dengan pencatatan iuran otomatis serta laporan kas transparan.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/onboarding/choose-type"
              className="pv-btn-primary text-sm px-6 py-3"
            >
              <AiOutlinePlus className="text-base font-bold" />
              <span>Mulai Coba Gratis 15 Hari</span>
            </Link>

            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 hover:text-forest-950 border border-slate-200 font-bold text-sm shadow-xs transition-all active:scale-[0.98]"
            >
              <span>Masuk Akun</span>
              <AiOutlineArrowRight className="text-xs" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <AiOutlineCheckCircle className="text-forest-700 text-sm" /> 15 Hari Coba Gratis
            </span>
            <span className="flex items-center gap-1.5">
              <AiOutlineSafetyCertificate className="text-emerald-600 text-sm" /> Data Terisolasi Aman
            </span>
            <span className="flex items-center gap-1.5">
              <AiOutlineCreditCard className="text-amber-600 text-sm" /> Pembayaran QRIS Instan
            </span>
          </div>
        </section>

        {/* ── Showcase 4 Vertikal Bisnis (Tabbed Showcase Ramping) ──────── */}
        <section className="space-y-6 max-w-4xl mx-auto">
          <div className="text-center space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-forest-950 font-display">
              Dirancang Khusus Sesuai Karakter Operasional
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Pilih tipe komunitas Anda untuk melihat fitur dan alur kerja yang relevan.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-slate-100 border border-slate-200/90 rounded-2xl max-w-xl mx-auto shadow-inner">
            {TENANT_TYPE_OPTIONS.map((opt) => {
              const isSel = activeType === opt.type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setActiveType(opt.type)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSel
                      ? 'bg-forest-800 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  <span>{opt.title.split('&')[0]}</span>
                </button>
              );
            })}
          </div>

          {/* Active Vertikal Spotlight Card */}
          <div className="pv-card p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-card relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Kolom Kiri: Deskripsi & Fitur Kunci */}
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-4xl p-3 bg-forest-50 text-forest-800 rounded-2xl border border-forest-100 shadow-xs">
                    {activeOption.icon}
                  </span>
                  <div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${activeOption.badgeColor}`}>
                      {activeOption.badge}
                    </span>
                    <h3 className="text-xl font-bold text-forest-950 font-display mt-1">
                      {activeOption.title}
                    </h3>
                    <p className="text-xs text-slate-500">Untuk: {activeOption.targetRole}</p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {activeOption.description}
                </p>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Kemampuan Utama:
                  </span>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {activeOption.features.slice(0, 3).map((feat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <AiOutlineCheckCircle className="text-forest-700 text-sm shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  <Link
                    to={`/onboarding/choose-type?type=${activeOption.type}`}
                    className="pv-btn-primary text-xs px-5 py-2.5 w-full sm:w-auto"
                  >
                    <span>Daftarkan {activeOption.title.split('&')[0]} Sekarang</span>
                    <AiOutlineArrowRight className="text-xs" />
                  </Link>
                </div>
              </div>

              {/* Kolom Kanan: Visual Preview Mini Widget */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-800">Preview Alur Operasional</span>
                  </div>
                  <span className="text-[10px] font-mono text-forest-800 font-semibold bg-forest-50 px-2 py-0.5 rounded border border-forest-200">
                    Otomatis
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between text-xs shadow-xs">
                    <span className="text-slate-600">Penerbitan Tagihan Bulanan</span>
                    <span className="text-emerald-700 font-bold">1-Klik Terjadwal</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between text-xs shadow-xs">
                    <span className="text-slate-600">Metode Pembayaran</span>
                    <span className="text-gold-700 font-bold">QRIS &amp; Transfer Otomatis</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between text-xs shadow-xs">
                    <span className="text-slate-600">Laporan Kas &amp; Pembukuan</span>
                    <span className="text-slate-900 font-bold">Real-time Siap Cetak</span>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <span className="text-[11px] text-slate-500">
                    Bebas dicoba tanpa komitmen &bull; Setup instan &lt; 2 menit
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pilar Fondasi Platform (Icon + 1 Baris Value) ───────────── */}
        <section className="pv-card p-8 rounded-3xl border border-slate-200/90 shadow-card space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-forest-950 font-display">
              Standar Keamanan &amp; Kemudahan Layanan
            </h2>
            <p className="text-xs text-slate-500">
              Fondasi yang tangguh untuk kenyamanan pengurus dan seluruh anggota.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-2 hover:bg-white hover:shadow-xs transition">
              <span className="text-2xl">🔒</span>
              <h3 className="text-sm font-bold text-slate-900">Data Terisolasi Aman</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Data warga dan catatan kas tiap komunitas terlindungi dan terisolasi secara privat.
              </p>
            </div>

            <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-2 hover:bg-white hover:shadow-xs transition">
              <span className="text-2xl">⚡</span>
              <h3 className="text-sm font-bold text-slate-900">QRIS &amp; E-Wallet Instan</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bayar iuran instan via GoPay, OVO, ShopeePay, BCA, Mandiri tanpa unggah bukti manual.
              </p>
            </div>

            <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-2 hover:bg-white hover:shadow-xs transition">
              <span className="text-2xl">📊</span>
              <h3 className="text-sm font-bold text-slate-900">Laporan Kas Transparan</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kas masuk dan keluar tercatat otomatis dengan rekap siap unduh dan cetak.
              </p>
            </div>

            <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-2 hover:bg-white hover:shadow-xs transition">
              <span className="text-2xl">📢</span>
              <h3 className="text-sm font-bold text-slate-900">Direktori Listing Publik</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Promosikan kamar kos kosong atau lapak UMKM warga ke halaman publik tanpa login.
              </p>
            </div>
          </div>
        </section>

        {/* ── Call To Action Bawah (Ringkas & Tegas) ───────────────────── */}
        <section className="bg-gradient-to-r from-forest-900 via-forest-800 to-forest-900 border border-forest-700/80 rounded-3xl p-8 sm:p-10 text-center space-y-4 shadow-xl text-white">
          <div className="max-w-xl mx-auto space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-white font-display">
              Mulai Kelola Komunitas Anda Lebih Nyaman
            </h2>
            <p className="text-xs sm:text-sm text-forest-200">
              15 hari trial gratis penuh. Buat tenant Anda dan undang anggota dalam beberapa klik.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/onboarding/choose-type"
              className="pv-btn-primary text-xs px-6 py-3"
            >
              <AiOutlinePlus className="text-base font-bold" />
              <span>Daftarkan Komunitas Anda</span>
            </Link>
            <Link
              to="/listing"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 font-bold text-xs transition shadow-xs"
            >
              <AiOutlineShop className="text-sm text-forest-800" />
              <span>Lihat Listing Publik</span>
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 space-y-2">
        <p className="font-medium">
          RuangWarga &copy; 2026 &mdash; Platform Komunitas &amp; Properti.
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
          <Link to="/listing/kos" className="hover:text-forest-800">Listing Kos</Link>
          <span>&bull;</span>
          <Link to="/listing/umkm" className="hover:text-forest-800">Listing UMKM</Link>
          <span>&bull;</span>
          <Link to="/login" className="hover:text-forest-800">Masuk Akun</Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * AuthenticatedWorkspaceHub
 * Tampilan Workspace / Portal Kelola Tenant (Model SumoPod) saat pengguna SUDAH login.
 */
function AuthenticatedWorkspaceHub() {
  const navigate = useNavigate();
  const { user, profile, signOut, isSuperAdmin } = useAuth();
  const {
    userTenants,
    activeTenantId,
    switchTenant,
    isPlatformAdmin,
    loading,
    refreshTenant,
  } = useTenant();

  const handleSelectTenant = (tenantId) => {
    switchTenant(tenantId);
    navigate(`/t/${tenantId}/dashboard`);
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Pengguna';
  const displayEmail = user?.email || profile?.email || '';

  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-900 flex flex-col selection:bg-gold-500 selection:text-forest-950 font-sans">
      {/* ── Top Navigation Bar (Workspace) ────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 border-b border-slate-200/80 backdrop-blur-md shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="RuangWarga"
                className="h-10 w-auto rounded-xl object-cover ring-2 ring-forest-800/10 shadow-sm"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg sm:text-xl font-display tracking-tight text-forest-950">
                    RuangWarga
                  </span>
                  <span className="inline-flex items-center rounded-md bg-forest-50 text-forest-800 px-1.5 py-0.5 text-[10px] font-mono font-bold border border-forest-200">
                    {APP_VERSION}
                  </span>
                  {IS_DEMO_MODE && (
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Demo
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 tracking-wider uppercase font-medium hidden sm:block">
                  Workspace Kelola Tenant
                </p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/listing"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-forest-900 rounded-lg hover:bg-slate-100 pv-focus-ring transition"
            >
              <AiOutlineShop className="text-sm text-forest-700" aria-hidden="true" />
              <span>Direktori Listing</span>
            </Link>

            {/* Profile Pill & Logout */}
            <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-slate-200">
              <div className="flex items-center gap-2 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/90 max-w-[110px] sm:max-w-[200px] truncate">
                <div className="w-6 h-6 rounded-full bg-forest-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="truncate text-left">
                  <p className="text-xs font-semibold text-slate-900 truncate leading-tight">{displayName}</p>
                  {displayEmail && <p className="text-[10px] text-slate-500 truncate">{displayEmail}</p>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => signOut()}
                className="min-h-[36px] px-2.5 sm:px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition border border-rose-200 shrink-0 pv-focus-ring"
                title="Keluar dari akun"
                aria-label="Keluar dari akun"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Workspace Content ────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* ── Banner Eksklusif Platform Owner / Superadmin ────────────── */}
        {(isPlatformAdmin || isSuperAdmin) && (
          <section className="bg-white border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center text-xl shrink-0">
                👑
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Platform Superadmin Access
                  </span>
                  <span className="text-[11px] text-slate-500">({displayEmail})</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Akses penuh status langganan seluruh tenant, konfigurasi skema harga blok, dan estimasi pendapatan MRR.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Link
                to="/platform"
                className="pv-btn-primary text-xs px-4 py-2"
              >
                <AiOutlineSafetyCertificate className="text-base" />
                <span>Platform Dashboard</span>
              </Link>
              <Link
                to="/platform/pricing"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-semibold transition"
              >
                <AiOutlineDollarCircle className="text-base" />
                <span>Konfigurasi Harga</span>
              </Link>
            </div>
          </section>
        )}

        {/* ── Section Utama: Kelola Layanan & Tenant Anda ──────────────── */}
        <section className="pv-card p-6 sm:p-8 space-y-6 shadow-card border border-slate-200/90">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏢</span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-forest-950 font-display">
                  Layanan &amp; Tenant Anda
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Pilih salah satu layanan untuk masuk ke dashboard operasional harian, atau daftarkan tenant baru.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refreshTenant()}
                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition flex items-center gap-1.5"
                title="Segarkan Data Tenant"
              >
                <AiOutlineReload className="text-sm" />
                <span className="hidden sm:inline">Segarkan</span>
              </button>

              <Link
                to="/onboarding/choose-type"
                className="pv-btn-primary text-xs px-4 py-2.5"
              >
                <AiOutlinePlus className="text-sm font-bold" />
                <span>Daftarkan Tenant Baru</span>
              </Link>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="h-8 w-8 rounded-full border-2 border-forest-600 border-t-gold-500 animate-spin" />
              <p className="text-xs text-slate-500">Memuat data tenant Anda...</p>
            </div>
          )}

          {/* Empty State (User belum punya tenant) */}
          {!loading && (!userTenants || userTenants.length === 0) && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl mx-auto shadow-xs">
                🏘️
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 font-display">Belum Ada Tenant Terdaftar</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Anda belum memiliki atau terdaftar di komunitas manapun. Daftarkan tenant pertama Anda sekarang
                  untuk mulai mengelola RT/RW, Kos, Arisan, atau Kelas Anda dengan 15 hari trial gratis!
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/onboarding/choose-type"
                  className="pv-btn-primary text-xs px-6 py-3"
                >
                  <AiOutlinePlus className="text-sm font-bold" />
                  <span>Daftarkan Tenant Pertama (Trial Gratis)</span>
                </Link>
              </div>
            </div>
          )}

          {/* Grid Kartu Tenant */}
          {!loading && userTenants && userTenants.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {userTenants.map((t) => {
                const template = getTenantTemplate(t.type);
                const isActive = activeTenantId === t.id;
                const subStatus = t.subscription?.status || 'trial';
                const badgeInfo = STATUS_BADGES[subStatus] || STATUS_BADGES.trial;
                const isOwner = t.owner_id === (user?.id || profile?.id);

                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl p-6 border transition-all flex flex-col justify-between ${
                      isActive
                        ? 'bg-white border-2 border-gold-500 shadow-elevated ring-4 ring-gold-500/15'
                        : 'bg-white border border-slate-200/90 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Top Row: Icon, Badge Vertikal, Status Aktif */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl p-2.5 bg-forest-50 text-forest-800 rounded-xl border border-forest-100 shadow-xs">
                            {template.icon}
                          </span>
                          <div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-forest-50 text-forest-800 border border-forest-200 uppercase tracking-wide">
                              {template.name}
                            </span>
                            <h3 className="text-base font-bold text-slate-900 font-display line-clamp-1 mt-1">
                              {t.name}
                            </h3>
                          </div>
                        </div>

                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-gold-500 text-forest-950 shadow-xs shrink-0">
                            <AiOutlineCheckCircle /> Aktif
                          </span>
                        )}
                      </div>

                      {/* Info Alamat & Peran */}
                      <div className="space-y-1 text-xs text-slate-600">
                        {t.address && (
                          <p className="text-[11px] text-slate-500 line-clamp-1">{t.address}</p>
                        )}
                        <p className="text-[11px] text-slate-600">
                          Peran Anda:{' '}
                          <strong className="text-forest-900 capitalize">
                            {t.role_name || (t.is_owner ? 'Admin' : (t.role || (isOwner ? 'Admin' : 'Anggota')))}
                          </strong>
                        </p>
                      </div>

                      {/* Subscription Status Box */}
                      <div className="py-2.5 px-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-semibold">
                            Langganan
                          </span>
                          <span className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${badgeInfo.style}`}>
                            {badgeInfo.label}
                          </span>
                        </div>

                        {t.subscription?.trial_ends_at && subStatus === 'trial' && (
                          <div className="text-right">
                            <span className="text-slate-500 block text-[10px]">Selesai:</span>
                            <span className="text-[11px] font-semibold text-amber-700">
                              {new Date(t.subscription.trial_ends_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectTenant(t.id)}
                        className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                          isActive
                            ? 'pv-btn-primary'
                            : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                        }`}
                      >
                        <span>{isActive ? 'Buka Dashboard' : 'Pilih & Buka'}</span>
                        <AiOutlineArrowRight className="text-xs" />
                      </button>

                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            switchTenant(t.id);
                            navigate('/account/subscription');
                          }}
                          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-forest-900 border border-slate-200 transition"
                          title="Kelola Langganan & Kapasitas"
                        >
                          <AiOutlineCreditCard className="text-base" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section Pintasan Cepat ──────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          <div className="pv-card p-5 sm:p-6 flex items-start gap-4 hover:border-slate-300 border border-slate-200/90 shadow-xs transition">
            <div className="w-12 h-12 rounded-2xl bg-forest-50 border border-forest-100 text-forest-800 flex items-center justify-center text-2xl shrink-0">
              📢
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 font-display">Modul Listing Publik</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Jelajahi kamar kos kosong dan lapak UMKM warga yang dipromosikan ke publik.
              </p>
              <Link
                to="/listing"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-forest-800 hover:text-forest-950 pt-1"
              >
                <span>Buka Direktori Listing</span>
                <AiOutlineArrowRight className="text-xs" />
              </Link>
            </div>
          </div>

          <div className="pv-card p-5 sm:p-6 flex items-start gap-4 hover:border-slate-300 border border-slate-200/90 shadow-xs transition">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center text-2xl shrink-0">
              💳
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 font-display">Pusat Akun &amp; Langganan</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pantau invoice Mayar, sesuaikan kapasitas blok unit/kamar, dan atur preferensi akun.
              </p>
              <Link
                to="/account/tenants"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 pt-1"
              >
                <span>Kelola Seluruh Akun</span>
                <AiOutlineArrowRight className="text-xs" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer Workspace ────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 space-y-1 mt-12">
        <p className="font-medium">
          RuangWarga &copy; 2026 &mdash; Platform SaaS Multi-Tenant Komunitas &amp; Properti.
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
          <Link to="/listing/kos" className="hover:text-forest-800">Listing Kos</Link>
          <span>&bull;</span>
          <Link to="/listing/umkm" className="hover:text-forest-800">Listing UMKM</Link>
          <span>&bull;</span>
          <Link to="/account/tenants" className="hover:text-forest-800">Kelola Layanan</Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * Komponen Utama Home:
 * Secara elegan memisahkan pengalaman pengunjung (GuestLandingView) dan
 * pengguna terotentikasi (AuthenticatedWorkspaceHub) mengikuti pola SumoPod.
 */
export default function Home() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <GuestLandingView />;
  }

  return <AuthenticatedWorkspaceHub />;
}
