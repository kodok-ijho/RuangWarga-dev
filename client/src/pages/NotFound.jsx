import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="rounded-3xl bg-white border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs my-8">
      <p className="text-7xl font-extrabold text-slate-200 font-display tracking-tight">404</p>
      <h2 className="mt-3 text-xl font-bold text-slate-900 font-display">Halaman Tidak Ditemukan</h2>
      <p className="mt-2 text-sm text-slate-500">Halaman yang Anda cari tidak tersedia atau tautan sudah kedaluwarsa.</p>
      <Link
        to="/"
        className="pv-btn-primary mt-6 inline-flex items-center gap-2 px-5 py-2.5"
      >
        ← Kembali ke Beranda
      </Link>
    </div>
  );
}
