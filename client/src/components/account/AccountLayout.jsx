import React from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import {
  AiOutlineAppstore,
  AiOutlinePlus,
  AiOutlineCreditCard,
  AiOutlineLogout,
  AiOutlineUser,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../ui/Avatar';
import Dropdown, { DropdownItem } from '../ui/Dropdown';

export default function AccountLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      // ignore
    }
  };

  const navLinks = [
    { to: '/account', label: 'Komunitas Saya', icon: AiOutlineAppstore, end: true },
    { to: '/account/subscription', label: 'Langganan & Billing', icon: AiOutlineCreditCard },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      {/* ── Global Account Header (Tenant-Neutral SaaS) ────────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Kiri: Brand RuangWarga Global */}
          <div className="flex items-center gap-6">
            <Link to="/account" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-xs group-hover:bg-slate-800 transition-colors">
                RW
              </div>
              <div className="flex flex-col">
                <span className="text-base font-extrabold text-slate-900 tracking-tight leading-none">
                  RuangWarga
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase mt-0.5">
                  Platform Akun
                </span>
              </div>
            </Link>

            {/* Navigasi Desktop Account */}
            <nav className="hidden sm:flex items-center gap-1">
              {navLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`
                    }
                  >
                    <Icon className="text-sm" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Kanan: Tambah Komunitas CTA + User Profile */}
          <div className="flex items-center gap-3">
            <Link
              to="/account/add-tenant"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all active:scale-[0.98]"
            >
              <AiOutlinePlus className="text-sm" />
              <span>Tambah Komunitas</span>
            </Link>

            {/* Profile Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-slate-200 transition-all focus:outline-none"
                  aria-label="Menu Akun Pengguna"
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
                  </div>
                  <DropdownItem
                    icon={AiOutlineAppstore}
                    onClick={() => {
                      close();
                      navigate('/account');
                    }}
                  >
                    Komunitas Saya
                  </DropdownItem>
                  <DropdownItem
                    icon={AiOutlinePlus}
                    onClick={() => {
                      close();
                      navigate('/account/add-tenant');
                    }}
                  >
                    Buat Komunitas Baru
                  </DropdownItem>
                  <DropdownItem
                    icon={AiOutlineCreditCard}
                    onClick={() => {
                      close();
                      navigate('/account/subscription');
                    }}
                  >
                    Langganan
                  </DropdownItem>
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

      {/* ── Content Area ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>

      {/* ── Neutral Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} RuangWarga &bull; Platform Komunitas SaaS Multi-Tenant</span>
          <div className="flex items-center gap-4 text-[11px]">
            <Link to="/listing" className="hover:text-slate-600">Direktori Publik</Link>
            <Link to="/login" className="hover:text-slate-600">Bantuan</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
