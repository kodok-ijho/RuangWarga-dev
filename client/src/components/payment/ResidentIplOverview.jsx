import React from 'react';
import { Card, Button, StatusBadge, SkeletonList } from '../ui';
import { formatRupiah, formatPeriod } from '../../services/dataHelpers';
import {
  AiOutlineCreditCard,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineExclamationCircle,
  AiOutlineArrowRight,
  AiOutlineInfoCircle,
  AiOutlineReload,
  AiOutlineHome,
} from 'react-icons/ai';

/**
 * ResidentIplOverview / CitizenBillingOverview (TASK-011 / Phase 6)
 *
 * Komponen ringkasan tagihan & status pembayaran utama untuk warga/anggota tenant.
 * Memprioritaskan:
 * 1. Financial data correctness (status dan nominal aktual, tanpa fake fallback)
 * 2. Isolasi tenant & kejelasan unit
 * 3. Pemisahan tegas: not_applicable / unavailable ≠ paid, unavailable ≠ unpaid
 * 4. Aksi bayar hanya jika ada kewajiban valid
 * 5. Pilihan multi-periode jika terdapat tunggakan
 * 6. Visual konsisten dengan Design System Phase 1-5 (neutral-first, restrained tenant accent)
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
  isLoading = false,
  isError = false,
  errorMessage = '',
  onRetry,
  className = '',
}) {
  const billLabel = template?.billLabel || 'Tagihan';
  const unitLabel = template?.unitLabel || 'Unit';
  const payActionLabel = template?.paymentActionLabel || 'Bayar';

  // 1. Resolusi label unit yang aman
  let unitName = '';
  if (typeof unit === 'string') {
    unitName = unit;
  } else if (unit && typeof unit === 'object') {
    if (unit.label) {
      unitName = unit.label;
    } else if (unit.block || unit.unit_number) {
      unitName = `${unit.block ? unit.block : ''} ${unit.unit_number ? `no ${unit.unit_number}` : ''}`.trim();
    }
  }

  // 2. State Loading
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`} aria-busy="true" aria-label="Memuat ringkasan tagihan">
        <Card padding="lg" className="border-slate-200/90 bg-white">
          <SkeletonList count={3} />
        </Card>
      </div>
    );
  }

  // 3. State Error
  if (isError) {
    return (
      <Card padding="lg" className={`border-rose-200 bg-rose-50/40 ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <AiOutlineExclamationCircle className="text-rose-600 text-xl shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-rose-900">
                Data pembayaran belum dapat dimuat
              </h3>
              <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                {errorMessage || 'Terjadi kesalahan saat mengambil rincian tagihan dari server. Silakan coba beberapa saat lagi.'}
              </p>
            </div>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="md"
              icon={AiOutlineReload}
              onClick={onRetry}
              className="shrink-0 min-h-[44px] text-xs font-semibold"
            >
              Coba Lagi
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // 4. State Unit Belum Terhubung
  if (!unit) {
    return (
      <Card padding="lg" className={`border-slate-200/90 bg-white shadow-xs ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <AiOutlineHome className="text-xl" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Status {unitLabel}
                </span>
                <StatusBadge status="unavailable" size="sm" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {unitLabel} belum terhubung
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                Akun Anda belum dikaitkan dengan {unitLabel.toLowerCase()} manapun pada tenant ini. Hubungi pengelola atau bendahara untuk menghubungkan data {unitLabel.toLowerCase()} Anda.
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // 5. Evaluasi Canonical Status secara ketat (Tanpa Fake Defaults!)
  // Priority: currentPeriodBill status -> unpaidBills status -> not_applicable
  let canonicalStatus = 'not_applicable';
  if (currentPeriodBill?.status) {
    canonicalStatus = currentPeriodBill.status;
  } else if (unpaidBills.length > 0) {
    canonicalStatus = 'unpaid';
  }

  const isCurrentPaid = canonicalStatus === 'paid' || canonicalStatus === 'lunas' || canonicalStatus === 'completed' || canonicalStatus === 'verified';
  const isCurrentPending = canonicalStatus === 'pending' || canonicalStatus === 'pending_verification';
  const isCurrentRejected = canonicalStatus === 'rejected';
  const isCurrentUnpaid = canonicalStatus === 'unpaid';
  const isNotApplicable = canonicalStatus === 'not_applicable' || canonicalStatus === 'none';
  const isUnavailable = canonicalStatus === 'unavailable';

  // Hitung total tagihan terpilih
  const selectedBills = unpaidBills.filter((b) => selectedBillIds.includes(b.id));
  const totalSelectedAmount = selectedBills.reduce(
    (acc, b) => acc + (Number(b.amount || 0) + Number(b.late_fee || 0)),
    0
  );

  // Styling banner status (Neutral-first, semantic accent)
  let statusBannerBg = 'border-slate-200/90 bg-white';
  let statusIcon = <AiOutlineInfoCircle className="text-slate-500 text-xl" />;
  let statusHeadline = `Tidak Ada Kewajiban Periode Ini`;
  let statusDesc = `Belum ada tagihan ${billLabel.toLowerCase()} yang diterbitkan untuk ${unitLabel.toLowerCase()} Anda pada periode aktif.`;

  if (isCurrentPaid && unpaidBills.length === 0) {
    statusBannerBg = 'border-emerald-200/90 bg-emerald-50/20';
    statusIcon = <AiOutlineCheckCircle className="text-emerald-600 text-xl" />;
    statusHeadline = `Semua Tagihan ${billLabel} Telah Lunas`;
    statusDesc = `Terima kasih! Tidak ada tagihan tertunggak untuk ${unitLabel.toLowerCase()} Anda.`;
  } else if (isCurrentPending) {
    statusBannerBg = 'border-amber-200/90 bg-amber-50/20';
    statusIcon = <AiOutlineClockCircle className="text-amber-600 text-xl" />;
    statusHeadline = `Pembayaran Sedang Diverifikasi`;
    statusDesc = `Bukti pembayaran telah terkirim dan sedang menunggu verifikasi oleh bendahara.`;
  } else if (isCurrentRejected) {
    statusBannerBg = 'border-rose-200/90 bg-rose-50/20';
    statusIcon = <AiOutlineExclamationCircle className="text-rose-600 text-xl" />;
    statusHeadline = `Pembayaran Ditolak`;
    statusDesc = `Bukti pembayaran sebelumnya ditolak. Silakan periksa catatan bendahara dan lakukan pelaporan ulang.`;
  } else if (isCurrentUnpaid) {
    statusBannerBg = 'border-amber-300/80 bg-amber-50/30';
    statusIcon = <AiOutlineExclamationCircle className="text-amber-700 text-xl" />;
    if (unpaidBills.length > 1) {
      statusHeadline = `Terdapat ${unpaidBills.length} Tagihan Belum Lunas`;
      statusDesc = `Tersedia opsi penyelesaian sekaligus untuk beberapa periode tagihan Anda.`;
    } else {
      statusHeadline = `Tagihan ${billLabel} Belum Dibayar`;
      statusDesc = `Silakan selesaikan pembayaran ${billLabel.toLowerCase()} Anda tepat waktu.`;
    }
  } else if (isUnavailable) {
    statusBannerBg = 'border-slate-200/90 bg-slate-50/40';
    statusIcon = <AiOutlineInfoCircle className="text-slate-500 text-xl" />;
    statusHeadline = `Data Tagihan Belum Tersedia`;
    statusDesc = `Rincian kewajiban ${billLabel.toLowerCase()} belum diterbitkan oleh sistem atau pengurus.`;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Primary Status Banner */}
      <Card padding="lg" className={`border shadow-xs transition-all ${statusBannerBg}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Status {billLabel}
              </span>
              <span className="text-slate-300" aria-hidden="true">•</span>
              {unitName && (
                <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md">
                  {unitName.toLowerCase().startsWith(unitLabel.toLowerCase()) ? unitName : `${unitLabel} ${unitName}`}
                </span>
              )}
              <StatusBadge status={canonicalStatus} size="sm" />
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0" aria-hidden="true">{statusIcon}</div>
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
                className="font-extrabold text-xs sm:text-sm shadow-sm min-h-[44px]"
              >
                <span>{payActionLabel} ({selectedBills.length} Bulan)</span>
                <AiOutlineArrowRight aria-hidden="true" />
              </Button>
            ) : isCurrentPending ? (
              <Button
                variant="outline"
                size="md"
                onClick={() => onViewDetail && onViewDetail(currentPeriodBill, latestPayment)}
                icon={AiOutlineClockCircle}
                className="text-xs min-h-[44px] font-semibold"
              >
                <span>Lihat Status Pembayaran</span>
              </Button>
            ) : isCurrentPaid ? (
              <Button
                variant="outline"
                size="md"
                onClick={() => onViewDetail && onViewDetail(currentPeriodBill, latestPayment)}
                icon={AiOutlineCheckCircle}
                className="text-xs min-h-[44px] font-semibold"
              >
                <span>Lihat Rincian Lunas</span>
              </Button>
            ) : null}

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
        <Card padding="md" className="border-slate-200/90 bg-white shadow-xs">
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
                className="text-xs font-bold text-slate-700 hover:text-slate-900 hover:underline min-h-[44px] inline-flex items-center px-2 py-1"
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
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 min-h-[44px] ${
                    isSelected
                      ? 'border-slate-900 bg-slate-50/80 shadow-xs ring-1 ring-slate-900'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // dikontrol oleh onClick wrapper
                      aria-label={`Pilih periode ${formatPeriod(bill.period)}`}
                      className="w-4 h-4 rounded text-slate-900 focus:ring-slate-800 border-slate-300 cursor-pointer"
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
                    <StatusBadge status={bill.status} size="xs" />
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
              <span className="text-sm sm:text-base font-black font-mono text-slate-900">
                {formatRupiah(totalSelectedAmount)}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// Alias export untuk nama generik
export const CitizenBillingOverview = ResidentIplOverview;

export default ResidentIplOverview;
