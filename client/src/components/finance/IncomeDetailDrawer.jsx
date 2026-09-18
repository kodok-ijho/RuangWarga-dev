import React from 'react';
import { AiOutlineEye, AiOutlineCheck, AiOutlineClose } from 'react-icons/ai';
import Drawer from '../ui/Drawer';
import DataRow from '../ui/DataRow';
import Badge from '../ui/Badge';
import StatusBadge from '../ui/StatusBadge';
import { formatRupiah, formatDate } from '../../services/dataHelpers';

/**
 * IncomeDetailDrawer
 * Level 3 progressive disclosure for non-IPL income transactions.
 */
export default function IncomeDetailDrawer({
  isOpen = false,
  onClose,
  income,
  canVerify = false,
  onApprove,
  onReject,
  onViewReceipt,
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

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Rincian Transaksi Pemasukan"
      size="md"
    >
      <div className="space-y-5">
        {/* Highlight Card */}
        <div className="rounded-2xl bg-emerald-50/60 border border-emerald-200/80 p-5 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            Nominal Pemasukan
          </span>
          <div className="text-3xl font-extrabold text-emerald-700 mt-1 font-mono tabular-nums">
            + {formatRupiah(amount)}
          </div>
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <Badge variant={scope === 'event' ? 'secondary' : 'default'} size="sm">
              {scope === 'event' ? '🎪 Event' : '🏡 Kas Umum'}
            </Badge>
            <StatusBadge status={status} size="sm" />
          </div>
        </div>

        {/* Data Detail Rows */}
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          <DataRow label="Tanggal Pembayaran" value={formatDate(income_date)} />
          <DataRow label="Kategori" value={category} />
          <DataRow label="Pembayar / Sumber" value={source_name} />
          <DataRow
            label="Metode Bayar"
            value={
              payment_method === 'qris'
                ? '📱 QRIS Palm Village'
                : payment_method === 'bank_transfer'
                ? '🏦 Transfer Bank'
                : '💵 Tunai'
            }
          />
          <DataRow label="Lingkup Anggaran" value={scope === 'event' ? 'Kegiatan / Event' : 'Kas Umum'} />
          <DataRow
            label="Keterangan"
            value={<span className="text-right text-slate-700">{description || '-'}</span>}
          />
        </div>

        {/* Alasan Penolakan */}
        {rejection_reason && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wide block">
              Catatan Penolakan
            </span>
            <p className="text-xs text-rose-700 mt-1">{rejection_reason}</p>
          </div>
        )}

        {/* Bukti Transfer */}
        {receipt_file_url && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Bukti Pembayaran / Transfer
              </span>
              {onViewReceipt && (
                <button
                  type="button"
                  onClick={() => onViewReceipt(receipt_file_url)}
                  className="rounded-lg bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-xs transition-colors"
                >
                  Buka Gambar Penuh
                </button>
              )}
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white flex justify-center p-2">
              <img
                src={receipt_file_url}
                alt="Bukti Transfer"
                className="max-h-52 object-contain rounded"
              />
            </div>
          </div>
        )}

        {/* Aksi Verifikasi untuk Staf */}
        {isPending && canVerify && (
          <div className="pt-2 flex items-center gap-3">
            {onApprove && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onApprove(income);
                }}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-xs transition-colors"
              >
                <AiOutlineCheck className="text-base" />
                <span>Terima & Verifikasi</span>
              </button>
            )}
            {onReject && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReject(income);
                }}
                className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm transition-colors"
              >
                <AiOutlineClose className="text-base" />
                <span>Tolak</span>
              </button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
