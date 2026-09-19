import React from 'react';

/**
 * ErrorBoundary — Menangkap error render React tak terduga dan mencegah layar putih (blank screen).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled application render error:', error, errorInfo);
  }

  handleReload = async () => {
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
    } catch (_e) {
      // ignore
    }
    window.location.reload();
  };

  handleReset = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
    } catch (_e) {
      // ignore
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 md:p-8 text-center shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-3xl mx-auto mb-4">
              ⚠️
            </div>
            <span className="text-[10px] font-bold tracking-widest text-amber-700 uppercase bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 inline-block mb-2">
              Terjadi Kendala Tampilan
            </span>
            <h1 className="text-xl font-bold text-slate-900 font-display mb-2">
              Halaman Mengalami Gangguan
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Sistem mendeteksi kendala pada sesi peramban Anda. Silakan muat ulang halaman atau kembali ke beranda untuk melanjutkan.
            </p>

            {this.state.error?.message && (
              <div className="text-left bg-rose-50 p-3.5 rounded-2xl border border-rose-200 text-[11px] text-rose-800 font-mono mb-6 overflow-x-auto">
                {String(this.state.error.message)}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs transition-all shadow-xs"
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors border border-slate-200 shadow-xs"
              >
                Reset Sesi &amp; Kembali ke Beranda
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
