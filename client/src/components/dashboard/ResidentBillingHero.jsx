import React from 'react';
import { Card, Button, StatusBadge } from '../ui';
import { formatRupiah } from '../../services/dataHelpers';
import { AiOutlineArrowRight, AiOutlineCheckCircle, AiOutlineCreditCard } from 'react-icons/ai';

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
  const amount = myBill?.amount || 150000;
  const isPaid = billStatus === 'paid' || billStatus === 'lunas';
  const isPending = billStatus === 'pending' || billStatus === 'pending_verification';

  const billLabel = template?.billLabel || 'Iuran';
  const unitLabel = template?.unitLabel || 'Unit';
  const payActionLabel = template?.paymentActionLabel || 'Bayar';

  return (
    <Card
      padding="lg"
      className={`border-2 ${
        isPaid
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/40 via-white to-white'
          : 'border-gold-400/80 bg-gradient-to-br from-gold-50/50 via-white to-white'
      } shadow-sm ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        {/* Kolom Kiri: Status & Tagihan */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 flex-wrap">
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
              <span className="text-2xl sm:text-3xl lg:text-4xl text-value-primary font-black text-slate-900">
                {formatRupiah(amount)}
              </span>
              <span className="text-xs text-slate-500 font-medium">/ periode</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isPaid
                ? `Terima kasih, pembayaran ${billLabel.toLowerCase()} Anda untuk periode ${periodLabel} telah lunas.`
                : isPending
                ? `Bukti transfer Anda telah dikirim dan sedang diverifikasi oleh bendahara.`
                : `Tagihan ${billLabel.toLowerCase()} periode ${periodLabel} belum terbayar. Silakan lakukan pembayaran tepat waktu.`}
            </p>
          </div>
        </div>

        {/* Kolom Kanan: Call to Action Utama */}
        <div className="sm:shrink-0 flex flex-col sm:items-end gap-2 pt-2 sm:pt-0">
          {!isPaid && !isPending ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onPayClick}
              disabled={isReadOnly}
              icon={AiOutlineCreditCard}
              className="w-full sm:w-auto font-extrabold text-sm shadow-md"
            >
              <span>{payActionLabel} {billLabel} Sekarang</span>
              <AiOutlineArrowRight />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={onPayClick}
              icon={isPaid ? AiOutlineCheckCircle : undefined}
              className="w-full sm:w-auto text-xs"
            >
              <span>Lihat Rincian &amp; Riwayat</span>
              <AiOutlineArrowRight />
            </Button>
          )}

          {isReadOnly && (
            <span className="text-[10px] text-rose-600 font-medium text-center sm:text-right">
              Tenant dalam mode baca saja (read-only)
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export default ResidentBillingHero;
