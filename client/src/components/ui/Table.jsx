import React from 'react';
import { AiOutlineArrowUp, AiOutlineArrowDown } from 'react-icons/ai';

/**
 * Table Components (Phase 7 — Data-heavy Screens)
 *
 * Komponen tabel operasional semantic (HTML5 <table>, <thead>, <tbody>, <tr>, <th>, <td>)
 * dengan dukungan sortable columns, alignment numerik rapi, sticky header opsional,
 * dan visual minimalis modern.
 */

export function Table({ children, className = '', containerClassName = '' }) {
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs ${containerClassName}`}>
      <div className="overflow-x-auto">
        <table className={`w-full text-left border-collapse text-xs sm:text-sm ${className}`}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({ children, className = '' }) {
  return (
    <thead className={`bg-slate-50/95 border-b border-slate-200 text-slate-700 select-none ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = '' }) {
  return (
    <tbody className={`divide-y divide-slate-100 bg-white ${className}`}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = '', isClickable = false, ...props }) {
  return (
    <tr
      className={`transition-colors ${
        isClickable
          ? 'hover:bg-slate-50/80 cursor-pointer focus:outline-hidden focus:bg-slate-100/90'
          : 'hover:bg-slate-50/40'
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  children,
  sortable = false,
  sortKey = '',
  currentSortKey = '',
  currentSortDirection = 'asc',
  sorted = null,
  onSort,
  align = 'left',
  className = '',
}) {
  const isSorted = sortable && (sorted ? true : (Boolean(sortKey) && currentSortKey === sortKey));
  const effectiveDirection = sorted || currentSortDirection;
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (!sortable) {
    return (
      <th scope="col" className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-700 ${alignClass} ${className}`}>
        {children}
      </th>
    );
  }

  const handleSort = () => {
    if (!onSort) return;
    if (!isSorted) {
      onSort(sortKey, 'asc');
    } else if (effectiveDirection === 'asc') {
      onSort(sortKey, 'desc');
    } else {
      onSort(sortKey, 'asc');
    }
  };

  return (
    <th scope="col" className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-700 ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={handleSort}
        className={`group inline-flex items-center gap-1.5 hover:text-slate-950 focus:outline-hidden ${
          align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''
        }`}
        aria-label={`Urutkan berdasarkan ${typeof children === 'string' ? children : sortKey}, saat ini ${
          isSorted ? (effectiveDirection === 'asc' ? 'naik' : 'turun') : 'tidak diurutkan'
        }`}
      >
        <span>{children}</span>
        <span className="flex flex-col text-[10px] text-slate-400 group-hover:text-slate-700">
          {isSorted ? (
            effectiveDirection === 'asc' ? (
              <AiOutlineArrowUp className="text-slate-900 font-bold" />
            ) : (
              <AiOutlineArrowDown className="text-slate-900 font-bold" />
            )
          ) : (
            <span className="opacity-40 group-hover:opacity-100">↕</span>
          )}
        </span>
      </button>
    </th>
  );
}

export function TableCell({ children, align = 'left', className = '', ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <td className={`px-4 py-3 text-slate-800 ${alignClass} ${className}`} {...props}>
      {children}
    </td>
  );
}

export default Table;
