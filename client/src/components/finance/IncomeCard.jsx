import React from 'react';
import { AiOutlineEye, AiOutlineCheck, AiOutlineClose, AiOutlineInfoCircle } from 'react-icons/ai';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import Badge from '../ui/Badge';
import StatusBadge from '../ui/StatusBadge';

/**
 * IncomeCard
 * Touch-optimized mobile card for non-IPL income transactions.
 * Viewport < 768px. Touch target >= 44px.
 */
export default function IncomeCard({
  income,
  canVerify = false,
  onViewReceipt,
  onApprove,
  onReject,
  onSelect,
}) {
  if (!income) return null;

  const {
    id,
    category,
    amount,
    income_date,
    source_name,
    payment_method,
    status = 'verified',
    description,
    rejection_reason,
    scope = 'general',
    receipt_file_url,
  } = income;

  const isPending = status === 'pending_verification';

  const getMethodBadge = (method) => {
    switch (method) {
      case 'qris':
        return <Badge variant="secondary" size="sm">📱 QRIS</Badge>;
      case 'bank_transfer':
        return <Badge variant="info" size="sm">🏦 Transfer</Badge>;
      case 'cash':
        return <Badge variant="warning" size="sm">💵 Tunai</Badge>;
      default:
        return <Badge variant="default" size="sm">Lainnya</Badge>;
    }
  };

  return (
    <div
      onClick={() => onSelect && onSelect(income)}
      className={`group relative rounded-2xl border p-4 shadow-xs transition-all hover:shadow-sm ${
        isPending
          ? 'border-amber-200/90 bg-amber-50/30'
          : 'border-slate-200/80 bg-white hover:border-slate-300'
      } ${onSelect ? 'cursor-pointer active:bg-slate-50/80' : ''}`}
    >
      {/* Baris Atas: Kategori, Scope, Status, dan Nominal */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-bold text-slate-900 text-sm truncate">
              {category}
            </h4>
            <Badge variant={scope === 'event' ? 'secondary' : 'default'} size="sm">
              {scope === 'event' ? '🎪 Event' : '🏡 Kas Umum'}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            <span className="font-semibold text-slate-800">{source_name}</span> · {formatDate(income_date)}
          </p>
        </div>

        {/* Nominal pemasukan */}
        <div className="text-right shrink-0">
          <span className="text-base font-extrabold text-emerald-700 font-mono tabular-nums block">
            + {formatRupiah(amount)}
          </span>
        </div>
      </div>

      {/* Baris Tengah: Status & Metode */}
      <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {getMethodBadge(payment_method)}
          <StatusBadge status={status} size="sm" />
        </div>
      </div>

      {/* Deskripsi & Catatan */}
      {description && (
        <p className="text-xs text-slate-600 mt-2 line-clamp-2 bg-slate-50/60 p-2 rounded-lg border border-slate-100">
          {description}
        </p>
      )}

      {/* Peringatan Alasan Penolakan jika Ditolak */}
      {rejection_reason && (
        <p className="text-xs text-rose-700 mt-2 bg-rose-50 p-2 rounded-lg border border-rose-200 font-medium">
          ⚠️ Alasan ditolak: {rejection_reason}
        </p>
      )}

      {/* Baris Bawah: Aksi */}
      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        {/* Tombol Bukti Pembayaran */}
        {receipt_file_url ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewReceipt) onViewReceipt(receipt_file_url);
            }}
            className="inline-flex min-h-[44px] items-center gap-1 text-blue-700 hover:text-blue-800 font-semibold px-2 py-1 rounded-lg active:bg-blue-50 transition-colors"
            title="Lihat Bukti Transfer"
          >
            <AiOutlineEye className="text-base" />
            <span>Lihat Bukti</span>
          </button>
        ) : (
          <span className="text-slate-400 italic text-[11px] min-h-[44px] flex items-center py-1">
            Tanpa bukti
          </span>
        )}

        {/* Action Verifikasi untuk Staf pada Transaksi Pending */}
        {isPending && canVerify ? (
          <div className="flex items-center gap-2">
            {onApprove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(income);
                }}
                className="min-h-[44px] px-3.5 inline-flex items-center gap-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors"
                title="Setujui Pembayaran"
              >
                <AiOutlineCheck className="text-sm" />
                <span>Terima</span>
              </button>
            )}
            {onReject && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(income);
                }}
                className="min-h-[44px] px-3 inline-flex items-center gap-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors"
                title="Tolak Pembayaran"
              >
                <AiOutlineClose className="text-sm" />
                <span>Tolak</span>
              </button>
            )}
          </div>
        ) : (
          onSelect && (
            <button
              type="button"
              onClick={() => onSelect(income)}
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
