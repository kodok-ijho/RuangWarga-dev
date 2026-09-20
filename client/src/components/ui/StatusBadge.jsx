import React, { useMemo } from 'react';

const STATUS_CONFIGS = {
  // Billing / Payment statuses
  paid: {
    label: 'Lunas',
    symbol: '✓',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  lunas: {
    label: 'Lunas',
    symbol: '✓',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  verified: {
    label: 'Terverifikasi',
    symbol: '✓',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  terverifikasi: {
    label: 'Terverifikasi',
    symbol: '✓',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  pending: {
    label: 'Menunggu',
    symbol: '•',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  pending_verification: {
    label: 'Verifikasi',
    symbol: '•',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  menunggu: {
    label: 'Menunggu',
    symbol: '•',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  unpaid: {
    label: 'Belum Bayar',
    symbol: '!',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  belum_bayar: {
    label: 'Belum Bayar',
    symbol: '!',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  rejected: {
    label: 'Ditolak',
    symbol: '×',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  ditolak: {
    label: 'Ditolak',
    symbol: '×',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  failed: {
    label: 'Gagal',
    symbol: '×',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  expired: {
    label: 'Kedaluwarsa',
    symbol: '×',
    style: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  partial: {
    label: 'Sebagian',
    symbol: '◐',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
  },

  // Subscription statuses
  active: {
    label: 'Aktif',
    symbol: '✓',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  aktif: {
    label: 'Aktif',
    symbol: '✓',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  trial: {
    label: 'Trial',
    symbol: '⏱',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  read_only: {
    label: 'Read-Only',
    symbol: '⊘',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  inactive: {
    label: 'Non-Aktif',
    symbol: '—',
    style: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  unavailable: {
    label: 'Belum Tersedia',
    symbol: '—',
    style: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  not_applicable: {
    label: 'Tidak Berlaku',
    symbol: '—',
    style: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export function StatusBadge({ status, customLabel, size = 'md', className = '' }) {
  const normalizedKey = String(status || '').toLowerCase().trim();
  const config = STATUS_CONFIGS[normalizedKey] || {
    label: customLabel || status || '—',
    symbol: '•',
    style: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const displayText = customLabel || config.label;
  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border tracking-wide select-none ${sizeClasses} ${config.style} ${className}`}
      title={displayText}
    >
      <span className="font-mono text-[11px] font-bold shrink-0" aria-hidden="true">
        {config.symbol}
      </span>
      <span>{displayText}</span>
    </span>
  );
}

export default StatusBadge;
