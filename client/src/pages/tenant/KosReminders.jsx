import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AiOutlineWhatsApp,
  AiOutlineCloseCircle,
  AiOutlineReload,
  AiOutlineCalendar,
  AiOutlineHome,
  AiOutlineClockCircle,
  AiOutlineExclamationCircle,
  AiOutlineCheckCircle,
  AiOutlineArrowLeft,
  AiOutlineFileText,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useToast } from '../../context/ToastContext';
import { fetchTodayReminders, markRentReminder } from '../../services/tenant/collections';
import { formatRupiah, formatPeriod } from '../../services/dataHelpers';
import { getTenantBankAccount } from '../../services/tenant/settings';
import { buildBillReminderMessage, buildWaLink } from '../../utils/waReminder';
import PushNotificationCard from '../../components/PushNotificationCard';

/**
 * Pemetaan label dan warna tahap pengingat (KOS-5.2b).
 */
export const STAGE_CONFIG = {
  'h-3': {
    label: '3 hari lagi',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: AiOutlineClockCircle,
    desc: 'Pengingat H-3 sebelum jatuh tempo',
  },
  'h0': {
    label: 'Jatuh tempo hari ini',
    badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-300 font-bold',
    icon: AiOutlineCalendar,
    desc: 'Hari H jatuh tempo pembayaran',
  },
  'h+3': {
    label: 'Terlambat 3 hari',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    icon: AiOutlineExclamationCircle,
    desc: 'Tunggakan H+3',
  },
  'h+7': {
    label: 'Terlambat 7 hari',
    badgeClass: 'bg-red-100 text-red-900 border-red-400 font-bold',
    icon: AiOutlineExclamationCircle,
    desc: 'Tunggakan H+7 (peringatan keras)',
  },
};

export default function KosReminders() {
  const { tenantId } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { activeTenant, isOwner, hasPermission } = useTenant();
  const { canGenerateBilling } = useTenantAccess();

  const isAuthorized = Boolean(isOwner || activeTenant?.is_owner || hasPermission?.('generate_billing') || canGenerateBilling);

  const [processingId, setProcessingId] = useState(null);

  const {
    data: reminders = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['todayReminders', tenantId],
    queryFn: () => fetchTodayReminders(tenantId),
    enabled: Boolean(tenantId && isAuthorized),
  });

  const markMutation = useMutation({
    mutationFn: ({ id, status }) => markRentReminder(id, status),
    onMutate: ({ id }) => {
      setProcessingId(id);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['todayReminders', tenantId] });
      if (variables.status === 'sent') {
        toast.success('Pengingat WhatsApp berhasil dibuka dan ditandai terkirim.');
      } else {
        toast.info('Pengingat sewa berhasil dilewati.');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Gagal memperbarui status pengingat.');
    },
    onSettled: () => {
      setProcessingId(null);
    },
  });

  const handleSendWa = (reminder) => {
    if (!reminder.phone) {
      toast.warning('Nomor HP penyewa belum tersedia.');
      return;
    }

    const bankAccount = getTenantBankAccount(activeTenant);
    const appUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/t/${tenantId}`
        : `/t/${tenantId}`;

    const text = buildBillReminderMessage({
      residentName: reminder.residentName,
      billLabel: 'Sewa Kamar',
      unitLabel: 'Kamar',
      unitName: reminder.unit?.label || '',
      bills: [reminder.bill],
      bankAccount,
      appUrl,
      tenantName: activeTenant?.name || '',
    });

    const waUrl = buildWaLink(reminder.phone, text);

    // Buka WhatsApp di tab baru
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    // Tandai status pengingat sebagai 'sent'
    markMutation.mutate({ id: reminder.id, status: 'sent' });
  };

  const handleSkip = (reminder) => {
    markMutation.mutate({ id: reminder.id, status: 'skipped' });
  };

  if (!isAuthorized) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <AiOutlineExclamationCircle className="mx-auto text-4xl text-amber-600" />
          <h2 className="text-lg font-bold text-amber-900">Akses Terbatas</h2>
          <p className="text-sm text-amber-800 max-w-md mx-auto">
            Halaman Pengingat Hari Ini hanya dapat diakses oleh Pemilik Kos atau pengurus dengan izin penagihan (generate_billing).
          </p>
          <div className="pt-2">
            <Link to={`/t/${tenantId}/dashboard`} className="pv-btn-primary text-xs py-2 px-4">
              Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <Link to={`/t/${tenantId}/dashboard`} className="hover:text-slate-800 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-slate-800">Pengingat</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-forest-950 font-display flex items-center gap-2">
            <span>🔔</span> Pengingat Hari Ini
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Kirim pengingat sewa satu ketuk ke WhatsApp penyewa pada tahap H-3, hari H, H+3, dan H+7.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/t/${tenantId}/arrears`}
            className="pv-btn-ghost text-xs font-semibold py-2 px-3 border border-slate-200 flex items-center gap-1.5"
            title="Buka Laporan Tunggakan Kos"
          >
            <AiOutlineFileText className="text-sm text-slate-600" />
            <span>Lihat Tunggakan</span>
          </Link>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="pv-btn-ghost text-xs font-semibold py-2 px-3 border border-slate-200 flex items-center gap-1.5 disabled:opacity-50"
            title="Muat ulang antrean pengingat"
          >
            <AiOutlineReload className={`text-sm ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Kartu Notifikasi Push Ringkas (KOS-5F.2 Requirement 3) */}
      <PushNotificationCard compact />

      {/* State Loading */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat antrean pengingat">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
          ))}
        </div>
      )}

      {/* State Error */}
      {isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center space-y-3">
          <AiOutlineExclamationCircle className="mx-auto text-3xl text-rose-600" />
          <h3 className="text-sm sm:text-base font-bold text-rose-900">Gagal Memuat Pengingat</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error?.message || 'Terjadi kesalahan sistem.'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="pv-btn-primary text-xs py-2 px-4 shadow-xs"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* State Kosong (Semua Pengingat Selesai / Nihil) */}
      {!isLoading && !isError && reminders.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl">
            <AiOutlineCheckCircle />
          </div>
          <h3 className="text-base font-bold text-slate-900">Tidak Ada Pengingat Pending Hari Ini</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            Semua tagihan sewa yang jatuh tempo atau terlambat telah dikirimi pengingat atau belum memasuki jadwal pengingat (H-3, H0, H+3, H+7).
          </p>
          <div className="pt-2">
            <Link to={`/t/${tenantId}/payment-matrix`} className="pv-btn-primary text-xs py-2 px-4">
              Lihat Matriks Tagihan
            </Link>
          </div>
        </div>
      )}

      {/* Daftar Pengingat Pending */}
      {!isLoading && !isError && reminders.length > 0 && (
        <div className="space-y-3" data-testid="reminders-list">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Antrean Pengingat Hari Ini ({reminders.length})
            </span>
            <span className="text-xs text-slate-500">
              Disarankan kirim WA sebelum jam 17:00 WIB
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {reminders.map((reminder) => {
              const stageConfig = STAGE_CONFIG[reminder.stage] || {
                label: reminder.stage,
                badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
                icon: AiOutlineClockCircle,
              };
              const StageIcon = stageConfig.icon;
              const hasPhone = Boolean(reminder.phone && String(reminder.phone).trim());
              const isProcessing = processingId === reminder.id;
              const lateFee = Number(reminder.bill?.late_fee || 0);

              return (
                <div
                  key={reminder.id}
                  data-testid={`reminder-card-${reminder.id}`}
                  className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Kiri: Identitas Penyewa, Kamar, dan Tahap */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stageConfig.badgeClass}`}
                      >
                        <StageIcon className="text-xs" />
                        <span>{stageConfig.label}</span>
                      </span>

                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <AiOutlineHome className="text-slate-500" />
                        <span>{reminder.unit?.label || 'Kamar'}</span>
                      </span>

                      {reminder.bill?.period && (
                        <span className="text-[11px] font-medium text-slate-500">
                          Periode: {formatPeriod(reminder.bill.period)}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-slate-900 leading-tight">
                        {reminder.residentName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {hasPhone ? (
                          <span className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            📱 {reminder.phone}
                          </span>
                        ) : (
                          <span
                            data-testid="no-phone-badge"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
                          >
                            <AiOutlineExclamationCircle />
                            <span>Nomor HP belum ada</span>
                          </span>
                        )}

                        {reminder.bill?.due_date && (
                          <span className="text-[11px] text-slate-500">
                            Jatuh tempo: {reminder.bill.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tengah: Nominal Tagihan + Denda */}
                  <div className="md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 min-w-[160px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Total Tagihan
                    </span>
                    <span className="text-base sm:text-lg font-black font-mono text-forest-950 block">
                      {formatRupiah(reminder.totalDue)}
                    </span>
                    {lateFee > 0 ? (
                      <span className="text-[11px] text-amber-700 font-medium block">
                        Termasuk denda {formatRupiah(lateFee)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 block">
                        Tanpa denda
                      </span>
                    )}
                  </div>

                  {/* Kanan: Tombol Aksi */}
                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 shrink-0">
                    <button
                      type="button"
                      data-testid={`skip-btn-${reminder.id}`}
                      onClick={() => handleSkip(reminder)}
                      disabled={isProcessing}
                      className="pv-btn-ghost text-xs py-2 px-3 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors disabled:opacity-50"
                      title="Lewati pengingat ini tanpa mengirim WA"
                    >
                      <AiOutlineCloseCircle className="text-sm mr-1 inline" />
                      <span>Lewati</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`wa-btn-${reminder.id}`}
                      onClick={() => handleSendWa(reminder)}
                      disabled={!hasPhone || isProcessing}
                      className="pv-btn-primary text-xs py-2 px-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={hasPhone ? 'Kirim pengingat via WhatsApp' : 'Tidak dapat mengirim WA: nomor HP belum dicatat'}
                    >
                      <AiOutlineWhatsApp className="text-base" />
                      <span>{isProcessing ? 'Mengirim...' : 'Kirim WA'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
