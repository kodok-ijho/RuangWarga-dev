import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  AiOutlineTeam,
  AiOutlineDollarCircle,
  AiOutlineBarChart,
  AiOutlineHome,
  AiOutlineSafetyCertificate,
  AiOutlineArrowLeft,
  AiOutlineMenu,
  AiOutlineClose,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';

/**
 * PlatformLayout — Shell khusus untuk Platform Owner Dashboard (§7.1, T3.4).
 * Dilengkapi pengecekan hak akses ganda (UI guard di level layout & RLS di level DB).
 */
export default function PlatformLayout() {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated } = useAuth();
  const { isPlatformAdmin, loading } = useTenant();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-forest-700 border-t-gold-500 animate-spin" />
      </div>
    );
  }

  // 403 Forbidden Guard jika bukan Platform Admin
  if (!isAuthenticated || !isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center text-3xl mx-auto mb-4">
            🔒
          </div>
          <span className="text-[10px] font-bold tracking-widest text-rose-700 uppercase bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 inline-block mb-2">
            Akses Dibatasi
          </span>
          <h1 className="text-xl font-bold text-slate-900 font-display mb-2">
            Platform Owner Dashboard
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            Halaman ini khusus diperuntukkan bagi Platform Owner (Super Admin) untuk mengelola seluruh ekosistem tenant,
            penetapan harga langganan, dan pemantauan pendapatan platform.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate('/account/tenants')}
              className="w-full py-2.5 px-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 font-bold text-xs transition-all shadow-xs"
            >
              Kembali ke Layanan Saya
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors shadow-xs"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navLinks = [
    {
      to: '/platform',
      end: true,
      label: 'Daftar Tenant',
      icon: <AiOutlineTeam className="text-lg" />,
    },
    {
      to: '/platform/pricing',
      end: false,
      label: 'Konfigurasi Harga',
      icon: <AiOutlineDollarCircle className="text-lg" />,
    },
    {
      to: '/platform/revenue',
      end: false,
      label: 'Metrik Pendapatan (MRR)',
      icon: <AiOutlineBarChart className="text-lg" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Platform Topbar */}
      <header className="sticky top-0 z-40 bg-forest-900 border-b border-forest-800 shadow-sm backdrop-blur-md text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Branding & Tag */}
            <div className="flex items-center gap-3">
              <Link to="/platform" className="flex items-center gap-2 group">
                <span className="text-2xl p-1.5 bg-forest-800 border border-forest-700 rounded-xl group-hover:scale-105 transition-transform">
                  🛡️
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-base tracking-tight font-display">
                      RuangWarga
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-gold-500/20 text-gold-300 border border-gold-500/40 uppercase tracking-wider">
                      Platform Owner
                    </span>
                  </div>
                  <span className="text-[10px] text-forest-200 block -mt-0.5">
                    Platform Management &amp; Analytics
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-gold-500 text-forest-950 font-bold shadow-xs'
                        : 'text-forest-100 hover:bg-forest-800/80 hover:text-white'
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Right Action: Back to Tenant Apps */}
            <div className="hidden sm:flex items-center gap-3">
              <Link
                to="/account/tenants"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-100 hover:text-white text-xs font-semibold border border-forest-700 transition-colors shadow-xs"
              >
                <AiOutlineHome />
                <span>Tenant Portal</span>
              </Link>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="flex md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-forest-200 hover:text-white hover:bg-forest-800"
              >
                {mobileMenuOpen ? <AiOutlineClose className="text-xl" /> : <AiOutlineMenu className="text-xl" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-forest-800 bg-forest-900 px-4 py-3 space-y-1">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
                    isActive
                      ? 'bg-gold-500 text-forest-950 font-bold'
                      : 'text-forest-100 hover:bg-forest-800'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
            <div className="pt-2 border-t border-forest-800 mt-2">
              <Link
                to="/account/tenants"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-forest-200 hover:text-white hover:bg-forest-800"
              >
                <AiOutlineHome />
                <span>Kembali ke Tenant Portal</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main Outlet Content */}
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
