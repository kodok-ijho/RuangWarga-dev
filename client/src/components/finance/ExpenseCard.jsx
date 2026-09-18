import React from 'react';
import { AiOutlinePaperClip, AiOutlineEdit, AiOutlineDelete, AiOutlineInfoCircle } from 'react-icons/ai';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import Badge from '../ui/Badge';

/**
 * ExpenseCard
 * Touch-optimized mobile card for expense items.
 * Viewport < 768px. Touch target >= 44px.
 */
export default function ExpenseCard({
  expense,
  canEdit = false,
  onViewReceipt,
  onEdit,
  onDelete,
  onSelect,
}) {
  if (!expense) return null;

  const {
    category,
    amount,
    date,
    expense_date,
    description,
    recorded_by,
    scope = 'general',
    receipt_file,
  } = expense;

  const displayDate = date || expense_date;
  const initial = (category || 'P').charAt(0).toUpperCase();

  return (
    <div
      onClick={() => onSelect && onSelect(expense)}
      className={`group relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm ${
        onSelect ? 'cursor-pointer active:bg-slate-50/80' : ''
      }`}
    >
      {/* Baris Atas: Kategori, Scope, dan Nominal */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-forest-800 font-extrabold text-xs border border-slate-200 shadow-2xs">
            {initial}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-slate-900 text-sm truncate">
                {category}
              </h4>
              <Badge variant={scope === 'event' ? 'secondary' : 'default'} size="sm">
                {scope === 'event' ? '🎪 Event' : '🏡 Kas Umum'}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {formatDate(displayDate)}
              {recorded_by ? ` · Oleh: ${recorded_by}` : ''}
            </p>
          </div>
        </div>

        {/* Nominal pengeluaran */}
        <div className="text-right shrink-0">
          <span className="text-base font-extrabold text-rose-600 font-mono tabular-nums block">
            - {formatRupiah(amount)}
          </span>
        </div>
      </div>

      {/* Deskripsi */}
      {description && (
        <p className="text-xs text-slate-600 mt-2.5 line-clamp-2 bg-slate-50/60 p-2 rounded-lg border border-slate-100">
          {description}
        </p>
      )}

      {/* Baris Bawah: Aksi */}
      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        {/* Bukti kwitansi indicator / action */}
        {receipt_file ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewReceipt) onViewReceipt(expense);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-blue-700 hover:text-blue-800 font-semibold px-2 py-1 rounded-lg active:bg-blue-50 transition-colors"
            title="Lihat Nota / Kwitansi"
          >
            <AiOutlinePaperClip className="text-base" />
            <span>Bukti Kwitansi</span>
          </button>
        ) : (
          <span className="text-slate-400 italic text-[11px] flex items-center gap-1 min-h-[44px] py-1">
            Tanpa nota
          </span>
        )}

        {/* Aksi Edit & Hapus jika diizinkan */}
        {canEdit ? (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(expense);
                }}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Edit Pengeluaran"
                aria-label="Edit Pengeluaran"
              >
                <AiOutlineEdit className="text-base" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(expense);
                }}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                title="Hapus Pengeluaran"
                aria-label="Hapus Pengeluaran"
              >
                <AiOutlineDelete className="text-base" />
              </button>
            )}
          </div>
        ) : (
          onSelect && (
            <button
              type="button"
              onClick={() => onSelect(expense)}
              className="inline-flex min-h-[44px] items-center gap-1 text-slate-500 hover:text-slate-800 font-medium px-2 py-1"
            >
              <AiOutlineInfoCircle className="text-sm" />
              <span>Detail</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
