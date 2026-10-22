import React, { useState, useMemo } from 'react';
import {
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineUpload,
  AiOutlineWarning,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import Modal from '../Modal';
import { useTenant } from '../../context/TenantContext';
import { useToast } from '../../hooks/useToast';
import {
  submitMemberTransfer,
  getTenantBankAccount,
} from '../../services/tenantOperationalService';
import { formatRupiah, formatDate } from '../../services/dataHelpers';

/**
 * MemberBillPayModal (PANITIA-2.4)
 * Modal pembayaran tagihan/iuran oleh anggota via transfer bank.
 *
 * @param {object} props
 * @param {string} props.tenantId
 * @param {object} props.bill
 * @param {string} [props.title]
 * @param {Function} props.onClose
 * @param {Function} [props.onPaid]
 */
export default function MemberBillPayModal({
  tenantId,
  bill,
  title = 'Bayar Iuran',
  onClose,
  onPaid,
}) {
  const { activeTenant, activeMember } = useTenant();
  const toast = useToast();

  const [proofFile, setProofFile] = useState(null);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const tid = tenantId || activeTenant?.id;
  const tenantBankAccount = useMemo(() => {
    return getTenantBankAccount(activeTenant);
  }, [activeTenant]);

  const handleCopyAccount = async () => {
    if (!tenantBankAccount?.account_number) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(tenantBankAccount.account_number);
      }
      setIsCopied(true);
      toast.success('Nomor rekening disalin ke clipboard.');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.info(`Nomor rekening: ${tenantBankAccount.account_number}`);
    }
  };

  const handleFileChange = (e) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) {
      setProofFile(null);
      return;
    }

    // Validasi ukuran <= 5 MB (5 * 1024 * 1024)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file maksimal 5 MB.');
      setProofFile(null);
      e.target.value = '';
      return;
    }

    // Validasi ekstensi
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const name = file.name.toLowerCase();
    const hasValidExt = allowedExts.some((ext) => name.endsWith(ext));
    if (!hasValidExt) {
      setErrorMessage('Format file harus berupa JPG, PNG, WebP, atau PDF.');
      setProofFile(null);
      e.target.value = '';
      return;
    }

    setProofFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!proofFile) {
      const err = 'Bukti transfer wajib diunggah.';
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    if (!bill?.id) {
      toast.error('Data tagihan tidak valid.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitMemberTransfer(tid, {
        billId: bill.id,
        proofFile,
        note,
        memberId: activeMember?.id,
      });

      toast.success('Bukti transfer berhasil dikirim. Menunggu verifikasi bendahara.');
      if (onPaid) onPaid();
      if (onClose) onClose();
    } catch (err) {
      const msg = err.message || 'Gagal mengirim bukti pembayaran.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const programName = bill?.program?.name || bill?.metadata?.program_name;

  return (
    <Modal
      open={Boolean(bill)}
      onClose={() => !isSubmitting && onClose && onClose()}
      title={title}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Tagihan */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
          {programName && (
            <div className="text-xs font-semibold text-forest-700 dark:text-forest-400">
              Acara: {programName}
            </div>
          )}
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-500 dark:text-slate-400">Total Tagihan</span>
            <span className="text-base font-bold text-slate-900 dark:text-white">
              {formatRupiah(Number(bill?.amount || 0) + Number(bill?.late_fee || 0))}
            </span>
          </div>
          {bill?.due_date && (
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Jatuh Tempo</span>
              <span>{formatDate(bill.due_date)}</span>
            </div>
          )}
        </div>

        {/* Info Rekening Penerima */}
        {!tenantBankAccount ? (
          <div
            data-testid="no-bank-account-alert"
            className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300 text-xs flex items-start gap-2"
          >
            <AiOutlineWarning className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Rekening Belum Diisi</p>
              <p className="mt-0.5">Pengelola belum mengisi rekening penerima. Hubungi bendahara.</p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 space-y-1.5">
            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
              Rekening Transfer Pengelola:
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {tenantBankAccount.bank_name} - {tenantBankAccount.account_number}
              </div>
              <button
                type="button"
                onClick={handleCopyAccount}
                className="px-2 py-1 text-xs rounded bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 flex items-center gap-1 transition-colors"
                title="Salin Nomor Rekening"
              >
                {isCopied ? (
                  <>
                    <AiOutlineCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <AiOutlineCopy className="w-3.5 h-3.5" />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              a.n. <span className="font-medium">{tenantBankAccount.account_holder}</span>
            </div>
          </div>
        )}

        {/* Unggah Bukti */}
        <div>
          <label
            htmlFor="member-bill-proof"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
          >
            Unggah Bukti Transfer <span className="text-rose-500">*</span>
          </label>
          <input
            id="member-bill-proof"
            data-testid="proof-file-input"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileChange}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-300 cursor-pointer"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Format JPG, PNG, WebP, atau PDF (maks. 5 MB).
          </p>
        </div>

        {/* Catatan Tambahan */}
        <div>
          <label
            htmlFor="member-bill-note"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
          >
            Catatan (Opsional)
          </label>
          <input
            id="member-bill-note"
            type="text"
            placeholder="Contoh: Transfer via BCA a.n. Pengirim"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="pv-input w-full text-xs sm:text-sm"
          />
        </div>

        {/* Pesan Error */}
        {errorMessage && (
          <div
            data-testid="pay-error-alert"
            className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300 text-xs flex items-center gap-2"
          >
            <AiOutlineInfoCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tombol Aksi */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="pv-button-secondary text-xs sm:text-sm"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="pv-button-primary text-xs sm:text-sm flex items-center gap-1.5"
          >
            <AiOutlineUpload className="w-4 h-4" />
            <span>{isSubmitting ? 'Mengirim...' : 'Kirim Bukti Pembayaran'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
