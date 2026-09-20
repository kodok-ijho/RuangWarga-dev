import React, { useState } from 'react';
import { Dialog, Button } from '../ui';
import { formatRupiah, formatPeriod } from '../../services/dataHelpers';
import { compressImage } from '../../utils/imageCompressor';
import { IS_DEMO } from '../../services/dataService';
import {
  AiOutlineCreditCard,
  AiOutlineBank,
  AiOutlineCloudUpload,
  AiOutlineCheck,
  AiOutlineWarning,
  AiOutlineInfoCircle,
  AiOutlineClockCircle,
} from 'react-icons/ai';

/**
 * PaymentFlowModal (TASK-012 / Phase 6)
 * Modal alur pembayaran warga dengan validasi, kalkulasi biaya QRIS (MDR 0,7%),
 * upload bukti transfer dengan kompresi client-side, dan kepastian alur verifikasi.
 *
 * Standar Phase 6:
 * - Neutral-first design: bebas warna Palm Village hardcoded
 * - Kepastian status verifikasi: submit transfer berstatus pending, bukan optimistik lunas
 * - Aksesibilitas: touch target >= 44px
 */
export function PaymentFlowModal({
  open = true,
  bills = [],
  total = 0,
  canUseQris = true,
  billLabel = 'Tagihan',
  onConfirm,
  onClose,
}) {
  const [method, setMethod] = useState(canUseQris ? 'qris' : 'bank_transfer');
  const [receiptFile, setReceiptFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MAX_SIZE = 2 * 1024 * 1024;
  const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];
  const isMulti = bills.length > 1;

  // MDR QRIS 0.7% sesuai ketentuan BI
  const qrisFee = Math.ceil(total * 0.007);
  const totalWithQrisFee = total + qrisFee;

  const handleFile = async (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Format tidak didukung. Harap gunakan format JPG atau PNG.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi batas 2 MB.');
      setReceiptFile(null);
      e.target.value = '';
      return;
    }
    try {
      const compressed = await compressImage(file);
      setReceiptFile(compressed.file || file);
    } catch {
      setReceiptFile(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (method === 'bank_transfer' && !receiptFile) {
      setUploadError('Bukti transfer pembayaran wajib diunggah.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        method,
        note,
        receiptFile: IS_DEMO ? (receiptFile?.name || null) : receiptFile,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Konfirmasi Pembayaran ${billLabel}`}
      description={
        isMulti
          ? `Menyelesaikan ${bills.length} periode tagihan sekaligus.`
          : 'Pilih metode pembayaran yang Anda inginkan.'
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Ringkasan Tagihan */}
        <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/90 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Rincian Periode</span>
            <span>Nominal</span>
          </div>

          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 divide-y divide-slate-100">
            {bills.map((bill) => {
              const amountWithLateFee = Number(bill.amount || 0) + Number(bill.late_fee || 0);
              return (
                <div key={bill.id} className="flex justify-between text-xs pt-1.5 first:pt-0">
                  <span className="font-semibold text-slate-800">
                    {formatPeriod(bill.period)}
                    {bill.late_fee > 0 && (
                      <span className="text-[10px] text-amber-700 ml-1">(+Denda)</span>
                    )}
                  </span>
                  <span className="font-mono text-slate-700 font-medium">
                    {formatRupiah(amountWithLateFee)}
                  </span>
                </div>
              );
            })}
          </div>

          {method === 'qris' && (
            <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal {billLabel}:</span>
                <span className="font-mono">{formatRupiah(total)}</span>
              </div>
              <div className="flex justify-between text-amber-800 font-medium">
                <span className="flex items-center gap-1">
                  <span>Biaya Layanan QRIS (0,7%):</span>
                </span>
                <span className="font-mono">+ {formatRupiah(qrisFee)}</span>
              </div>
            </div>
          )}

          <div className="mt-2 pt-2.5 border-t border-slate-200 flex justify-between items-baseline">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              {method === 'qris' ? 'Total Bayar QRIS' : 'Total Tagihan'}
            </span>
            <span className="text-xl font-mono font-black text-slate-900">
              {formatRupiah(method === 'qris' ? totalWithQrisFee : total)}
            </span>
          </div>
        </div>

        {/* 2. Pilihan Metode Pembayaran */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Metode Pembayaran
          </label>
          <div className={`grid ${canUseQris ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5`}>
            {canUseQris && (
              <button
                type="button"
                onClick={() => {
                  setMethod('qris');
                  setUploadError('');
                  setReceiptFile(null);
                }}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all min-h-[44px] ${
                  method === 'qris'
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base text-slate-900"><AiOutlineCreditCard /></span>
                  {method === 'qris' && <AiOutlineCheck className="text-slate-900 text-xs font-bold" />}
                </div>
                <div className="mt-2">
                  <span className="text-xs font-bold text-slate-900 block">QRIS Otomatis</span>
                  <span className="text-[10px] text-slate-500 block">Instan &amp; terverifikasi</span>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMethod('bank_transfer');
                setUploadError('');
              }}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all min-h-[44px] ${
                method === 'bank_transfer'
                  ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900 shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base text-slate-900"><AiOutlineBank /></span>
                {method === 'bank_transfer' && <AiOutlineCheck className="text-slate-900 text-xs font-bold" />}
              </div>
              <div className="mt-2">
                <span className="text-xs font-bold text-slate-900 block">Transfer Bank</span>
                <span className="text-[10px] text-slate-500 block">Unggah bukti transfer</span>
              </div>
            </button>
          </div>
        </div>

        {/* 3. Detail Metode Tertentu */}
        {method === 'bank_transfer' && (
          <div className="space-y-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <AiOutlineClockCircle className="shrink-0 text-amber-700 text-sm" />
              <span>Bukti transfer akan diverifikasi oleh bendahara sebelum status tagihan dinyatakan Lunas.</span>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              Unggah Bukti Transfer <span className="text-rose-500">*</span>
            </label>
            <p className="text-[11px] text-slate-500">
              Transfer ke rekening pengelola/bendahara, lalu unggah foto struk ATM atau screenshot e-wallet/m-banking.
            </p>

            <div className="mt-1">
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 hover:border-slate-800 rounded-xl bg-white cursor-pointer transition-colors min-h-[44px]">
                <AiOutlineCloudUpload className="text-2xl text-slate-400 mb-1" />
                <span className="text-xs font-bold text-slate-900">
                  {receiptFile ? 'Ganti File Bukti' : 'Pilih File Bukti Transfer'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">JPG atau PNG, maks 2 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </div>

            {receiptFile && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                <AiOutlineCheck className="shrink-0" />
                <span className="truncate">{receiptFile.name}</span>
                <span className="text-[10px] text-emerald-600 shrink-0">
                  ({(receiptFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                <AiOutlineWarning className="shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {method === 'qris' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <AiOutlineInfoCircle className="text-sm shrink-0" />
              <span>Biaya Transaksi QRIS (MDR 0,7%)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              Sesuai ketentuan Bank Indonesia, pembayaran menggunakan kode QRIS dikenakan biaya administrasi 0,7% ({formatRupiah(qrisFee)}) yang ditambahkan langsung ke total pembayaran.
            </p>
          </div>
        )}

        {/* 4. Catatan Tambahan (Opsional) */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">
            Catatan Tambahan <span className="text-slate-400 font-normal">(opsional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 resize-none"
            placeholder="Contoh: Transfer atas nama Budi Santoso, Bank BCA..."
          />
        </div>

        {/* 5. Aksi Modal */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 text-xs min-h-[44px]"
          >
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="flex-1 text-xs font-bold min-h-[44px]"
          >
            {isSubmitting
              ? 'Memproses...'
              : method === 'qris'
              ? 'Lanjut ke QRIS →'
              : 'Kirim Bukti Transfer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default PaymentFlowModal;
