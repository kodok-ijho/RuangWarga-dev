import React, { useState, useEffect, useCallback } from 'react';
import {
  AiOutlineBell,
  AiOutlineCheckCircle,
  AiOutlineExclamationCircle,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { Card, Button, Badge } from './ui';
import {
  isPushSupported,
  isIosNonStandalone,
  getPushPermissionState,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushNotifications';

/**
 * PushNotificationCard (KOS-5.3b)
 *
 * Komponen kartu 'Notifikasi di perangkat ini' dengan tombol Aktifkan/Matikan dan status.
 * Mendukung mode standar (untuk halaman akun / profil) dan compact (untuk portal penyewa kos dekat banner tagihan).
 *
 * @param {boolean} compact - Bila true, tampil sebagai kartu ringkas dan otomatis sembunyi bila sudah aktif.
 * @param {string} className - Styling class tambahan.
 * @param {Function} onSubscribed - Callback saat langganan berhasil diaktifkan.
 * @param {Function} onUnsubscribed - Callback saat langganan berhasil dinonaktifkan.
 */
export function PushNotificationCard({
  compact = false,
  className = '',
  onSubscribed,
  onUnsubscribed,
}) {
  const [isSupported, setIsSupported] = useState(() => isPushSupported());
  const [isIosGuide, setIsIosGuide] = useState(() => isIosNonStandalone());
  const [permission, setPermission] = useState(() => getPushPermissionState());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const supported = isPushSupported();
      const ios = isIosNonStandalone();
      const perm = getPushPermissionState();

      setIsSupported(supported);
      setIsIosGuide(ios);
      setPermission(perm);

      if (supported) {
        const sub = await getCurrentSubscription();
        setIsSubscribed(Boolean(sub));
      } else {
        setIsSubscribed(false);
      }
    } catch {
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleToggle = async () => {
    setFeedback(null);

    // Jika sedang subscribe dan pengguna ingin mematikan
    if (isSubscribed) {
      setIsProcessing(true);
      try {
        const res = await unsubscribeFromPush();
        if (res.success) {
          setIsSubscribed(false);
          setPermission(getPushPermissionState());
          setFeedback({
            type: 'success',
            text: 'Notifikasi berhasil dinonaktifkan di perangkat ini.',
          });
          if (onUnsubscribed) onUnsubscribed();
        } else {
          setFeedback({
            type: 'error',
            text: res.message || 'Gagal menonaktifkan notifikasi.',
          });
        }
      } catch (err) {
        setFeedback({
          type: 'error',
          text: err?.message || 'Terjadi kesalahan saat mematikan notifikasi.',
        });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Jika izin ditolak oleh browser
    if (permission === 'denied') {
      const currentPerm = getPushPermissionState();
      setPermission(currentPerm);
      if (currentPerm === 'denied') {
        setFeedback({
          type: 'error',
          text: 'Izin notifikasi diblokir oleh browser. Buka Pengaturan Browser > Izin Situs untuk mengaktifkan notifikasi situs ini.',
        });
        return;
      }
    }

    // Aktifkan notifikasi
    setIsProcessing(true);
    try {
      const res = await subscribeToPush();
      if (res.success) {
        setIsSubscribed(true);
        setPermission(getPushPermissionState());
        setFeedback({
          type: 'success',
          text: 'Notifikasi pengingat berhasil diaktifkan di perangkat ini!',
        });
        if (onSubscribed) onSubscribed();
      } else {
        setPermission(getPushPermissionState());
        setFeedback({
          type: 'error',
          text: res.message || 'Gagal mengaktifkan notifikasi push.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat mengaktifkan notifikasi.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Dalam mode compact (portal penyewa kos):
  // Sembunyi bila notifikasi sudah aktif di perangkat ini
  if (compact && isSubscribed) {
    return null;
  }

  // --- TAMPILAN COMPACT (PORTAL PENYEWA KOS) ---
  if (compact) {
    return (
      <div
        data-testid="push-notification-compact-card"
        className={`rounded-xl border border-amber-200 bg-amber-50/50 p-3 sm:p-3.5 transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5" aria-hidden="true">
            <AiOutlineBell className="text-base" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900">
                Notifikasi di perangkat ini
              </span>
              {permission === 'denied' && (
                <Badge variant="rose" size="sm">Ditolak Browser</Badge>
              )}
              {!isSupported && !isIosGuide && (
                <Badge variant="slate" size="sm">Tidak Didukung</Badge>
              )}
              {isIosGuide && (
                <Badge variant="slate" size="sm">Perlu Layar Utama</Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              {permission === 'denied'
                ? 'Izin notifikasi diblokir browser. Buka pengaturan izin situs untuk mengizinkan.'
                : !isSupported && !isIosGuide
                  ? 'Browser atau perangkat ini tidak mendukung notifikasi push.'
                  : isIosGuide
                    ? 'Di iPhone/iPad: Tambahkan ke Layar Utama (Safari > Bagikan) untuk aktifkan.'
                    : 'Aktifkan notifikasi agar Anda tidak melewatkan pengingat sewa & tagihan.'}
            </p>
            {feedback && (
              <p
                className={`text-[11px] font-medium mt-1 ${
                  feedback.type === 'error' ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {feedback.text}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {permission === 'denied' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              disabled={isProcessing}
              data-testid="push-compact-toggle-btn"
              className="text-xs"
            >
              {isProcessing ? 'Memeriksa...' : 'Periksa Izin'}
            </Button>
          ) : !isSupported && !isIosGuide ? null : (
            <Button
              variant="neutral"
              size="sm"
              onClick={handleToggle}
              disabled={isProcessing || isIosGuide}
              data-testid="push-compact-toggle-btn"
              className="text-xs"
            >
              {isProcessing ? 'Mengaktifkan...' : 'Aktifkan'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- TAMPILAN STANDAR (HALAMAN AKUN / PROFIL) ---
  const isDenied = permission === 'denied';

  let statusBadge = (
    <Badge variant="amber" size="md" data-testid="push-status-badge">
      Belum Aktif
    </Badge>
  );

  if (isSubscribed) {
    statusBadge = (
      <Badge variant="emerald" size="md" data-testid="push-status-badge">
        Aktif
      </Badge>
    );
  } else if (isDenied) {
    statusBadge = (
      <Badge variant="rose" size="md" data-testid="push-status-badge">
        Ditolak Browser
      </Badge>
    );
  } else if (!isSupported) {
    statusBadge = (
      <Badge variant="slate" size="md" data-testid="push-status-badge">
        Tidak Didukung
      </Badge>
    );
  }

  return (
    <Card
      padding="lg"
      className={`border border-slate-200 bg-white shadow-xs ${className}`}
      data-testid="push-notification-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <AiOutlineBell className="text-xl" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Notifikasi di perangkat ini
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pengingat tagihan sewa, tanggal jatuh tempo, dan rincian denda
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? (
            <span className="text-xs text-slate-400">Memeriksa...</span>
          ) : (
            statusBadge
          )}
        </div>
      </div>

      <div className="py-3.5 space-y-3">
        {isSubscribed ? (
          <div className="flex items-start gap-2 text-xs text-slate-600 bg-emerald-50/40 border border-emerald-200/60 p-3 rounded-lg">
            <AiOutlineCheckCircle className="text-emerald-600 text-base shrink-0 mt-0.5" />
            <p>
              Notifikasi aktif di browser ini. Perangkat Anda akan menerima pengingat otomatis saat tagihan sewa mendekati jatuh tempo (H-3, H0) atau bila ada denda keterlambatan.
            </p>
          </div>
        ) : isDenied ? (
          <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50/50 border border-rose-200 p-3 rounded-lg">
            <AiOutlineExclamationCircle className="text-rose-600 text-base shrink-0 mt-0.5" />
            <p>
              Izin notifikasi diblokir oleh browser Anda. Untuk mengaktifkannya: buka Pengaturan Browser &gt; Pengaturan Situs (Site Permissions) &gt; Notifikasi &gt; Izinkan untuk situs ini, lalu klik tombol <strong>Periksa Izin</strong> di bawah.
            </p>
          </div>
        ) : !isSupported ? (
          <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 p-3 rounded-lg">
            <AiOutlineInfoCircle className="text-slate-500 text-base shrink-0 mt-0.5" />
            <p>
              {isIosGuide
                ? 'Di iPhone/iPad: Web Push Notification memerlukan tindakan Tambahkan ke Layar Utama (Add to Home Screen) melalui menu Bagikan di Safari terlebih dahulu.'
                : 'Browser atau perangkat ini tidak mendukung fitur Web Push Notifications.'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">
            Aktifkan notifikasi di perangkat ini agar Anda menerima pemberitahuan otomatis saat tagihan baru terbit, jatuh tempo hari ini, atau pengingat tunggakan sewa langsung di layar perangkat Anda tanpa harus membuka WhatsApp.
          </p>
        )}

        {feedback && (
          <div
            className={`p-2.5 rounded-lg text-xs font-medium ${
              feedback.type === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-400">
          Pengaturan ini hanya berlaku untuk browser pada perangkat ini.
        </span>

        {isSubscribed ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggle}
            disabled={isProcessing}
            data-testid="push-toggle-btn"
          >
            {isProcessing ? 'Menonaktifkan...' : 'Matikan'}
          </Button>
        ) : isDenied ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggle}
            disabled={isProcessing}
            data-testid="push-toggle-btn"
          >
            {isProcessing ? 'Memeriksa...' : 'Periksa Izin'}
          </Button>
        ) : !isSupported ? (
          <Button
            variant="outline"
            size="sm"
            disabled
            data-testid="push-toggle-btn"
          >
            Tidak Didukung
          </Button>
        ) : (
          <Button
            variant="neutral"
            size="sm"
            onClick={handleToggle}
            disabled={isProcessing}
            data-testid="push-toggle-btn"
          >
            {isProcessing ? 'Mengaktifkan...' : 'Aktifkan'}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default PushNotificationCard;
