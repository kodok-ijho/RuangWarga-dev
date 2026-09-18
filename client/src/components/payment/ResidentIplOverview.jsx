import React from 'react';
import { Card, Button, StatusBadge } from '../ui';
import { formatRupiah, formatPeriod } from '../../services/dataHelpers';
import {
  AiOutlineCreditCard,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineExclamationCircle,
  AiOutlineArrowRight,
} from 'react-icons/ai';

/**
 * ResidentIplOverview (TASK-011)
 * Komponen ringkasan tagihan IPL & status pembayaran utama untuk warga.
 * Memprioritaskan:
 * 1. Periode aktif
 * 2. Nominal tagihan
 * 3. Status tagihan (dengan teks dan simbol jelas)
 * 4. Aksi utama bayar langsung / lihat bukti
 * 5. Pilihan multi-bulan jika ada tunggakan
 */
export function ResidentIplOverview({
  unit,
  unpaidBills = [],
  currentPeriodBill = null,
  latestPayment = null,
  selectedBillIds = [],
  onToggleBillSelection,
  onSelectAllUnpaid,
  onPaySelected,
  onViewDetail,
  template = {},
  isReadOnly = false,
  className = '',
}) {
  const billLabel = template?.billLabel || 'IPL';
  const unitLabel = template?.unitLabel || 'Rumah';
  const payActionLabel = template?.paymentActionLabel || 'Bayar';

  const unitName = unit ? `${unit.block} no ${unit.unit_number}` : '';
  const currentStatus = currentPeriodBill?.status || (unpaidBills.length > 0 ? 'unpaid' : 'paid');

  const isCurrentPaid = currentStatus === 'paid' || currentStatus === 'lunas';
  const isCurrentPending = currentStatus === 'pending' || currentStatus === 'pending_verification';
  const isCurrentRejected = currentStatus === 'rejected';

  // Hitung total terpilih
  const selectedBills = unpaidBills.filter((b) => selectedBillIds.includes(b.id));
  const totalSelectedAmount = selectedBills.reduce((acc, b) => acc + (Number(b.amount || 0) + Number(b.late_fee || 0)), 0);

  // Status visual banner
  let statusBannerBg = 'border-gold-300 bg-gradient-to-br from-gold-50/60 via-white to-white';
  let statusIcon = <AiOutlineExclamationCircle className="text-amber-600 text-xl" />;
  let statusHeadline = `Tagihan ${billLabel} Belum Dibayar`;
  let statusDesc = `Silakan selesaikan pembayaran ${billLabel.toLowerCase()} Anda tepat waktu.`;

  if (isCurrentPaid && unpaidBills.length === 0) {
    statusBannerBg = 'border-emerald-300 bg-gradient-to-br from-emerald-50/60 via-white to-white';
    statusIcon = <AiOutlineCheckCircle className="text-emerald-600 text-xl" />;
    statusHeadline = `Semua Tagihan ${billLabel} Telah Lunas`;
    statusDesc = `Terima kasih! Tidak ada tagihan tertunggak untuk unit Anda.`;
  } else if (isCurrentPending) {
    statusBannerBg = 'border-orange-300 bg-gradient-to-br from-orange-50/60 via-white to-white';
    statusIcon = <AiOutlineClockCircle className="text-orange-600 text-xl" />;
    statusHeadline = `Pembayaran Sedang Diverifikasi`;
    statusDesc = `Bukti pembayaran telah terkirim dan sedang menunggu verifikasi oleh bendahara.`;
  } else if (isCurrentRejected) {
    statusBannerBg = 'border-rose-300 bg-gradient-to-br from-rose-50/60 via-white to-white';
    statusIcon = <AiOutlineExclamationCircle className="text-rose-600 text-xl" />;
    statusHeadline = `Pembayaran Ditolak`;
    statusDesc = `Bukti pembayaran sebelumnya ditolak. Silakan periksa catatan dan unggah ulang bukti yang valid.`;
  } else if (unpaidBills.length > 1) {
    statusHeadline = `Terdapat ${unpaidBills.length} Tagihan Belum Lunas`;
    statusDesc = `Tersedia opsi pembayaran sekaligus untuk beberapa periode sekaligus.`;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Primary Status Banner */}
      <Card padding="lg" className={`border-2 shadow-sm ${statusBannerBg}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Status Tagihan {billLabel}
              </span>
              <span className="text-slate-300">•</span>
              {unitName && (
                <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                  {unitLabel} {unitName}
                </span>
              )}
              <StatusBadge status={currentStatus} size="sm" />
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{statusIcon}</div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {statusHeadline}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-xl">
                  {statusDesc}
                </p>
              </div>
            </div>
          </div>

          {/* Kolom Kanan: Tombol Aksi Cepat */}
          <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2 shrink-0">
            {unpaidBills.length > 0 ? (
              <Button
                variant="primary"
                size="lg"
                icon={AiOutlineCreditCard}
                onClick={onPaySelected}
                disabled={isReadOnly || selectedBills.length === 0}
                className="font-extrabold text-sm shadow-md"
              >
                <span>{payActionLabel} ({selectedBills.length} Bulan)</span>
                <AiOutlineArrowRight />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="md"
                onClick={() => onViewDetail && onViewDetail(currentPeriodBill, latestPayment)}
                icon={AiOutlineCheckCircle}
                className="text-xs"
              >
                <span>Lihat Rincian Lunas</span>
              </Button>
            )}

            {isReadOnly && (
              <span className="text-[10px] text-rose-600 font-medium">
                Tenant dalam mode baca saja (read-only)
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* 2. Daftar Tagihan Belum Bayar (Quick Selector) jika ada */}
      {unpaidBills.length > 0 && (
        <Card padding="md" className="border-slate-200 shadow-card">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Pilih Periode Tagihan
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pilih tagihan yang ingin dibayar (pembayaran diutamakan dari periode tertua).
              </p>
            </div>
            {unpaidBills.length > 1 && (
              <button
                type="button"
                onClick={onSelectAllUnpaid}
                className="text-xs font-bold text-forest-800 hover:text-forest-900 underline"
              >
                {selectedBills.length === unpaidBills.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {unpaidBills.map((bill) => {
              const isSelected = selectedBillIds.includes(bill.id);
              const amountWithLateFee = Number(bill.amount || 0) + Number(bill.late_fee || 0);

              return (
                <div
                  key={bill.id}
                  onClick={() => onToggleBillSelection && onToggleBillSelection(bill.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-forest-700 bg-forest-50/50 shadow-xs ring-1 ring-forest-700'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // dikontrol oleh onClick div pembungkus
                      className="w-4 h-4 rounded text-forest-800 focus:ring-forest-700 border-slate-300 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {formatPeriod(bill.period)}
                      </span>
                      {bill.late_fee > 0 && (
                        <span className="text-[10px] text-amber-700 block">
                          Termasuk denda: {formatRupiah(bill.late_fee)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold font-mono text-slate-900 block">
                      {formatRupiah(amountWithLateFee)}
                    </span>
                    <StatusBadge status={bill.status || 'unpaid'} size="xs" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subtotal Footer */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">Total Dipilih:</span>
              <span className="text-xs font-bold text-slate-800 ml-1.5">
                {selectedBills.length} tagihan
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm sm:text-base font-black font-mono text-forest-950">
                {formatRupiah(totalSelectedAmount)}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default ResidentIplOverview;
