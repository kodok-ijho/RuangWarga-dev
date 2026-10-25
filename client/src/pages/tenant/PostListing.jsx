import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import {
  AiOutlineArrowLeft,
  AiOutlineCheckCircle,
  AiOutlineInfoCircle,
  AiOutlineLock,
  AiOutlinePlus,
  AiOutlineShop,
  AiOutlineStar,
  AiOutlineHome,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useTenant } from '../../hooks/useTenant';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { fetchTenantUnits, fetchTenantDetails } from '../../services/tenantOperationalService';
import {
  fetchListingPricing,
  getPricingForListing,
  createPublicListing,
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

const UMKM_CATEGORIES = [
  'Kuliner & Makanan',
  'Jasa & Servis',
  'Pakaian & Fashion',
  'Sayur & Sembako',
  'Kerajinan & Seni',
  'Kesehatan & Kecantikan',
  'Lainnya',
];

export default function PostListing() {
  const { tenantId: routeTenantId } = useParams();
  const [searchParams] = useSearchParams();
  const prefilledUnitId = searchParams.get('unitId');
  const navigate = useNavigate();
  const toast = useToast();

  const { activeTenant, activeTenantId, tenantType, userRole } = useTenant();
  const tenantId = routeTenantId || activeTenantId || activeTenant?.id;

  // Subscription gate check (FR-26)
  const { isReadOnly, canTransact, tooltip, redirectToRenewal, isTenantAdmin } = useSubscriptionGate({
    actionName: 'Membuat postingan listing baru',
  });

  // State loading & data referensi
  const [loading, setLoading] = useState(true);
  const [tenantInfo, setTenantInfo] = useState(activeTenant || null);
  const [units, setUnits] = useState([]);
  const [pricingList, setPricingList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const effectiveTenantType = tenantType || tenantInfo?.type || 'rt_rw';
  const defaultListingType = effectiveTenantType === 'kos' ? 'room_vacancy' : 'umkm';
  const [listingType, setListingType] = useState(defaultListingType);

  const [selectedUnitId, setSelectedUnitId] = useState(prefilledUnitId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(effectiveTenantType === 'kos' ? 'Campur' : 'Kuliner & Makanan');
  const [price, setPrice] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isFeatured, setIsFeatured] = useState(false);

  // Ref untuk melacak prefill kamar agar tidak menimpa editan manual user (LIST-UI-1.5)
  const lastPrefilledUnitRef = React.useRef(null);

  // Modal Checkout / Konfirmasi Bayar
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutQrisData, setCheckoutQrisData] = useState(null);

  // Load tenant details, units, and pricing
  useEffect(() => {
    let active = true;

    async function initData() {
      if (!tenantId) return;
      setLoading(true);
      try {
        const [details, unitsData, pricingData] = await Promise.all([
          tenantInfo ? Promise.resolve(tenantInfo) : fetchTenantDetails(tenantId),
          fetchTenantUnits(tenantId).catch(() => []),
          fetchListingPricing().catch(() => []),
        ]);

        if (!active) return;
        if (details) setTenantInfo(details);
        setUnits(unitsData || []);
        setPricingList(pricingData || []);

        // Isolasi tenant: verifikasi unitId dari URL milik tenant aktif (LIST-UI-1.5)
        if (prefilledUnitId) {
          const matchingUnit = (unitsData || []).find((u) => String(u.id) === String(prefilledUnitId));
          if (!matchingUnit) {
            toast.error('Kamar yang dipilih tidak ditemukan atau bukan milik kos ini.');
            setSelectedUnitId('');
          }
        }

        // Default kontak phone dari tenant jika ada
        if (details?.contact_phone && !contactPhone) {
          setContactPhone(details.contact_phone);
        }
        if (details?.address && !locationHint) {
          setLocationHint(details.address);
        }
      } catch (err) {
        console.error('Gagal memuat data awal posting listing:', err);
        toast.error('Gagal memuat informasi unit dan tarif listing.');
      } finally {
        if (active) setLoading(false);
      }
    }

    initData();
    return () => {
      active = false;
    };
  }, [tenantId]);

  // Unit terpilih dan pengecekan status occupied / fasilitas (LIST-UI-1.5)
  const selectedUnit = useMemo(() => {
    if (!selectedUnitId) return null;
    return units.find((u) => String(u.id) === String(selectedUnitId)) || null;
  }, [units, selectedUnitId]);

  const isSelectedUnitOccupied = Boolean(
    selectedUnit && (selectedUnit.status === 'occupied' || selectedUnit.is_occupied)
  );

  const selectedUnitFacilities = useMemo(() => {
    if (!selectedUnit?.metadata?.facilities) return [];
    const raw = selectedUnit.metadata.facilities;
    if (Array.isArray(raw)) {
      return raw.map((f) => String(f).trim()).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(',').map((f) => f.trim()).filter(Boolean);
    }
    return [];
  }, [selectedUnit]);

  // Prefill dari kamar kos jika selectedUnitId dipilih / berasal dari ?unitId= (LIST-UI-1.5)
  // Prefill hanya mengisi nilai awal; pengguna tetap bebas mengubah judul, harga, dan deskripsi.
  useEffect(() => {
    if (effectiveTenantType !== 'kos' || !selectedUnit) {
      return;
    }

    // Hindari menimpa perubahan manual pengguna jika unit yang dipilih masih sama
    if (lastPrefilledUnitRef.current === String(selectedUnit.id)) {
      return;
    }
    lastPrefilledUnitRef.current = String(selectedUnit.id);

    // Kamar yang sedang terisi (occupied) tidak boleh dipilih untuk iklan
    if (isSelectedUnitOccupied) {
      toast.warning(
        `Kamar ${selectedUnit.label || selectedUnit.unit_number || selectedUnit.id} sedang terisi (occupied) dan tidak dapat diiklankan.`
      );
      return;
    }

    // 1. Judul: mis. '<label kamar> – <nama kos>'
    const roomLabel = selectedUnit.label || (selectedUnit.unit_number ? `Kamar ${selectedUnit.unit_number}` : `Kamar ${selectedUnit.id}`);
    const kosName = tenantInfo?.name || activeTenant?.name || 'Kos';
    setTitle(`${roomLabel} – ${kosName}`);

    // 2. Harga: dari metadata.default_rent_price (atau rent_price / price)
    const rentPrice =
      selectedUnit.metadata?.default_rent_price ??
      selectedUnit.metadata?.rent_price ??
      selectedUnit.metadata?.price ??
      selectedUnit.rent_price ??
      tenantInfo?.settings?.default_rent_price ??
      '';
    if (rentPrice !== '' && rentPrice !== undefined && rentPrice !== null) {
      setPrice(String(rentPrice));
    }

    // 3. Tipe/Gender jika tercantum di metadata kamar -> category
    const roomGender =
      selectedUnit.metadata?.category ||
      selectedUnit.metadata?.gender ||
      selectedUnit.metadata?.type;
    if (roomGender) {
      const lower = String(roomGender).toLowerCase();
      if (lower.includes('putri')) setCategory('Putri');
      else if (lower.includes('putra')) setCategory('Putra');
      else if (lower.includes('campur')) setCategory('Campur');
    }

    // 4. Fasilitas kamar (metadata.facilities) dimasukkan ke deskripsi bila belum ada field fasilitas
    if (selectedUnitFacilities.length > 0) {
      const facText = selectedUnitFacilities.join(', ');
      setDescription((prev) => {
        if (!prev || !prev.trim() || prev.startsWith('Kamar nyaman') || prev.startsWith('Sewa kamar')) {
          return `Kamar nyaman dan siap huni dengan fasilitas lengkap: ${facText}. Lingkungan aman, bersih, dan tenang.`;
        }
        if (!prev.toLowerCase().includes('fasilitas')) {
          return `${prev.trim()}\n\nFasilitas: ${facText}.`;
        }
        return prev;
      });
    } else {
      setDescription((prev) => {
        if (!prev || !prev.trim()) {
          return 'Kamar nyaman, bersih, dan strategis dekat dengan akses transportasi.';
        }
        return prev;
      });
    }
  }, [
    selectedUnit,
    isSelectedUnitOccupied,
    effectiveTenantType,
    tenantInfo?.name,
    activeTenant?.name,
    selectedUnitFacilities,
    toast,
  ]);

  // Kalkulasi harga paket listing terpilih
  const currentPricing = useMemo(() => {
    return (
      getPricingForListing(pricingList, {
        listingType,
        isFeatured,
        durationDays: 30,
      }) || { price: isFeatured ? 35000 : 15000, duration_days: 30 }
    );
  }, [pricingList, listingType, isFeatured]);

  const regularPricing = useMemo(() => {
    return (
      getPricingForListing(pricingList, {
        listingType,
        isFeatured: false,
        durationDays: 30,
      }) || { price: listingType === 'room_vacancy' ? 15000 : 10000 }
    );
  }, [pricingList, listingType]);

  const featuredPricing = useMemo(() => {
    return (
      getPricingForListing(pricingList, {
        listingType,
        isFeatured: true,
        durationDays: 30,
      }) || { price: listingType === 'room_vacancy' ? 35000 : 25000 }
    );
  }, [pricingList, listingType]);

  const handleAddPhoto = () => {
    if (!photoUrl.trim()) return;
    try {
      new URL(photoUrl.trim());
      setPhotos((prev) => [...prev, photoUrl.trim()]);
      setPhotoUrl('');
    } catch {
      toast.error('URL foto tidak valid.');
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleOpenCheckout = (e) => {
    e.preventDefault();

    if (!canTransact) {
      toast.error(tooltip || 'Tenant sedang berstatus Read-Only.');
      return;
    }

    // Validasi kamar kos occupied (LIST-UI-1.5)
    if (effectiveTenantType === 'kos' && isSelectedUnitOccupied) {
      toast.error('Kamar yang sedang terisi (occupied) tidak dapat dipilih untuk iklan.');
      return;
    }

    if (!title.trim()) {
      toast.error('Judul iklan wajib diisi.');
      return;
    }
    if (!contactPhone.trim()) {
      toast.error('Nomor WhatsApp / telepon kontak wajib diisi.');
      return;
    }

    setShowCheckoutModal(true);
  };

  const handleConfirmPublish = async () => {
    if (!canTransact) {
      toast.error('Aksi dibatalkan karena status Read-Only.');
      return;
    }

    setSubmitting(true);
    try {
      const parsedUnitId =
        effectiveTenantType === 'kos' && selectedUnitId
          ? !isNaN(Number(selectedUnitId))
            ? Number(selectedUnitId)
            : selectedUnitId
          : null;

      const payload = {
        unit_id: parsedUnitId,
        type: listingType,
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        price: price ? Number(price) : null,
        photos,
        contact_phone: contactPhone.trim(),
        location_hint: locationHint.trim(),
        is_featured: isFeatured,
        duration_days: 30,
      };

      const result = await createPublicListing(tenantId, payload);

      // Buat invoice QRIS SNAP DOKU resmi untuk pembayaran listing (PAY-1.7)
      const payRes = await createListingPayment(result.id, {
        isFeatured,
        durationDays: 30,
      });

      const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';
      if (isDemo || String(tenantId).startsWith('demo-')) {
        if (payRes?.paymentId) {
          try {
            await verifyListingPayment(payRes.paymentId, payRes.gatewayRef);
          } catch (payErr) {
            console.warn('Demo verifikasi pembayaran:', payErr);
          }
        }
        toast.success('Iklan berhasil didaftarkan dan pembayaran berhasil diverifikasi (demo)!');
        setShowCheckoutModal(false);
        navigate(`/t/${tenantId}/my-listings`);
      } else {
        setShowCheckoutModal(false);
        setCheckoutQrisData({
          ...payRes,
          title: 'PEMBAYARAN IKLAN QRIS DOKU',
          subtitle: 'RUANGWARGA DIRECTORY',
          category: isFeatured ? 'Listing Unggulan (30 Hari)' : 'Listing Standar (30 Hari)',
          description: `Iklan: ${title.trim()}`,
        });
      }
    } catch (err) {
      console.error('Gagal mempublikasikan listing:', err);
      toast.error(err.message || 'Gagal mempublikasikan iklan.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-forest-800 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Tombol Kembali & Judul Halaman */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-medium text-forest-700 hover:text-forest-900"
        >
          <AiOutlineArrowLeft className="text-lg" /> Kembali
        </button>
        <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-semibold text-forest-800">
          Modul Listing Publik (Add-on)
        </span>
      </div>

      <div className="mb-8">
        <h1 className="font-serif text-2xl font-bold text-forest-900 sm:text-3xl">
          {effectiveTenantType === 'kos' ? 'Pasang Iklan Kamar Kos' : 'Pasang Iklan UMKM Warga'}
        </h1>
        <p className="mt-2 text-sm text-forest-600">
          {effectiveTenantType === 'kos'
            ? 'Iklankan kamar kosong kos Anda ke direktori publik RuangWarga agar cepat ditemukan calon penyewa.'
            : 'Promosikan usaha rumahan, kuliner, dan jasa warga RT ke publik luas di luar lingkungan komplek.'}
        </p>
      </div>

      {/* Warning Banner jika Tenant Berstatus Read-Only (FR-26) */}
      {isReadOnly && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AiOutlineLock className="mt-0.5 text-xl text-amber-600 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-800">Layanan Dalam Status Read-Only</p>
              <p className="mt-1 text-amber-700">
                {isTenantAdmin
                  ? 'Masa aktif langganan tenant Anda telah berakhir. Seluruh penambahan iklan baru dinonaktifkan sementara hingga paket diperpanjang.'
                  : 'Layanan penambahan iklan sedang dinonaktifkan sementara oleh pengelola tenant.'}
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

      <form onSubmit={handleOpenCheckout} className="space-y-8">
        {/* SECTION 1: Pilih Sumber / Unit (Khusus Kos: Prefill Kamar Kos - LIST-UI-1.5) */}
        {effectiveTenantType === 'kos' && (
          <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-forest-900">
              <AiOutlineHome className="text-forest-700" />
              Pilih Kamar Kosong (Prefill Otomatis)
            </h2>
            <p className="mt-1 text-xs text-forest-500">
              Pilih kamar yang ingin diiklankan. Data kamar akan mengisi otomatis judul, harga sewa, dan fasilitas kamar.
            </p>

            <div className="mt-4">
              <label htmlFor="select-unit" className="block text-xs font-semibold uppercase text-forest-700">
                Kamar Kos ({units.filter((u) => u.status === 'vacant' || !u.is_occupied).length} kamar kosong tersedia)
              </label>
              <select
                id="select-unit"
                data-testid="select-unit"
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="pv-input mt-1.5 w-full text-sm"
              >
                <option value="">-- Pilih Kamar atau Isi Manual --</option>
                {units.map((u) => {
                  const isOcc = u.status === 'occupied' || u.is_occupied;
                  const label = u.label || (u.unit_number ? `Kamar ${u.unit_number}` : `Kamar ${u.id}`);
                  return (
                    <option key={u.id} value={u.id} disabled={isOcc}>
                      {label} {isOcc ? '(Terisi - Tidak dapat diiklankan)' : '(Kosong)'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Peringatan Kamar Sedang Terisi (Occupied) - LIST-UI-1.5 */}
            {isSelectedUnitOccupied && (
              <div
                data-testid="occupied-unit-alert"
                role="alert"
                className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900"
              >
                <div className="flex items-start gap-3">
                  <AiOutlineInfoCircle className="mt-0.5 text-xl text-rose-600 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-rose-900">
                      Kamar Sedang Terisi (Occupied)
                    </p>
                    <p className="mt-1 text-rose-700">
                      Kamar {selectedUnit?.label || selectedUnit?.unit_number || selectedUnit?.id} saat ini sedang berpenghuni (status: occupied). Kamar yang sedang terisi tidak dapat dipilih untuk iklan publik. Silakan pilih kamar yang berstatus kosong.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tampilan Fasilitas Kamar Terpilih - LIST-UI-1.5 */}
            {!isSelectedUnitOccupied && selectedUnit && selectedUnitFacilities.length > 0 && (
              <div
                data-testid="unit-facilities-box"
                className="mt-4 rounded-xl border border-forest-100 bg-forest-50/60 p-4"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-forest-800">
                  Fasilitas Kamar ({selectedUnitFacilities.length})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="unit-facilities-list">
                  {selectedUnitFacilities.map((fac, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-md border border-forest-200 bg-white px-2.5 py-1 text-xs font-medium text-forest-800 shadow-2xs"
                    >
                      <AiOutlineCheckCircle className="text-emerald-600 text-xs" />
                      {fac}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-forest-600">
                  Fasilitas kamar di atas otomatis disertakan ke dalam Deskripsi iklan di bawah.
                </p>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: Detail Informasi Iklan */}
        <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-forest-900">
            {effectiveTenantType === 'kos' ? (
              <AiOutlineHome className="text-forest-700" />
            ) : (
              <AiOutlineShop className="text-forest-700" />
            )}
            Informasi Iklan & Kontak
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="listing-title" className="block text-xs font-semibold uppercase text-forest-700">
                Judul Iklan <span className="text-red-500">*</span>
              </label>
              <input
                id="listing-title"
                data-testid="input-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  effectiveTenantType === 'kos'
                    ? 'Contoh: Kost Putri Kamar AC Kamar Mandi Dalam'
                    : 'Contoh: Catering Berkah Barokah - Nasi Box & Prasmanan'
                }
                className="pv-input mt-1.5 w-full text-sm"
              />
            </div>

            <div>
              <label htmlFor="listing-category" className="block text-xs font-semibold uppercase text-forest-700">
                Kategori
              </label>
              {effectiveTenantType === 'kos' ? (
                <select
                  id="listing-category"
                  data-testid="select-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="pv-input mt-1.5 w-full text-sm"
                >
                  <option value="Campur">Campur</option>
                  <option value="Putra">Khusus Putra</option>
                  <option value="Putri">Khusus Putri</option>
                </select>
              ) : (
                <select
                  id="listing-category"
                  data-testid="select-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="pv-input mt-1.5 w-full text-sm"
                >
                  {UMKM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label htmlFor="listing-price" className="block text-xs font-semibold uppercase text-forest-700">
                Harga {effectiveTenantType === 'kos' ? 'Sewa (per bulan)' : 'Produk / Jasa'}
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-forest-500">
                  Rp
                </span>
                <input
                  id="listing-price"
                  data-testid="input-price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                  className="pv-input w-full pl-9 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="listing-description" className="block text-xs font-semibold uppercase text-forest-700">
                Deskripsi Lengkap
              </label>
              <textarea
                id="listing-description"
                data-testid="input-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  effectiveTenantType === 'kos'
                    ? 'Jelaskan fasilitas kamar, jam malam, peraturan, akses WiFi, dan fasilitas umum kos...'
                    : 'Jelaskan menu makanan, layanan servis, variasi produk, atau jam operasional...'
                }
                className="pv-input mt-1.5 w-full text-sm"
              />
            </div>

            <div>
              <label htmlFor="listing-contact-phone" className="block text-xs font-semibold uppercase text-forest-700">
                Nomor WhatsApp / Telepon <span className="text-red-500">*</span>
              </label>
              <input
                id="listing-contact-phone"
                data-testid="input-contact-phone"
                type="text"
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Contoh: 08123456789"
                className="pv-input mt-1.5 w-full text-sm"
              />
              <p className="mt-1 text-[11px] text-forest-500">
                Calon pembeli/penyewa akan langsung menghubungi nomor ini.
              </p>
            </div>

            <div>
              <label htmlFor="listing-location-hint" className="block text-xs font-semibold uppercase text-forest-700">
                Petunjuk Lokasi / Alamat
              </label>
              <input
                id="listing-location-hint"
                data-testid="input-location-hint"
                type="text"
                value={locationHint}
                onChange={(e) => setLocationHint(e.target.value)}
                placeholder="Contoh: Jl. Kaliurang KM 5 / Dekat Masjid Al-Ikhlas"
                className="pv-input mt-1.5 w-full text-sm"
              />
            </div>

            {/* Foto Galeri (URL) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase text-forest-700">
                Foto Iklan (URL Foto)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://example.com/foto-kamar.jpg"
                  className="pv-input flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddPhoto}
                  className="pv-btn-ghost flex items-center gap-1 text-xs"
                >
                  <AiOutlinePlus /> Tambah
                </button>
              </div>

              {photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((url, idx) => (
                    <div
                      key={idx}
                      className="group relative h-20 w-20 overflow-hidden rounded-lg border border-forest-200 bg-forest-50"
                    >
                      <img
                        src={url}
                        alt={`Foto ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: Pilihan Paket Promosi (listing_pricing) */}
        <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-forest-900">
              <HiOutlineSparkles className="text-gold-600 text-xl" />
              Pilih Paket Tayang (Masa Aktif 30 Hari)
            </h2>
            <span className="text-xs font-medium text-forest-500">Masa Tayang 30 Hari</span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Paket Standar */}
            <div
              onClick={() => setIsFeatured(false)}
              className={`cursor-pointer rounded-xl border p-5 transition-all ${
                !isFeatured
                  ? 'border-forest-600 bg-forest-50/50 ring-2 ring-forest-500'
                  : 'border-forest-200 hover:border-forest-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-forest-900">Paket Standar</h3>
                  <p className="mt-1 text-xs text-forest-600">
                    Tayang di direktori publik dengan urutan standar selama 30 hari.
                  </p>
                </div>
                {!isFeatured && <AiOutlineCheckCircle className="text-xl text-forest-600" />}
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-forest-900">
                  {formatRupiah(regularPricing?.price)}
                </span>
                <span className="text-xs text-forest-500"> / 30 hari</span>
              </div>
            </div>

            {/* Paket Unggulan / Featured (FR-29) */}
            <div
              onClick={() => setIsFeatured(true)}
              className={`cursor-pointer rounded-xl border p-5 transition-all relative ${
                isFeatured
                  ? 'border-gold-500 bg-amber-50/40 ring-2 ring-gold-500'
                  : 'border-forest-200 hover:border-gold-300'
              }`}
            >
              <div className="absolute -top-3 right-4 rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-bold text-forest-900 shadow-sm">
                Rekomendasi
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-forest-900">Paket Unggulan</h3>
                    <AiOutlineStar className="text-gold-600" />
                  </div>
                  <p className="mt-1 text-xs text-forest-600">
                    Prioritas di urutan paling atas direktori, badge khusus, dan sorotan kartu.
                  </p>
                </div>
                {isFeatured && <AiOutlineCheckCircle className="text-xl text-gold-600" />}
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-forest-900">
                  {formatRupiah(featuredPricing?.price)}
                </span>
                <span className="text-xs text-forest-500"> / 30 hari</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: Ringkasan Biaya & Tombol Submit */}
        <div className="flex flex-col gap-4 rounded-2xl border border-forest-100 bg-forest-50/70 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-forest-600">
              Total Biaya Penerbitan Iklan
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-forest-900">
                {formatRupiah(currentPricing?.price)}
              </span>
              <span className="text-xs text-forest-600">
                ({isFeatured ? 'Paket Unggulan' : 'Paket Standar'} • 30 Hari)
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canTransact || submitting || isSelectedUnitOccupied}
            title={
              isSelectedUnitOccupied
                ? 'Kamar sedang terisi dan tidak dapat diiklankan'
                : tooltip
            }
            className="pv-btn-primary flex items-center justify-center gap-2 px-8 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Memproses...' : 'Lanjut ke Pembayaran'}
          </button>
        </div>
      </form>

      {/* MODAL KONFIRMASI CHECKOUT / PEMBAYARAN QRIS */}
      {showCheckoutModal && (
        <Modal
          open
          onClose={() => setShowCheckoutModal(false)}
          title="Konfirmasi & Pembayaran Iklan"
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-forest-100 bg-forest-50/50 p-4">
              <p className="text-xs text-forest-500">Judul Iklan</p>
              <p className="font-semibold text-forest-900">{title}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-forest-500">Tipe Listing:</span>
                  <p className="font-medium text-forest-800">
                    {listingType === 'room_vacancy' ? 'Kamar Kos Kosong' : 'UMKM Warga'}
                  </p>
                </div>
                <div>
                  <span className="text-forest-500">Paket Tayang:</span>
                  <p className="font-medium text-forest-800">
                    {isFeatured ? 'Unggulan (30 Hari)' : 'Standar (30 Hari)'}
                  </p>
                </div>
                <div>
                  <span className="text-forest-500">Nomor Kontak:</span>
                  <p className="font-medium text-forest-800">{contactPhone}</p>
                </div>
                <div>
                  <span className="text-forest-500">Biaya Tayang:</span>
                  <p className="font-bold text-forest-900">
                    {formatRupiah(currentPricing?.price)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              <div className="flex items-start gap-2">
                <AiOutlineInfoCircle className="mt-0.5 text-base text-blue-600 flex-shrink-0" />
                <p>
                  Iklan akan langsung berstatus <strong>Aktif</strong> selama 30 hari ke depan di direktori publik RuangWarga setelah Anda mengonfirmasi penerbitan ini.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-2 border-t border-forest-100 pt-4">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                disabled={submitting}
                className="pv-btn-ghost flex-1 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={submitting}
                className="pv-btn-primary flex-1 text-xs"
              >
                {submitting ? 'Menerbitkan...' : `Bayar ${formatRupiah(currentPricing?.price)} & Terbitkan`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL QRIS DOKU RESMI */}
      {checkoutQrisData && (
        <QrisCheckoutModal
          data={checkoutQrisData}
          provider="doku"
          title="PEMBAYARAN IKLAN QRIS DOKU"
          subtitle="RUANGWARGA DIRECTORY"
          onClose={() => {
            setCheckoutQrisData(null);
            navigate(`/t/${tenantId}/my-listings`);
          }}
          onConfirm={() => {
            toast.success('Pembayaran QRIS sedang diproses oleh DOKU.');
            setCheckoutQrisData(null);
            navigate(`/t/${tenantId}/my-listings`);
          }}
        />
      )}
    </div>
  );
}
