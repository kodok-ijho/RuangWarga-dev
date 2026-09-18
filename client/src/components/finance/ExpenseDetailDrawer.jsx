import React from 'react';
import { AiOutlinePaperClip, AiOutlineEdit, AiOutlineDelete, AiOutlineClose } from 'react-icons/ai';
import Drawer from '../ui/Drawer';
import DataRow from '../ui/DataRow';
import Badge from '../ui/Badge';
import { formatRupiah, formatDate } from '../../services/dataHelpers';

/**
 * ExpenseDetailDrawer
 * Level 3 progressive disclosure for an expense item.
 */
export default function ExpenseDetailDrawer({
  isOpen = false,
  onClose,
  expense,
  canEdit = false,
  onEdit,
  onDelete,
  onViewReceipt,
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
    event_id,
    receipt_file,
  } = expense;

  const displayDate = date || expense_date;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Rincian Pengeluaran Kas"
      size="md"
    >
      <div className="space-y-5">
        {/* Highlight Card */}
        <div className="rounded-2xl bg-rose-50/60 border border-rose-200/80 p-5 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
            Total Pengeluaran
          </span>
          <div className="text-3xl font-extrabold text-rose-600 mt-1 font-mono tabular-nums">
            - {formatRupiah(amount)}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">{category}</span>
            <Badge variant={scope === 'event' ? 'secondary' : 'default'} size="sm">
              {scope === 'event' ? '🎪 Event' : '🏡 Kas Umum'}
            </Badge>
          </div>
        </div>

        {/* Detail Rows */}
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          <DataRow label="Tanggal Transaksi" value={formatDate(displayDate)} />
          <DataRow label="Kategori" value={category} />
          <DataRow label="Lingkup Anggaran" value={scope === 'event' ? 'Kegiatan / Acara Warga' : 'Kas Umum Paguyuban'} />
          {event_id && <DataRow label="ID Kegiatan" value={event_id} />}
          <DataRow label="Dicatat Oleh" value={recorded_by || 'Bendahara'} />
          <DataRow
            label="Keterangan"
            value={<span className="text-right text-slate-700">{description || '-'}</span>}
          />
        </div>

        {/* Bukti Kwitansi / Nota */}
        {receipt_file && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AiOutlinePaperClip className="text-slate-500 text-lg" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Lampiran Nota / Kwitansi
                </span>
              </div>
              {onViewReceipt && (
                <button
                  type="button"
                  onClick={() => {
                    onViewReceipt(expense);
                  }}
                  className="rounded-lg bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-forest-800 shadow-xs transition-colors"
                >
                  Lihat Nota
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 truncate font-mono">
              {receipt_file}
            </p>
          </div>
        )}

        {/* Actions footer */}
        {canEdit && (
          <div className="pt-2 flex items-center gap-3">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(expense);
                }}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-sm shadow-xs transition-colors"
              >
                <AiOutlineEdit className="text-base" />
                <span>Edit Pengeluaran</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(expense);
                }}
                className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm transition-colors"
              >
                <AiOutlineDelete className="text-base" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
