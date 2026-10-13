import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineStop,
  AiOutlineDelete,
  AiOutlineReload,
  AiOutlineStar,
  AiOutlineHome,
  AiOutlineShop,
  AiOutlineArrowLeft,
  AiOutlineInfoCircle,
  AiOutlinePhone,
  AiOutlineEnvironment,
  AiOutlineLock,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useTenant } from '../../hooks/useTenant';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useToast } from '../../hooks/useToast';
import {
  fetchTenantListings,
  updateListingStatus,
  renewListing,
  deleteListing,
  fetchListingPricing,
  getPricingForListing,
  createListingPayment,
  verifyListingPayment,
} from '../../services/publicListingService';
import Modal from '../../components/Modal';
import QrisCheckoutModal from '../../components/QrisCheckoutModal';

function formatRupiah(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getDaysRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

export default function MyListings() {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { activeTenant, activeTenantId, tenantType, isTenantAdmin } = useTenant();
  const tenantId = routeTenantId || activeTenantId || activeTenant?.id;

  const { isReadOnly, canTransact, tooltip, redirectToRenewal } = useSubscriptionGate({
    actionName: 'Memperpanjang postingan iklan',
  });

  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [pricingList, setPricingList] = useState([]);
  const [activeTab, setActiveTab] = useState('all');

  // Modal State: Perpanjang Iklan
  const [renewTarget, setRenewTarget] = useState(null);
  const [renewFeatured, setRenewFeatured] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);

  // Modal State: Konfirmasi Hapus
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal State: Bayar Iklan Pending (PAY-1.7)
  const [payCheckoutData, setPayCheckoutData] = useState(null);
  const [isPaying, setIsPaying] = useState(false);

  // Load data listings tenant dan katalog pricing
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [dataListings, dataPricing] = await Promise.all([
        fetchTenantListings(tenantId),
        fetchListingPricing().catch(() => []),
      ]);
      setListings(dataListings || []);
      setPricingList(dataPricing || []);
    } catch (err) {
      console.error('Gagal memuat listing tenant:', err);
      toast.error('Gagal memuat daftar iklan tenant.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Status Filter Counts
  const counts = useMemo(() => {
    const now = new Date();
    return {
      all: listings.length,
      pending_payment: listings.filter((l) => l.status === 'pending_payment').length,
      active: listings.filter((l) => l.status === 'active' && l.expires_at && new Date(l.expires_at) > now).length,
      rented_or_sold: listings.filter((l) => l.status === 'rented_or_sold').length,
      expired: listings.filter((l) => l.status === 'expired' || (l.status === 'active' && (!l.expires_at || new Date(l.expires_at) <= now))).length,
    };
  }, [listings]);

  // Saring listings sesuai tab aktif
  const filteredListings = useMemo(() => {
    const now = new Date();
    return listings.filter((item) => {
      const isExpiredByDate = item.status === 'active' && (!item.expires_at || new Date(item.expires_at) <= now);
      if (activeTab === 'pending_payment') {
        return item.status === 'pending_payment';
      }
      if (activeTab === 'active') {
        return item.status === 'active' && item.expires_at && new Date(item.expires_at) > now;
      }
      if (activeTab === 'rented_or_sold') {
        return item.status === 'rented_or_sold';
      }
      if (activeTab === 'expired') {
        return item.status === 'expired' || isExpiredByDate;
      }
      return true;
    });
  }, [listings, activeTab]);

  // Handler: Bayar Iklan Menunggu Pembayaran (PAY-1.7)
  const handlePayNow = async (item) => {
    if (!canTransact) {
      toast.error(tooltip || 'Layanan sedang Read-Only.');
      return;
    }
    setIsPaying(true);
    try {
      const payRes = await createListingPayment(item.id, {
        isFeatured: Boolean(item.is_featured),
        durationDays: 30,
      });

      const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';
      if (isDemo || String(tenantId).startsWith('demo-')) {
        if (payRes?.paymentId) {
          try {
            await verifyListingPayment(payRes.paymentId, payRes.gatewayRef);
          } catch (e) {
            console.warn('Demo verify listing error:', e);
          }
        }
        toast.success('Pembayaran iklan berhasil disimulasikan dan iklan kini aktif!');
        loadData();
      } else {
        setPayCheckoutData({
          ...payRes,
          title: 'PEMBAYARAN IKLAN QRIS DOKU',
          subtitle: 'RUANGWARGA DIRECTORY',
          category: item.is_featured ? 'Listing Unggulan (30 Hari)' : 'Listing Standar (30 Hari)',
          description: `Iklan: ${item.title}`,
        });
      }
    } catch (err) {
      toast.error(err.message || 'Gagal memproses pembayaran iklan.');
    } finally {
      setIsPaying(false);
    }
  };

  // Handler: Ubah Status (Tandai Rented/Sold vs Aktif)
  const handleToggleStatus = async (item) => {
    const isCurrentlyActive = item.status === 'active' && new Date(item.expires_at) > new Date();
    const newStatus = isCurrentlyActive ? 'rented_or_sold' : 'active';
    const actionLabel = newStatus === 'rented_or_sold'
      ? item.type === 'room_vacancy' ? 'tersewa' : 'terjual'
      : 'aktif kembali';

    try {
      await updateListingStatus(item.id, newStatus);
      toast.success(`Iklan berhasil ditandai ${actionLabel}!`);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui status iklan.');
    }
  };

  // Handler: Buka Modal Perpanjang
  const handleOpenRenewModal = (item) => {
    if (!canTransact) {
      toast.error(tooltip || 'Layanan sedang Read-Only.');
      return;
    }
    setRenewTarget(item);
    setRenewFeatured(Boolean(item.is_featured));
  };

  // Handler: Konfirmasi Perpanjang
  const handleConfirmRenew = async () => {
    if (!renewTarget || !canTransact) return;

    setIsRenewing(true);
    try {
      // 1. Buat record invoice pembayaran perpanjangan (T10.6)
      const payRes = await createListingPayment(renewTarget.id, {
        durationDays: 30,
        isFeatured: renewFeatured,
      });

      // 2. Verifikasi pembayaran & perpanjang masa tayang
      if (payRes?.paymentId) {
        await verifyListingPayment(payRes.paymentId, payRes.gatewayRef);
      } else {
        await renewListing(renewTarget.id, {
          durationDays: 30,
          isFeatured: renewFeatured,
        });
      }

      toast.success('Masa aktif iklan berhasil diperpanjang 30 hari!');
      setRenewTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal memperpanjang iklan.');
    } finally {
      setIsRenewing(false);
    }
  };

  // Handler: Konfirmasi Hapus
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await deleteListing(deleteTarget.id);
      toast.success('Iklan berhasil dihapus.');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus iklan.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Kalkulasi tarif perpanjangan untuk modal
  const renewPrice = useMemo(() => {
    if (!renewTarget) return 0;
    const pricing = getPricingForListing(pricingList, {
      listingType: renewTarget.type,
      isFeatured: renewFeatured,
      durationDays: 30,
    });
    if (pricing) return pricing.price;
    return renewFeatured ? 35000 : 15000;
  }, [renewTarget, renewFeatured, pricingList]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header & Breadcrumb */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(`/t/${tenantId}/dashboard`)}
            className="flex items-center gap-2 text-sm font-medium text-forest-700 hover:text-forest-900"
          >
            <AiOutlineArrowLeft className="text-lg" /> Dashboard Tenant
          </button>
          <h1 className="mt-2 font-serif text-2xl font-bold text-forest-900 sm:text-3xl">
            Kelola Iklan &amp; Listing Publik
          </h1>
          <p className="mt-1 text-sm text-forest-600">
            Pantau status tayang kamar kos dan etalase UMKM warga yang dipublikasikan ke katalog umum.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/t/${tenantId}/listings/post`}
            className="pv-btn-primary flex items-center gap-2 text-sm font-semibold shadow-sm"
          >
            <AiOutlinePlus className="text-base" /> Pasang Iklan Baru
          </Link>
        </div>
      </div>

      {/* Warning Banner Read-Only */}
      {isReadOnly && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AiOutlineLock className="mt-0.5 text-xl text-amber-600 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-800">Layanan Dalam Status Read-Only</p>
              <p className="mt-1 text-amber-700">
                {isTenantAdmin
                  ? 'Masa aktif langganan tenant Anda telah berakhir. Perpanjangan masa tayang iklan dinonaktifkan sementara.'
                  : 'Layanan perpanjangan iklan sedang dinonaktifkan sementara oleh pengelola.'}
              </p>
              {isTenantAdmin && (
                <button
                  type="button"
                  onClick={redirectToRenewal}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Perpanjang Paket Sekarang
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mb-6 flex border-b border-forest-200 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === 'all'
              ? 'border-forest-800 font-bold text-forest-900'
              : 'border-transparent text-forest-600 hover:text-forest-800'
          }`}
        >
          Semua Iklan
          <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-bold text-forest-800">
            {counts.all}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pending_payment')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === 'pending_payment'
              ? 'border-amber-500 font-bold text-amber-800'
              : 'border-transparent text-forest-600 hover:text-forest-800'
          }`}
        >
          Menunggu Pembayaran
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            {counts.pending_payment}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === 'active'
              ? 'border-emerald-600 font-bold text-emerald-800'
              : 'border-transparent text-forest-600 hover:text-forest-800'
          }`}
        >
          Aktif Tayang
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
            {counts.active}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rented_or_sold')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === 'rented_or_sold'
              ? 'border-blue-600 font-bold text-blue-800'
              : 'border-transparent text-forest-600 hover:text-forest-800'
          }`}
        >
          Tersewa / Terjual
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
            {counts.rented_or_sold}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('expired')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === 'expired'
              ? 'border-red-600 font-bold text-red-800'
              : 'border-transparent text-forest-600 hover:text-forest-800'
          }`}
        >
          Kedaluwarsa
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
            {counts.expired}
          </span>
        </button>
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-forest-800 border-t-transparent" />
        </div>
      ) : filteredListings.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-forest-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-50 text-3xl text-forest-700">
            {activeTab === 'all' ? <HiOutlineSparkles /> : <AiOutlineInfoCircle />}
          </div>
          <h3 className="mt-4 font-serif text-lg font-bold text-forest-900">
            {activeTab === 'all'
              ? 'Belum Ada Iklan yang Dipasang'
              : `Tidak Ada Iklan Berstatus "${activeTab}"`}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs text-forest-600">
            {activeTab === 'all'
              ? 'Iklankan kamar kos kosong atau promosi UMKM warga Anda agar tampil di direktori publik RuangWarga.'
              : 'Iklan dengan status ini tidak ditemukan. Coba beralih ke tab Semua Iklan.'}
          </p>
          {activeTab === 'all' && (
            <div className="mt-6">
              <Link
                to={`/t/${tenantId}/listings/post`}
                className="pv-btn-primary inline-flex items-center gap-2 text-xs font-semibold"
              >
                <AiOutlinePlus /> Pasang Iklan Pertama
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* Grid Daftar Listing */
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filteredListings.map((item) => {
            const isPendingPayment = item.status === 'pending_payment';
            const isExpired = item.status === 'expired' || (item.status === 'active' && (!item.expires_at || new Date(item.expires_at) <= new Date()));
            const isRentedOrSold = item.status === 'rented_or_sold';
            const isActive = item.status === 'active' && !isExpired;
            const daysRemaining = item.expires_at ? getDaysRemaining(item.expires_at) : 0;

            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                  item.is_featured
                    ? 'border-gold-400 bg-gradient-to-b from-amber-50/20 to-white ring-1 ring-gold-400/50'
                    : 'border-forest-100'
                }`}
              >
                <div>
                  {/* Badge Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-forest-100 px-2.5 py-1 text-[11px] font-semibold text-forest-800">
                        {item.type === 'room_vacancy' ? (
                          <>
                            <AiOutlineHome /> Kamar Kos
                          </>
                        ) : (
                          <>
                            <AiOutlineShop /> UMKM
                          </>
                        )}
                      </span>
                      {item.category && (
                        <span className="rounded-md bg-forest-50 px-2 py-1 text-[11px] font-medium text-forest-600">
                          {item.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.is_featured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-bold text-forest-950 shadow-sm">
                          <AiOutlineStar /> Unggulan
                        </span>
                      )}

                      {/* Status Badge */}
                      {isPendingPayment && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                          <AiOutlineClockCircle /> Menunggu Pembayaran
                        </span>
                      )}
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          <AiOutlineCheckCircle /> Aktif ({daysRemaining} hari)
                        </span>
                      )}
                      {isRentedOrSold && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                          <AiOutlineCheckCircle /> {item.type === 'room_vacancy' ? 'Tersewa' : 'Terjual'}
                        </span>
                      )}
                      {isExpired && !isRentedOrSold && !isPendingPayment && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-800">
                          <AiOutlineClockCircle /> Kedaluwarsa
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail & Title */}
                  <div className="mt-4 flex gap-4">
                    {item.photos && item.photos.length > 0 ? (
                      <img
                        src={item.photos[0]}
                        alt={item.title}
                        className="h-20 w-20 flex-shrink-0 rounded-xl object-cover border border-forest-100 shadow-inner"
                      />
                    ) : (
                      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-forest-50 text-2xl text-forest-400 border border-forest-100">
                        {item.type === 'room_vacancy' ? <AiOutlineHome /> : <AiOutlineShop />}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-forest-900 line-clamp-1">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm font-extrabold text-forest-800">
                        {formatRupiah(item.price)}
                        {item.type === 'room_vacancy' && <span className="text-xs font-normal text-forest-500"> / bulan</span>}
                      </p>
                      {item.location_hint && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-forest-500 line-clamp-1">
                          <AiOutlineEnvironment className="flex-shrink-0" />
                          {item.location_hint}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Description Snippet */}
                  {item.description && (
                    <p className="mt-3 text-xs text-forest-600 line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  {/* Kontak Phone */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-forest-600">
                    <AiOutlinePhone className="text-sm text-forest-700" />
                    <span>WhatsApp: <strong>{item.contact_phone}</strong></span>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-forest-100 pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    {/* Tombol Toggle Tersewa / Terjual (FR-28) */}
                    {isPendingPayment ? (
                      <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium bg-slate-100 text-slate-400 cursor-not-allowed">
                        Belum Aktif
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-colors ${
                          isRentedOrSold
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        {isRentedOrSold
                          ? 'Aktifkan Kembali'
                          : item.type === 'room_vacancy' ? 'Tandai Tersewa' : 'Tandai Terjual'}
                      </button>
                    )}

                    {/* Tombol Hapus */}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                      title="Hapus iklan"
                    >
                      <AiOutlineDelete className="text-base" />
                    </button>
                  </div>

                  {/* Tombol Aksi Utama: Bayar Sekarang (Pending) vs Perpanjang (Aktif/Expired) */}
                  {isPendingPayment ? (
                    <button
                      type="button"
                      onClick={() => handlePayNow(item)}
                      disabled={!canTransact || isPaying}
                      className="inline-flex items-center gap-1 rounded-lg bg-gold-500 px-3 py-1.5 font-bold text-forest-950 shadow-sm hover:bg-gold-400 disabled:opacity-50 transition-colors"
                    >
                      <HiOutlineSparkles /> Bayar Sekarang
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenRenewModal(item)}
                      disabled={!canTransact}
                      title={tooltip}
                      className="inline-flex items-center gap-1 rounded-lg bg-forest-800 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-forest-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <AiOutlineReload /> Perpanjang 30 Hari
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL PERPANJANG IKLAN */}
      {renewTarget && (
        <Modal
          open
          onClose={() => setRenewTarget(null)}
          title="Perpanjang Masa Aktif Iklan"
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-4">
              <p className="text-xs text-forest-500">Iklan yang Diperpanjang</p>
              <h4 className="font-bold text-forest-900">{renewTarget.title}</h4>
              <p className="mt-1 text-xs text-forest-600">
                Masa aktif iklan akan diperpanjang selama <strong>30 hari</strong> ke depan sejak hari ini.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-forest-700 mb-2">
                Pilih Paket Perpanjangan
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div
                  onClick={() => setRenewFeatured(false)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    !renewFeatured
                      ? 'border-forest-600 bg-forest-50/60 ring-2 ring-forest-500'
                      : 'border-forest-200 hover:border-forest-300'
                  }`}
                >
                  <p className="font-bold text-forest-900">Paket Standar</p>
                  <p className="mt-1 text-xs text-forest-500">Tampil reguler di katalog</p>
                  <p className="mt-3 text-lg font-extrabold text-forest-900">
                    {formatRupiah(renewTarget.type === 'room_vacancy' ? 15000 : 10000)}
                  </p>
                </div>

                <div
                  onClick={() => setRenewFeatured(true)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all relative ${
                    renewFeatured
                      ? 'border-gold-500 bg-amber-50/50 ring-2 ring-gold-500'
                      : 'border-forest-200 hover:border-gold-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <p className="font-bold text-forest-900">Paket Unggulan</p>
                    <AiOutlineStar className="text-gold-600" />
                  </div>
                  <p className="mt-1 text-xs text-forest-500">Prioritas &amp; highlight</p>
                  <p className="mt-3 text-lg font-extrabold text-forest-900">
                    {formatRupiah(renewTarget.type === 'room_vacancy' ? 35000 : 25000)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2">
              <AiOutlineInfoCircle className="mt-0.5 text-base text-blue-600 flex-shrink-0" />
              <p>
                Total biaya perpanjangan sebesar <strong>{formatRupiah(renewPrice)}</strong> untuk masa aktif 30 hari.
              </p>
            </div>

            <div className="mt-6 flex gap-2 border-t border-forest-100 pt-4">
              <button
                type="button"
                onClick={() => setRenewTarget(null)}
                disabled={isRenewing}
                className="pv-btn-ghost flex-1 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRenew}
                disabled={isRenewing}
                className="pv-btn-primary flex-1 text-xs"
              >
                {isRenewing ? 'Memproses...' : `Bayar ${formatRupiah(renewPrice)} & Perpanjang`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="Konfirmasi Hapus Iklan"
        >
          <div className="space-y-4 text-sm">
            <p className="text-forest-700">
              Apakah Anda yakin ingin menghapus iklan <strong>"{deleteTarget.title}"</strong>?
            </p>
            <p className="text-xs text-forest-500">
              Iklan yang dihapus tidak akan lagi muncul di direktori publik RuangWarga. Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="mt-6 flex gap-2 border-t border-forest-100 pt-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="pv-btn-ghost flex-1 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="pv-btn-danger flex-1 text-xs"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Iklan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL CHECKOUT QRIS DOKU (PAY-1.7) */}
      {payCheckoutData && (
        <QrisCheckoutModal
          data={payCheckoutData}
          provider="doku"
          title="PEMBAYARAN IKLAN QRIS DOKU"
          subtitle="RUANGWARGA DIRECTORY"
          onClose={() => {
            setPayCheckoutData(null);
            loadData();
          }}
          onConfirm={() => {
            toast.info('Menunggu konfirmasi pembayaran dari DOKU...');
            setPayCheckoutData(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
