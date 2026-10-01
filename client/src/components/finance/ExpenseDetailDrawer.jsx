import React from 'react';
import { AiOutlinePaperClip, AiOutlineEdit, AiOutlineDelete } from 'react-icons/ai';
import Drawer from '../ui/Drawer';
import DataRow from '../ui/DataRow';
import Badge from '../ui/Badge';
import { formatRupiah, formatDate, formatDateTime } from '../../services/dataHelpers';

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
  eventOptions = [],
}) {
  if (!expense) return null;

  const {
    category,
    amount,
    date,
    expense_date,
    is_date_proxy,
    created_at,
    updated_at,
    description,
    recorded_by,
    scope = 'general',
    event_id,
    receipt_file,
  } = expense;

  // Canonical date takes precedence over legacy date fallback (F-05)
  const displayDate = expense_date || date;

  // Resolve human-readable event label if available (F-06)
  const matchedEvent = event_id && Array.isArray(eventOptions)
    ? eventOptions.find((ev) => ev.id === event_id)
    : null;
  const eventLabel = matchedEvent?.title || matchedEvent?.name || event_id;

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
          <DataRow
            label="Tanggal Transaksi"
            value={
              <div className="flex items-center gap-1.5 justify-end">
                <span>{formatDate(displayDate)}</span>
                {is_date_proxy && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Tanggal merupakan estimasi sistem">
                    Estimasi
                  </span>
                )}
              </div>
            }
          />
          <DataRow label="Kategori" value={category} />
          {/* Tenant-neutral budget scope label (F-02) */}
          <DataRow
            label="Lingkup Anggaran"
            value={scope === 'event' ? 'Kegiatan / Acara Komunitas' : 'Kas Umum Komunitas'}
          />
          {event_id && (
            <DataRow label="Kegiatan / Acara" value={eventLabel} />
          )}
          <DataRow label="Dicatat Oleh" value={recorded_by || '-'} />
          <DataRow
            label="Keterangan"
            value={
              <span className="text-right sm:max-w-xs break-words text-slate-700">
                {description || '-'}
              </span>
            }
          />
        </div>

        {/* Audit Trail & Sistem (F-03) */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Informasi Audit Sistem
            </span>
            {is_date_proxy && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                ⚠️ Tanggal Estimasi
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400">Waktu pencatatan sistem</span>
              <span className="font-mono text-slate-700">
                {created_at ? formatDateTime(created_at) : '-'}
              </span>
            </div>
            {updated_at && updated_at !== created_at && (
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-400">Terakhir diperbarui</span>
                <span className="font-mono text-slate-700">
                  {formatDateTime(updated_at)}
                </span>
              </div>
            )}
          </div>
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
                  className="rounded-lg bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:text-slate-900 shadow-xs transition-colors"
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
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-xs transition-colors"
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
