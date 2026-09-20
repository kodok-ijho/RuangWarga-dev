import React from 'react';
import {
  AiOutlineDoubleLeft,
  AiOutlineLeft,
  AiOutlineRight,
  AiOutlineDoubleRight,
} from 'react-icons/ai';

/**
 * Pagination (Phase 7 — Data-heavy Screens)
 *
 * Komponen paginasi tenant-neutral dengan aksesibilitas tinggi (WCAG AA),
 * kontrol navigasi halaman (pertama, sebelumnya, nomor halaman, berikutnya, terakhir),
 * pemilih ukuran baris, dan touch target >= 44px untuk kenyamanan mobile.
 */
export function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = '',
}) {
  if (totalItems <= 0 && totalPages <= 1) {
    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-200 text-xs text-slate-600 select-none ${className}`} aria-label="Navigasi Halaman">
        <div className="text-center sm:text-left text-slate-500 font-medium">
          Menampilkan <span className="font-bold text-slate-900">0</span> data
        </div>
      </div>
    );
  }

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Kalkulasi nomor halaman dengan jendela sekitar halaman aktif
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-200 text-xs text-slate-600 select-none ${className}`} aria-label="Navigasi Halaman">
      {/* Ringkasan Jumlah Data */}
      <div className="text-center sm:text-left text-slate-500 font-medium">
        Menampilkan <span className="font-bold text-slate-900">{startItem}</span>–
        <span className="font-bold text-slate-900">{endItem}</span> dari{' '}
        <span className="font-bold text-slate-900">{totalItems}</span> data
      </div>

      {/* Kontrol Halaman & Pilihan Baris */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 mr-2">
            <label htmlFor="pagination-page-size" className="text-slate-500 text-[11px]">
              Baris:
            </label>
            <select
              id="pagination-page-size"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                if (onPageChange) onPageChange(1);
              }}
              className="h-11 sm:h-9 min-h-[44px] sm:min-h-[36px] px-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-300 pv-focus-ring"
              aria-label="Pilih jumlah baris per halaman"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1" role="navigation" aria-label="Navigasi Halaman">
          {/* Halaman Pertama */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange && onPageChange(1)}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-[32px] sm:min-w-[32px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors pv-focus-ring"
            title="Halaman Pertama"
            aria-label="Ke halaman pertama"
          >
            <AiOutlineDoubleLeft className="text-xs" />
          </button>

          {/* Halaman Sebelumnya */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange && onPageChange(currentPage - 1)}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-[32px] sm:min-w-[32px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors pv-focus-ring"
            title="Halaman Sebelumnya"
            aria-label="Ke halaman sebelumnya"
          >
            <AiOutlineLeft className="text-xs" />
          </button>

          {/* Nomor Halaman */}
          {pages.map((p) => {
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange && onPageChange(p)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Halaman ${p}`}
                className={`inline-flex h-11 min-w-[44px] sm:h-8 sm:min-w-[32px] px-2.5 items-center justify-center rounded-xl text-xs font-bold transition-colors pv-focus-ring ${
                  isActive
                    ? 'bg-slate-900 text-white border border-slate-900'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            );
          })}

          {/* Halaman Berikutnya */}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange && onPageChange(currentPage + 1)}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-[32px] sm:min-w-[32px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors pv-focus-ring"
            title="Halaman Berikutnya"
            aria-label="Ke halaman berikutnya"
          >
            <AiOutlineRight className="text-xs" />
          </button>

          {/* Halaman Terakhir */}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange && onPageChange(totalPages)}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-[32px] sm:min-w-[32px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors pv-focus-ring"
            title="Halaman Terakhir"
            aria-label="Ke halaman terakhir"
          >
            <AiOutlineDoubleRight className="text-xs" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Pagination;
