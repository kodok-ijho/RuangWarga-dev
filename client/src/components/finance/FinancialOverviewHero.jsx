import React from 'react';
import { AiOutlinePrinter, AiOutlineDownload, AiOutlineWallet, AiOutlineArrowUp, AiOutlineArrowDown } from 'react-icons/ai';
import AnimatedCounter from '../AnimatedCounter';
import { formatRupiah } from '../../services/dataHelpers';
import Button from '../ui/Button';

/**
 * FinancialOverviewHero
 * Level 1 financial hero component.
 * Memperlihatkan saldo berjalan, pemasukan (+), pengeluaran (-), dan saldo akhir secara jernih.
 */
export default function FinancialOverviewHero({
  openingBalance = 0,
  totalIncome = 0,
  totalExpense = 0,
  closingBalance = 0,
  periodLabel = '',
  onPrint,
  onExportCsv,
  isExporting = false,
  className = '',
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Saldo Kas Utama Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-forest-900 via-forest-800 to-forest-950 p-5 sm:p-6 text-white shadow-md border border-forest-700/50">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-gold-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-400/20 text-gold-400 text-sm">
                <AiOutlineWallet />
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase text-gold-400">
                Saldo Akhir Kas Komunitas
              </span>
              {periodLabel && (
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200">
                  {periodLabel}
                </span>
              )}
            </div>
            
            <div className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono tabular-nums">
              <AnimatedCounter
                value={closingBalance}
                formatter={(v) => formatRupiah(v)}
              />
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Saldo kas berjalan setelah perhitungan seluruh pemasukan dan pengeluaran.
            </p>
          </div>

          {/* Quick actions (Print / Export) */}
          {(onPrint || onExportCsv) && (
            <div className="no-print flex items-center gap-2 self-start sm:self-auto shrink-0">
              {onPrint && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3.5 py-2 text-xs font-semibold text-white border border-white/15 transition-all shadow-xs"
                  title="Cetak Laporan / Simpan PDF"
                >
                  <AiOutlinePrinter className="text-base text-gold-400" />
                  <span>PDF</span>
                </button>
              )}
              {onExportCsv && (
                <button
                  type="button"
                  onClick={onExportCsv}
                  disabled={isExporting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-forest-950 font-bold px-3.5 py-2 text-xs transition-all shadow-xs disabled:opacity-50"
                  title="Unduh Data CSV"
                >
                  <AiOutlineDownload className="text-base" />
                  <span>{isExporting ? 'Mengekspor...' : 'Export CSV'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid 3 Kartu Arus Kas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Saldo Awal */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Saldo Awal</span>
            <span className="text-sm">🏦</span>
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 font-mono tabular-nums">
            <AnimatedCounter
              value={openingBalance}
              formatter={(v) => formatRupiah(v)}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Saldo awal periode berjalan</p>
        </div>

        {/* Pemasukan Kas */}
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <AiOutlineArrowUp className="text-emerald-600" /> Total Pemasukan
            </span>
            <span className="text-xs font-bold rounded-md bg-emerald-100/80 text-emerald-800 px-1.5 py-0.5">
              + Masuk
            </span>
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-emerald-700 font-mono tabular-nums">
            + <AnimatedCounter
              value={totalIncome}
              formatter={(v) => formatRupiah(v)}
            />
          </div>
          <p className="text-[11px] text-emerald-700/80 mt-1">Akumulasi IPL & Non-IPL</p>
        </div>

        {/* Pengeluaran Kas */}
        <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between text-rose-800 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <AiOutlineArrowDown className="text-rose-600" /> Total Pengeluaran
            </span>
            <span className="text-xs font-bold rounded-md bg-rose-100/80 text-rose-800 px-1.5 py-0.5">
              - Keluar
            </span>
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-rose-600 font-mono tabular-nums">
            - <AnimatedCounter
              value={totalExpense}
              formatter={(v) => formatRupiah(v)}
            />
          </div>
          <p className="text-[11px] text-rose-700/80 mt-1">Biaya operasional & event</p>
        </div>
      </div>
    </div>
  );
}
