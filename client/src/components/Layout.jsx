import { Navigate, Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { BottomNav } from './ui/BottomNav';
import { useAuth } from '../hooks/useAuth';

/**
 * Layout untuk halaman yang butuh autentikasi.
 * Redirect ke /login bila belum login.
 */
export default function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#f8faf9]">
        <div className="h-10 w-10 rounded-full border-3 border-slate-200 border-t-gold-500 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Memuat...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8faf9] text-slate-900 selection:bg-gold-500 selection:text-forest-950 font-sans">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 md:pb-8">
        <Outlet />
      </main>
      <Footer />
      {/* Mobile Bottom Navigation Bar */}
      <BottomNav />
    </div>
  );
}
