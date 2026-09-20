import React from 'react';
import { Button, StatusBadge } from '../ui';
import { formatRupiah } from '../../services/dataHelpers';
import { AiOutlineArrowRight, AiOutlineCreditCard, AiOutlineCheckCircle } from 'react-icons/ai';

/**
 * ResidentBillingHero
 *
 * Current Obligation hero section for Citizen Dashboard.
 * Primary information hub following the 3-second rule.
 */
export function ResidentBillingHero({
  myBill,
  myUnit,
  periodLabel = 'Bulan Ini',
  template,
  onPayClick,
  isReadOnly = false,
  className = '',
}) {
  const billStatus = myBill?.status || 'unpaid';
  const amount = Number(myBill?.amount || 150000);
  const isPaid = billStatus === 'paid' || billStatus === 'lunas';
  const isPending = billStatus === 'pending' || billStatus === 'pending_verification';

  const billLabel = template?.billLabel || 'Iuran';
  const unitLabel = template?.unitLabel || 'Unit';
  const payActionLabel = template?.paymentActionLabel || 'Bayar';

  return (
    <div
      className={`rounded-2xl border bg-white p-5 sm:p-6 transition-all ${
        isPaid
          ? 'border-emerald-200/90'
          : isPending
          ? 'border-amber-200/90'
          : 'border-slate-200/90'
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        {/* Kolom Kiri: Status, Judul & Nominal */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {billLabel} {periodLabel}
            </span>
            <span className="text-slate-300">•</span>
            {myUnit && (
              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                {unitLabel} {myUnit}
              </span>
            )}
            <StatusBadge status={billStatus} size="sm" />
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 font-mono tracking-tight">
                {formatRupiah(amount)}
              </span>
              <span className="text-xs text-slate-500 font-medium">/ periode</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
              {isPaid
                ? `Terima kasih, pembayaran ${billLabel.toLowerCase()} Anda untuk periode ${periodLabel} telah lunas.`
                : isPending
                ? `Bukti pembayaran Anda telah dikirim dan sedang diverifikasi oleh bendahara.`
                : `Tagihan ${billLabel.toLowerCase()} periode ${periodLabel} belum terbayar. Silakan lakukan pembayaran tepat waktu.`}
            </p>
          </div>
        </div>

        {/* Kolom Kanan: Primary Action CTA */}
        <div className="sm:shrink-0 flex flex-col sm:items-end gap-2">
          {!isPaid && !isPending ? (
            <Button
              variant="primary"
              size="md"
              onClick={onPayClick}
              disabled={isReadOnly}
              icon={AiOutlineCreditCard}
              className="w-full sm:w-auto font-bold min-h-[44px]"
            >
              <span>
                {payActionLabel
                  ? (payActionLabel.toLowerCase().includes(billLabel.toLowerCase())
                      ? `${payActionLabel} Sekarang`
                      : `${payActionLabel} ${billLabel} Sekarang`)
                  : `Bayar ${billLabel} Sekarang`}
              </span>
              <AiOutlineArrowRight />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={onPayClick}
              icon={isPaid ? AiOutlineCheckCircle : undefined}
              className="w-full sm:w-auto text-xs min-h-[44px]"
            >
              <span>Lihat Rincian &amp; Riwayat</span>
              <AiOutlineArrowRight />
            </Button>
          )}

          {isReadOnly && (
            <span className="text-[11px] text-rose-600 font-medium text-center sm:text-right">
              Tenant dalam mode baca saja (read-only)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResidentBillingHero;
