import React from 'react';
import { Button } from '../ui';
import { formatRupiah } from '../../services/dataHelpers';
import AnimatedCounter from '../AnimatedCounter';
import { AiOutlineArrowRight, AiOutlineTable } from 'react-icons/ai';

/**
 * StaffCollectionHero
 *
 * Operational summary hero for Staff Dashboard.
 * Focuses on collection rate, targets, and outstanding dues.
 */
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
  className = '',
}) {
  const collectionRate = Math.min(Math.max(billing.collectionRate || 0, 0), 100);
  const billLabel = template?.billLabel || 'Iuran';
  const unitLabel = template?.unitLabel || 'Unit';
  const memberLabel = template?.memberLabel || 'Warga';

  return (
    <div className={`rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 space-y-5 ${className}`}>
      {/* Top Row: Judul & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Ringkasan Kolektibilitas
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-semibold text-slate-700">{periodLabel}</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
            Penerimaan Tagihan {billLabel}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenMatrix}
            icon={AiOutlineTable}
            className="text-xs font-bold min-h-[40px]"
          >
            <span>Buka Matriks</span>
            <AiOutlineArrowRight />
          </Button>
        </div>
      </div>

      {/* Middle Row: 3 Kolom Metrik */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 items-stretch">
        {/* Kolom 1: Tingkat Terbayar & Progress */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Tingkat Terbayar</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-mono font-black text-slate-900">
                <AnimatedCounter value={collectionRate} formatter={(v) => `${v.toFixed(0)}%`} />
              </span>
              <span className="text-xs text-slate-500">
                ({billing.billCount} {unitLabel.toLowerCase()} terdaftar)
              </span>
            </div>
          </div>
          {/* Progress Bar */}
          <div
            className="w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden"
            role="progressbar"
            aria-valuenow={collectionRate}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Persentase tagihan terbayar"
          >
            <div
              className="bg-slate-900 h-2 rounded-full transition-all duration-500"
              style={{ width: `${collectionRate}%` }}
            />
          </div>
        </div>

        {/* Kolom 2: Total Terkumpul */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Total Terkumpul</span>
            <div className="text-xl sm:text-2xl font-mono font-black text-emerald-700 mt-1">
              <AnimatedCounter value={billing.totalCollected} formatter={formatRupiah} />
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2 block">
            dari target {formatRupiah(billing.totalBilled)}
          </span>
        </div>

        {/* Kolom 3: Belum Terbayar (Outstanding) */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Belum Terbayar</span>
            <div
              className={`text-xl sm:text-2xl font-mono font-black mt-1 ${
                billing.totalOutstanding > 0 ? 'text-amber-700' : 'text-slate-700'
              }`}
            >
              <AnimatedCounter value={billing.totalOutstanding} formatter={formatRupiah} />
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2 block">
            {billing.totalOutstanding > 0 ? 'Perlu tindak lanjut / pengingat' : 'Nihil tunggakan'}
          </span>
        </div>
      </div>

      {/* Pending status footer */}
      {(pendingPayCount > 0 || pendingRegCount > 0) && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5 text-xs">
          {pendingPayCount > 0 && (
            <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg">
              {pendingPayCount} Bukti Bayar Perlu Diverifikasi
            </span>
          )}
          {pendingRegCount > 0 && (
            <span className="text-sky-800 font-semibold bg-sky-50 border border-sky-200/80 px-2.5 py-1 rounded-lg">
              {pendingRegCount} Permohonan {memberLabel} Baru
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default StaffCollectionHero;
