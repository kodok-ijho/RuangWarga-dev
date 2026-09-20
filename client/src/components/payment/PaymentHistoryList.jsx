import React, { useState } from 'react';
import { Card, StatusBadge, Dialog, Button, EmptyState } from '../ui';
import { formatRupiah, formatDate, formatPeriod } from '../../services/dataHelpers';
import {
  AiOutlineHistory,
  AiOutlineFileText,
  AiOutlineCheckCircle,
  AiOutlineCloseCircle,
  AiOutlineEye,
  AiOutlineCreditCard,
  AiOutlineBank,
  AiOutlineDownload,
  AiOutlineClockCircle,
} from 'react-icons/ai';

/**
 * PaymentHistoryList (TASK-013 / Phase 6)
 *
 * Menampilkan riwayat pembayaran warga dengan pola progressive disclosure:
 * Tingkat 1: Daftar periode, tanggal, nominal, metode, dan status aktual.
 * Tingkat 2: Klik item membuka detail kuitansi, bukti transfer, dan info verifikasi.
 *
 * Standar Phase 6:
 * - Data correctness: Tanpa status default 'completed' (menggunakan actual pay.status / bill.status)
 * - Design system tokens: Neutral-first, zero forest-* hardcodes
 * - Aksesibilitas: Touch target >= 44px, status dapat dibedakan tanpa warna saja
 */
export function PaymentHistoryList({
  payments = [],
  bills = [],
  template = {},
  onDownloadReceipt,
  initialSelectedItem = null,
  className = '',
}) {
  const [selectedItem, setSelectedItem] = useState(initialSelectedItem);
  const billLabel = template?.billLabel || 'Tagihan';

  // Gabungkan payment dengan bill terkait jika ada (tanpa fake status default!)
  const historyItems = (payments || []).map((pay) => {
    const matchedBill = (bills || []).find(
      (b) => b.id === pay.bill_id || b.id === pay.billing_item_id || b.id === pay.ipl_bill_id || b.payment_id === pay.id
    );

    // BLOCKER 3: Status payment TIDAK BOLEH fallback ke matchedBill.status!
    // Transaksi pembayaran adalah riwayat transaksi, bukan riwayat tagihan.
    const actualStatus = pay.status || 'unspecified';

    const proofUrl = pay.proof_file_url || pay.receipt_file_url || pay.proof_url || pay.file_url || '';
    const proofFileName = pay.metadata?.proof_file_name || pay.proof_file_name || pay.receipt_file || (proofUrl ? `Bukti_Transfer_${pay.period || matchedBill?.period || 'file'}.jpg` : '');

    return {
      payment: pay,
      bill: matchedBill,
      id: pay.id || matchedBill?.id,
      period: pay.period || matchedBill?.period || '',
      amount: pay.amount !== undefined ? Number(pay.amount) : (matchedBill?.amount !== undefined ? Number(matchedBill.amount) : 0),
      status: actualStatus,
      method: pay.method || pay.payment_method || 'bank_transfer',
      paidAt: pay.paid_at || pay.created_at || matchedBill?.paid_at || null,
      verifiedAt: pay.verified_at || pay.metadata?.verified_at || null,
      verifiedBy: pay.verified_by || pay.metadata?.verified_by_name || pay.metadata?.verified_by || '',
      note: pay.note || pay.metadata?.note || '',
      proofUrl,
      proofFileName,
    };
  });

  const getMethodIcon = (method) => {
    if (method === 'qris') return <AiOutlineCreditCard className="text-slate-700" title="QRIS" />;
    if (method === 'bank_transfer') return <AiOutlineBank className="text-slate-700" title="Transfer Bank" />;
    return <span className="text-xs" title="Tunai / Kas">💵</span>;
  };

  const getMethodLabel = (method) => {
    if (method === 'qris') return 'QRIS';
    if (method === 'bank_transfer') return 'Transfer Bank';
    if (method === 'cash') return 'Tunai';
    return method || 'Lainnya';
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Riwayat Pembayaran {billLabel}
          </h3>
          <p className="text-[11px] text-slate-500">
            Daftar transaksi dan arsip bukti pembayaran yang telah Anda lakukan.
          </p>
        </div>
      </div>

      {historyItems.length === 0 ? (
        <Card padding="lg" className="border-slate-200/90 bg-white">
          <EmptyState
            icon={AiOutlineHistory}
            title="Belum Ada Riwayat Pembayaran"
            description={`Transaksi pembayaran ${billLabel.toLowerCase()} Anda akan tercatat secara rapi di sini.`}
          />
        </Card>
      ) : (
        <Card padding="none" className="border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {historyItems.map((item, idx) => (
              <div
                key={item.id || `hist-${idx}`}
                onClick={() => setSelectedItem(item)}
                className="p-3.5 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-3 group min-h-[44px]"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedItem(item);
                  }
                }}
                aria-label={`Rincian pembayaran periode ${item.period ? formatPeriod(item.period) : billLabel}, status ${item.status}`}
              >
                {/* Kolom Kiri: Ikon Metode & Detail Periode */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-700 flex items-center justify-center text-lg shrink-0 transition-colors">
                    {getMethodIcon(item.method)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 block truncate group-hover:text-slate-950">
                      {item.period ? formatPeriod(item.period) : `Tagihan ${billLabel}`}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate">
                      {item.paidAt ? formatDate(item.paidAt) : 'Tanggal tidak tercatat'} • {getMethodLabel(item.method)}
                    </span>
                  </div>
                </div>

                {/* Kolom Kanan: Nominal & Status */}
                <div className="text-right shrink-0 flex items-center gap-3">
                  <div>
                    <span className="text-xs sm:text-sm font-bold font-mono text-slate-900 block">
                      {formatRupiah(item.amount)}
                    </span>
                    <div className="mt-0.5 flex justify-end">
                      <StatusBadge status={item.status} size="xs" />
                    </div>
                  </div>
                  <div className="hidden sm:flex text-slate-400 group-hover:text-slate-700 text-base" aria-hidden="true">
                    <AiOutlineEye />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Progressive Disclosure: Dialog Detail Transaksi */}
      {selectedItem && (
        <Dialog
          open={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          title={`Detail Pembayaran ${billLabel}`}
          description={`Periode ${selectedItem.period ? formatPeriod(selectedItem.period) : '-'}`}
          size="md"
        >
          <div className="space-y-4">
            {/* Status & Nominal Highlight */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">
                  Nominal Dibayar
                </span>
                <span className="text-xl font-mono font-black text-slate-900 mt-0.5 block">
                  {formatRupiah(selectedItem.amount)}
                </span>
              </div>
              <StatusBadge status={selectedItem.status} size="md" />
            </div>

            {/* Parameter Transaksi */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Metode Pembayaran:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  {getMethodIcon(selectedItem.method)}
                  {getMethodLabel(selectedItem.method)}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Tanggal Transaksi:</span>
                <span className="font-semibold text-slate-800">
                  {selectedItem.paidAt ? formatDate(selectedItem.paidAt) : '-'}
                </span>
              </div>

              {selectedItem.verifiedAt && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Diverifikasi Pada:</span>
                  <span className="font-semibold text-emerald-800">
                    {formatDate(selectedItem.verifiedAt)}
                  </span>
                </div>
              )}

              {selectedItem.verifiedBy && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Verifikator:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedItem.verifiedBy}
                  </span>
                </div>
              )}

              {selectedItem.note && (
                <div className="py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 block mb-0.5">Catatan Pembayaran:</span>
                  <p className="p-2 rounded-lg bg-slate-50 text-slate-700 italic text-[11px]">
                    "{selectedItem.note}"
                  </p>
                </div>
              )}
            </div>

            {/* Bukti Transfer */}
            {selectedItem.proofUrl ? (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">
                  Lampiran Bukti Pembayaran:
                </span>
                <div className="p-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <AiOutlineFileText className="text-lg text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-700 truncate font-medium">
                      {selectedItem.proofFileName || `Bukti_Transfer_${selectedItem.period || 'file'}.jpg`}
                    </span>
                  </div>
                  <a
                    href={selectedItem.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 hover:text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs min-h-[36px]"
                  >
                    <span>Buka</span>
                  </a>
                </div>
              </div>
            ) : selectedItem.proofFileName ? (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">
                  Lampiran Bukti Pembayaran:
                </span>
                <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <AiOutlineFileText className="text-lg text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs text-slate-800 truncate font-medium block">
                        {selectedItem.proofFileName}
                      </span>
                      <span className="text-[11px] text-amber-800 block">
                        Bukti belum berhasil tersimpan di server
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Aksi Kuitansi */}
            <div className="pt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedItem(null)}
                className="flex-1 text-xs min-h-[44px]"
              >
                Tutup
              </Button>
              {onDownloadReceipt && (selectedItem.status === 'paid' || selectedItem.status === 'completed' || selectedItem.status === 'verified') && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={AiOutlineDownload}
                  onClick={() => onDownloadReceipt(selectedItem)}
                  className="flex-1 text-xs font-bold min-h-[44px]"
                >
                  Unduh Kuitansi
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default PaymentHistoryList;
