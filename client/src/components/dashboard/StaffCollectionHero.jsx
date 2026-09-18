import React from 'react';
import { Card, Button, StatusBadge } from '../ui';
import { formatRupiah } from '../../services/dataHelpers';
import AnimatedCounter from '../AnimatedCounter';
import { AiOutlineArrowRight, AiOutlineCheckCircle, AiOutlineTable, AiOutlineUserAdd } from 'react-icons/ai';

export function StaffCollectionHero({
  billing = {
    totalBilled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    billCount: 0,
    collectionRate: 0,
  },
  pendingPayCount = 0,
  pendingRegCount = 0,
  periodLabel = 'Bulan Ini',
  template,
  onOpenMatrix,
  onOpenVerification,
  onOpenApproval,
  className = '',
}) {
  const collectionRate = Math.min(Math.max(billing.collectionRate || 0, 0), 100);
  const billLabel = template?.billLabel || 'Iuran';
  const memberLabel = template?.memberLabel || 'Warga';

  return (
    <Card padding="lg" className={`border-slate-200/90 shadow-sm ${className}`}>
      <div className="space-y-5">
        {/* Top Row: Judul & Status Keterkumpulan */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-label-caps">Ringkasan Kolektibilitas</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-700">{periodLabel}</span>
            </div>
            <h2 className="text-title-section mt-1">
              Penerimaan Tagihan {billLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenMatrix}
              icon={AiOutlineTable}
              className="text-xs font-bold"
            >
              <span>Buka Matriks</span>
              <AiOutlineArrowRight />
            </Button>
          </div>
        </div>

        {/* Middle Row: Angka Kunci & Progress Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Rate % */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium block">Tingkat Terbayar</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-mono font-black text-forest-950">
                <AnimatedCounter value={collectionRate} formatter={(v) => `${v.toFixed(0)}%`} />
              </span>
              <span className="text-xs text-slate-500">
                ({billing.billCount} {template?.unitLabel?.toLowerCase() || 'unit'} terdaftar)
              </span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 mt-2.5 overflow-hidden" role="progressbar" aria-valuenow={collectionRate} aria-valuemin="0" aria-valuemax="100">
              <div
                className="bg-forest-800 h-2 rounded-full transition-all duration-500"
                style={{ width: `${collectionRate}%` }}
              />
            </div>
          </div>

          {/* Nominal Terkumpul */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
            <span className="text-xs text-emerald-800 font-medium block">Total Terkumpul</span>
            <div className="text-xl sm:text-2xl font-mono font-black text-emerald-800 mt-1">
              <AnimatedCounter value={billing.totalCollected} formatter={formatRupiah} />
            </div>
            <span className="text-[11px] text-emerald-700/80 mt-1 block">
              dari target {formatRupiah(billing.totalBilled)}
            </span>
          </div>

          {/* Tunggakan Belum Bayar */}
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80">
            <span className="text-xs text-amber-800 font-medium block">Belum Terbayar</span>
            <div className="text-xl sm:text-2xl font-mono font-black text-amber-800 mt-1">
              <AnimatedCounter value={billing.totalOutstanding} formatter={formatRupiah} />
            </div>
            <span className="text-[11px] text-amber-700/80 mt-1 block">
              {billing.totalOutstanding > 0 ? 'Perlu pengingat iuran' : 'Nihil tunggakan'}
            </span>
          </div>
        </div>

        {/* Bottom Row: Tindakan Mendesak yang Menunggu Verifikasi */}
        {(pendingPayCount > 0 || pendingRegCount > 0) && (
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">Tindakan Mendesak:</span>

            {pendingPayCount > 0 && (
              <button
                type="button"
                onClick={onOpenVerification}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100/80 hover:bg-emerald-200/80 text-emerald-900 border border-emerald-300/80 text-xs font-bold transition shadow-xs"
              >
                <AiOutlineCheckCircle className="text-sm text-emerald-700" />
                <span>{pendingPayCount} Bukti Bayar Perlu Diverifikasi →</span>
              </button>
            )}

            {pendingRegCount > 0 && (
              <button
                type="button"
                onClick={onOpenApproval}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200/80 text-amber-900 border border-amber-300/80 text-xs font-bold transition shadow-xs"
              >
                <AiOutlineUserAdd className="text-sm text-amber-700" />
                <span>{pendingRegCount} Permohonan {memberLabel} Baru →</span>
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default StaffCollectionHero;
