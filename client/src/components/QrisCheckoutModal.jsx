import { useState } from 'react';
import Modal from './Modal';
import { EmptyState } from './ui';
import { useToast } from '../hooks/useToast';
import { formatPeriodShort, formatRupiah, getQrisProviderLabel } from '../services/dataHelpers';
import { AiOutlineDownload } from 'react-icons/ai';

export default function QrisCheckoutModal({
  data,
  provider = 'doku',
  title = 'PEMBAYARAN QRIS RESMI',
  subtitle = 'PORTAL WARGA PALM VILLAGE',
  onConfirm,
  onCancel,
  onClose,
}) {
  const toast = useToast();
  const rawTotal = Number(data.total_amount || data.total || data.amount || 0);
  const baseAmount = Number(
    data.base_amount ??
    (data.qris_fee_amount ? rawTotal - Number(data.qris_fee_amount) : Math.round(rawTotal / 1.007))
  );
  const feeAmount = Number(
    data.qris_fee_amount ??
    (rawTotal > baseAmount ? rawTotal - baseAmount : Math.ceil(baseAmount * 0.007))
  );
  const total = Number(data.total_amount ?? (baseAmount + feeAmount));
  const orderId = data.parent_order_id || data.order_id || data.id || `TRX-QRIS-${Date.now()}`;
  const redirectUrl = data.redirect_url;
  
  // Konten QRIS aktual dari payment gateway (tanpa fallback string palsu)
  const qrContent = data.qr_content || data.qrContent || data.raw?.qrContent || null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleCancelAction = onCancel || onClose || (() => {});
  const handleConfirmAction = onConfirm || onClose || (() => {});

  const handleDone = async () => {
    setIsSubmitting(true);
    try {
      await handleConfirmAction();
    } finally {
      setIsSubmitting(false);
    }
  };

  const qrImageUrl = qrContent
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(qrContent)}`
    : null;

  const handleDownloadQris = async () => {
    if (!qrImageUrl) return;
    setIsDownloading(true);
    try {
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        qrImg.onload = resolve;
        qrImg.onerror = reject;
        qrImg.src = qrImageUrl;
      });

      const canvas = document.createElement('canvas');
      const width = 600;
      const height = 870;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Header Banner - Forest Green (#1a3d2e)
      ctx.fillStyle = '#1a3d2e';
      ctx.fillRect(0, 0, width, 120);

      // Gold Line Accent
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(0, 116, width, 4);

      // Title Text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(subtitle, width / 2, 48);

      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(title, width / 2, 82);

      // Order info box
      ctx.fillStyle = '#f4f7f4';
      ctx.fillRect(30, 135, width - 60, 140);
      ctx.strokeStyle = '#e2ebe2';
      ctx.lineWidth = 1;
      ctx.strokeRect(30, 135, width - 60, 140);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#4a5d4e';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`Order ID:`, 45, 162);
      ctx.fillText(`Nominal Pokok:`, 45, 188);
      ctx.fillText(`Biaya QRIS (0,7%):`, 45, 214);
      ctx.fillText(`Total Tagihan:`, 45, 242);
      ctx.fillText(`Keterangan:`, 45, 266);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#1a3d2e';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(String(orderId), width - 45, 162);

      ctx.fillStyle = '#374151';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(formatRupiah(baseAmount), width - 45, 188);

      ctx.fillStyle = '#b45309';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`+ ${formatRupiah(feeAmount)}`, width - 45, 214);

      ctx.fillStyle = '#1a3d2e';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(formatRupiah(total), width - 45, 242);

      let detailText = data.description || data.category || '-';
      if (data.bills?.length > 0) {
        detailText = (data.bills || [])
          .map((b) => formatPeriodShort(typeof b === 'object' ? b.period : b))
          .join(', ');
      }
      ctx.fillStyle = '#2d5a3f';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(detailText.slice(0, 35), width - 45, 266);

      // Draw QR Code
      const qrSize = 330;
      const qrX = (width - qrSize) / 2;
      const qrY = 295;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
      ctx.strokeStyle = '#d0ded0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // QRIS badge text
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1a3d2e';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('QRIS STANDAR PEMBAYARAN NASIONAL', width / 2, 665);

      // Footer Instructions box
      ctx.fillStyle = '#fffdfa';
      ctx.fillRect(30, 690, width - 60, 140);
      ctx.strokeStyle = '#faecd8';
      ctx.lineWidth = 1;
      ctx.strokeRect(30, 690, width - 60, 140);

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('💡 Cara Pembayaran dari Galeri HP:', width / 2, 715);

      ctx.fillStyle = '#78350f';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('1. Buka aplikasi BCA Mobile, Livin, GoPay, OVO, Dana, atau ShopeePay', width / 2, 738);
      ctx.fillText('2. Pilih menu "Scan QR" / "QRIS" lalu pilih "Upload QR dari Galeri"', width / 2, 758);

      ctx.fillStyle = '#9a3412';
      ctx.font = 'italic 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('* Total nominal sudah termasuk biaya layanan administrasi QRIS 0,7%', width / 2, 785);

      // Outer border
      ctx.strokeStyle = '#1a3d2e';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/png');
      const orderClean = String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `QRIS_PalmVillage_${orderClean}.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Gambar QRIS berhasil diunduh! Silakan buka M-Banking Anda dan upload dari Galeri.');
    } catch (err) {
      console.error('Failed to download QRIS image:', err);
      if (qrImageUrl) window.open(qrImageUrl, '_blank');
      toast.info('QRIS dibuka di tab baru. Anda dapat menyimpannya secara manual.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal open onClose={handleCancelAction} title="Menunggu Pembayaran QRIS" size="md">
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl font-bold">
          QR
        </div>
        <div>
          <h3 className="text-sm font-semibold text-forest-900">Scan QRIS Untuk Membayar</h3>
          <p className="text-xs text-forest-500 mt-1">
            Transaksi QRIS Anda telah berhasil dibuat. Silakan scan QR code di bawah:
          </p>
        </div>

        {qrImageUrl ? (
          <div className="flex flex-col items-center justify-center py-2 bg-white rounded-xl border border-forest-100 shadow-sm p-4">
            <img
              src={qrImageUrl}
              alt="QRIS Code"
              className="w-56 h-56 rounded-lg shadow-inner border border-gray-200"
            />
            <p className="text-[11px] text-forest-500 mt-2 font-medium">
              Arahkan kamera e-wallet / mobile banking ke QR Code di atas
            </p>

            {/* Tombol Unduh Gambar QRIS */}
            <div className="mt-3 w-full">
              <button
                type="button"
                onClick={handleDownloadQris}
                disabled={isDownloading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-forest-800 text-gold-400 font-semibold text-xs hover:bg-forest-700 active:scale-[0.99] transition shadow-sm disabled:opacity-50"
              >
                <AiOutlineDownload className="text-base" />
                {isDownloading ? 'Mengunduh QRIS...' : '📥 Unduh Gambar QRIS (Simpan ke HP)'}
              </button>
            </div>

            <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-left text-[11px] text-amber-900 w-full leading-relaxed">
              <p className="font-semibold text-amber-950 flex items-center gap-1">
                💡 Ingin Bayar di HP yang Sama?
              </p>
              <p className="mt-1">
                Klik tombol <strong>"Unduh Gambar QRIS"</strong> di atas, lalu buka aplikasi M-Banking / E-Wallet Anda (BCA, Livin, GoPay, Dana, dll.) dan pilih menu <strong>Scan QR → Upload dari Galeri</strong>.
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            icon="⚠️"
            title="Kode QRIS Tidak Tersedia"
            description="Konten kode QRIS tidak ditemukan dari data transaksi atau gagal dimuat dari gateway. Silakan coba kembali atau gunakan tautan pembayaran bila tersedia."
            className="border-red-200 bg-red-50/50 my-2"
          />
        )}

        {/* Ringkasan Nominal & Biaya QRIS */}
        <div className="rounded-lg bg-forest-50 p-3 text-left text-xs space-y-1.5 border border-forest-100">
          <div className="flex justify-between">
            <span className="text-forest-500">Order ID:</span>
            <span className="font-semibold text-forest-800">{orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-forest-500">Nominal Tagihan Pokok:</span>
            <span className="font-medium text-forest-800">{formatRupiah(baseAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-forest-500">Biaya Layanan QRIS (0,7%):</span>
            <span className="font-semibold text-amber-700">+ {formatRupiah(feeAmount)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-forest-200">
            <span className="font-bold text-forest-900">Total Pembayaran QRIS:</span>
            <span className="font-bold text-base text-emerald-800">{formatRupiah(total)}</span>
          </div>
          {data.category && (
            <div className="flex justify-between pt-1 text-[11px]">
              <span className="text-forest-500">Kategori / Tujuan:</span>
              <span className="font-semibold text-forest-800">{data.category}</span>
            </div>
          )}
          {data.bills?.length > 0 && (
            <div className="pt-1.5 border-t border-forest-200">
              <p className="text-forest-500 font-medium mb-1 text-[11px]">Tagihan Periode:</p>
              <div className="flex flex-wrap gap-1">
                {data.bills.map((b, idx) => {
                  const period = typeof b === 'object' ? b.period : b;
                  return (
                    <span key={typeof b === 'object' ? (b.id || idx) : idx} className="px-2 py-0.5 rounded bg-forest-100 text-forest-800 font-medium text-[11px]">
                      {formatPeriodShort(period)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Disclaimer Biaya QRIS */}
        <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-left text-amber-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-amber-950">
            <span>ℹ️</span> Disclaimer Biaya Administrasi QRIS (0,7%)
          </p>
          <p className="text-[11px] leading-relaxed text-amber-800">
            Sesuai regulasi Bank Indonesia (MDR QRIS) dan ketentuan payment gateway, transaksi QRIS dikenakan biaya administrasi <strong>0,7% ({formatRupiah(feeAmount)})</strong> yang dibebankan kepada pembayar.
          </p>
        </div>

        <div className="rounded-lg border border-gold-200 bg-gold-50 p-3.5 text-xs text-left text-gold-800">
          <p className="font-semibold">⚠️ Catatan Pembayaran:</p>
          <ul className="list-disc pl-4 mt-1 space-y-1">
            <li>Gunakan aplikasi e-wallet (GoPay, OVO, ShopeePay, Dana, LinkAja, BCA Mobile, dll.) untuk memindai QRIS.</li>
            <li>Setelah pembayaran berhasil di HP Anda, sistem akan mengonfirmasi otomatis.</li>
            <li>Klik tombol di bawah setelah selesai melakukan pembayaran di aplikasi Anda.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {redirectUrl && (
            <a
              href={redirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pv-btn-primary text-center py-2.5 font-bold shadow-md"
            >
              Buka Halaman Pembayaran 🔗
            </a>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleDone}
            className="pv-btn-primary w-full text-sm py-2.5 font-bold shadow-md disabled:opacity-50 mt-1"
          >
            {isSubmitting ? '🔄 Memproses Konfirmasi...' : '✓ Saya Sudah Selesai Membayar'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleCancelAction}
            className="w-full py-2 px-3 text-xs font-semibold text-forest-600 hover:text-red-600 hover:bg-red-50 rounded-lg border border-forest-200 transition"
          >
            ✕ Batalkan Pembayaran (Batal / Ganti Metode)
          </button>
        </div>
      </div>
    </Modal>
  );
}