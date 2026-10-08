import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineArrowLeft,
  AiOutlineSafetyCertificate,
  AiOutlineThunderbolt,
  AiOutlineQrcode,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';

export default function SubscriptionCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { activeTenant, activeTenantId, isDemo, refreshTenant } = useTenant();
  const template = useTenantTemplate();

  const checkoutData = location.state || {};
  const tenantId = checkoutData.tenantId || activeTenantId;
  const tenantName = checkoutData.tenantName || activeTenant?.name || 'Komunitas Anda';
  const blocks10 = checkoutData.blocks10 ?? 1;
  const blocks5 = checkoutData.blocks5 ?? 1;
  const totalCapacity = checkoutData.totalCapacity ?? 15;
  const durationMonths = checkoutData.durationMonths ?? 12;
  const finalTotal = checkoutData.finalTotal ?? 120000;

  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [activating, setActivating] = useState(false);

  // Inisiasi pembayaran QRIS saat halaman dimuat
  useEffect(() => {
    let isCancelled = false;

    const initPayment = async () => {
      setLoading(true);

      if (isDemo) {
        // Mock payment di Demo mode
        setPaymentData({
          paymentId: `pay-mock-${Date.now()}`,
          gatewayRef: `MYR-DEMO-${Math.floor(Math.random() * 90000) + 10000}`,
          amount: finalTotal,
          paymentUrl: '#',
          qrisString: '00020101021126580014ID.LINKAJA.WWW0118936009140000000000',
        });
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('create-subscription-payment', {
          body: {
            tenantId,
            blocks10,
            blocks5,
            durationMonths,
          },
        });

        if (error) throw error;
        if (!isCancelled) {
          setPaymentData(data);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SubscriptionCheckout] Gagal membuat tagihan:', err);
        // Fallback simulated payment jika edge function belum live di server
        if (!isCancelled) {
          setPaymentData({
            paymentId: `sim-pay-${Date.now()}`,
            gatewayRef: `MYR-SIM-${Date.now().toString().slice(-6)}`,
            amount: finalTotal,
            paymentUrl: '#',
            qrisString: '00020101021126580014ID.LINKAJA.WWW0118936009140000000000',
          });
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    initPayment();
    return () => {
      isCancelled = true;
    };
  }, [tenantId, blocks10, blocks5, durationMonths, finalTotal, isDemo]);

  // Polling status pembayaran subscription_payments pada non-demo
  const paymentId = paymentData?.paymentId;
  const { data: paymentRecord } = useQuery({
    queryKey: ['subscription-payment-status', paymentId],
    queryFn: async () => {
      if (!paymentId) return null;
      const { data, error } = await supabase
        .from('subscription_payments')
        .select('status')
        .eq('id', paymentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !isDemo && Boolean(paymentId) && !isSuccess,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'settled' || status === 'failed' || status === 'expired') {
        return false;
      }
      return 5000;
    },
  });

  // Saat pembayaran terverifikasi settled di database, aktifkan sukses & refresh tenant
  useEffect(() => {
    if (!isDemo && paymentRecord?.status === 'settled' && !isSuccess) {
      setIsSuccess(true);
      toast.success('Pembayaran terverifikasi! Paket langganan berhasil diaktifkan.');
      refreshTenant();
    }
  }, [paymentRecord?.status, isDemo, isSuccess, refreshTenant, toast]);

  // Handler simulasi verifikasi pembayaran (hanya tersedia saat Demo mode)
  const handleSimulatePaymentSuccess = () => {
    if (!isDemo) return;
    setActivating(true);
    setTimeout(() => {
      setIsSuccess(true);
      setActivating(false);
      toast.success('Pembayaran QRIS berhasil! Layanan aktif selama ' + durationMonths + ' bulan.');
      refreshTenant();
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Tombol Navigasi */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <AiOutlineArrowLeft /> Kembali ke Pilihan Paket
        </button>

        {isSuccess ? (
          /* STATE SUKSES */
          <div className="bg-white border border-emerald-200 rounded-2xl p-8 text-center shadow-md space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-3xl mx-auto">
              <AiOutlineCheckCircle />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Pembayaran Terverifikasi
              </span>
              <h1 className="text-2xl font-bold text-slate-900 font-display mt-3">
                Langganan Berhasil Diaktifkan!
              </h1>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">
                Layanan <strong className="text-slate-900">{tenantName}</strong> kini berstatus{' '}
                <strong className="text-emerald-700">Aktif</strong> dengan kapasitas{' '}
                <strong className="text-slate-900 font-semibold">{totalCapacity} {template.unitLabel}</strong> selama{' '}
                <strong className="text-slate-900">{durationMonths} bulan</strong> ke depan.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate(`/t/${tenantId}/dashboard`)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all"
              >
                Buka Dashboard Layanan
              </button>
              <button
                type="button"
                onClick={() => navigate('/account/subscription')}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-colors"
              >
                Lihat Detail Status Langganan
              </button>
            </div>
          </div>
        ) : (
          /* STATE CHECKOUT QRIS */
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-md space-y-6">
            <div className="text-center space-y-1 pb-4 border-b border-slate-200">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold">
                <AiOutlineSafetyCertificate />
                <span>Mayar QRIS Resmi</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 font-display mt-2">
                Scan QRIS untuk Menyelesaikan Pembayaran
              </h1>
              <p className="text-xs text-slate-500">
                Layanan: <strong className="text-slate-900">{tenantName}</strong> &bull; Paket {durationMonths} Bulan
              </p>
            </div>

            {loading ? (
              <div className="py-16 text-center space-y-3">
                <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Menyiapkan QRIS pembayaran dari Mayar gateway...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* QR Code Container */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-slate-900 max-w-xs mx-auto shadow-inner space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-extrabold text-xs tracking-wider text-slate-800">QRIS STANDAR</span>
                    <span className="text-[10px] font-bold text-red-600">GPN</span>
                  </div>

                  {/* QR Visual Canvas / Placeholder */}
                  <div className="w-52 h-52 mx-auto bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center p-3 relative overflow-hidden shadow-xs">
                    <AiOutlineQrcode className="text-8xl text-slate-800" />
                    <span className="text-[9px] font-mono text-slate-500 mt-1">
                      {paymentData?.gatewayRef || 'MYR-QRIS-CODE'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-[11px] font-medium text-slate-600">
                      Scan dengan GoPay, OVO, Dana, BCA, Livin, atau Mobile Banking apa pun.
                    </p>
                  </div>
                </div>

                {/* Rincian Tagihan */}
                <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Referensi Transaksi:</span>
                    <span className="font-mono font-bold text-slate-900">{paymentData?.gatewayRef}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Kapasitas Unit:</span>
                    <span className="text-slate-900 font-medium">{totalCapacity} {template.unitLabel}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Durasi Langganan:</span>
                    <span className="text-slate-900 font-medium">{durationMonths} Bulan</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 text-sm font-bold">
                    <span className="text-slate-900">Total Tagihan:</span>
                    <span className="text-xl text-slate-900 font-mono font-extrabold">
                      Rp {finalTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Tombol Verifikasi / Testing (Hanya pada mode demo) */}
                {isDemo ? (
                  <div className="pt-2 space-y-3">
                    <button
                      type="button"
                      onClick={handleSimulatePaymentSuccess}
                      disabled={activating}
                      className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-2"
                    >
                      {activating ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <span>Memverifikasi Pembayaran...</span>
                        </span>
                      ) : (
                        <>
                          <AiOutlineCheckCircle className="text-base" />
                          <span>Simulasikan Pembayaran Sukses (Mode Demo)</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 space-y-3">
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-1.5">
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-900">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                        </span>
                        <span>Menunggu Verifikasi Pembayaran</span>
                      </div>
                      <p className="text-[11px] text-blue-700 leading-relaxed">
                        Sistem sedang memantau pembayaran QRIS Anda secara otomatis. Halaman akan langsung beralih begitu transfer terverifikasi oleh gateway.
                      </p>
                      {paymentData?.paymentUrl && paymentData.paymentUrl !== '#' && (
                        <div className="pt-1">
                          <a
                            href={paymentData.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors shadow-xs"
                          >
                            Buka Link Pembayaran Mayar ↗
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
