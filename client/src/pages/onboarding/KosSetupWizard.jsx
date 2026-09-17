import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineArrowLeft,
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineDollarCircle,
  AiOutlineBank,
  AiOutlineAppstore,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  fetchTenantDetails,
  updateTenantProfileAndSettings,
  bulkCreateTenantUnits,
  generateInviteCode,
} from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';

const COMMON_FACILITIES = [
  'AC',
  'Kamar Mandi Dalam',
  'Kasur & Bantal',
  'Lemari Pakaian',
  'Meja Belajar',
  'WiFi Internet',
  'Water Heater',
  'Dapur Bersama',
  'Listrik Token Mandiri',
];

export default function KosSetupWizard({ tenantId: propTenantId, initialData }) {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { activeTenant, activeTenantId, switchTenant, refreshTenant, isTenantAdmin } = useTenant();

  const tenantId = propTenantId || routeTenantId || activeTenantId;

  const [currentStep, setCurrentStep] = useState(1);
  const [loadingInitial, setLoadingInitial] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [setupFinished, setSetupFinished] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Step 1: Identitas & Lokasi Kos
  const [kosName, setKosName] = useState(initialData?.name || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [contactPhone, setContactPhone] = useState(initialData?.contact_phone || '');
  const [kosRules, setKosRules] = useState('');

  // Step 2: Konfigurasi Kamar
  const [roomPrefix, setRoomPrefix] = useState('Kamar ');
  const [roomCountInput, setRoomCountInput] = useState(6);
  const [selectedFacilities, setSelectedFacilities] = useState([
    'AC',
    'Kamar Mandi Dalam',
    'Kasur & Bantal',
    'WiFi Internet',
  ]);
  const [roomList, setRoomList] = useState([]);
  const [manualRoomLabel, setManualRoomLabel] = useState('');
  const [manualRoomPrice, setManualRoomPrice] = useState('');

  // Step 3: Tarif Sewa Default & Penagihan
  const [defaultRentPrice, setDefaultRentPrice] = useState(1200000);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [dueDay, setDueDay] = useState(1);
  const [bankName, setBankName] = useState('BCA');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [additionalFees, setAdditionalFees] = useState([
    { id: 'fee-1', name: 'Biaya Parkir Mobil', amount: 100000 },
  ]);
  const [newFeeName, setNewFeeName] = useState('');
  const [newFeeAmount, setNewFeeAmount] = useState('');

  // Sinkronkan activeTenantId dengan URL param
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  // Load data tenant awal jika belum di-passing
  useEffect(() => {
    if (initialData) {
      setKosName(initialData.name || '');
      setAddress(initialData.address || '');
      setContactPhone(initialData.contact_phone || '');
      if (initialData.settings?.default_rent_price) {
        setDefaultRentPrice(initialData.settings.default_rent_price);
      }
      if (initialData.settings?.billing_cycle) {
        setBillingCycle(initialData.settings.billing_cycle);
      }
      if (initialData.settings?.due_day) {
        setDueDay(initialData.settings.due_day);
      }
      if (initialData.settings?.bank_account) {
        setBankName(initialData.settings.bank_account.bank_name || 'BCA');
        setBankAccountNo(initialData.settings.bank_account.account_number || '');
        setBankAccountHolder(initialData.settings.bank_account.account_holder || '');
      }
      setLoadingInitial(false);
      return;
    }

    let mounted = true;
    async function loadData() {
      if (!tenantId) return;
      try {
        setLoadingInitial(true);
        const data = await fetchTenantDetails(tenantId);
        if (mounted && data) {
          setKosName(data.name || '');
          setAddress(data.address || '');
          setContactPhone(data.contact_phone || '');
          if (data.settings?.default_rent_price) {
            setDefaultRentPrice(data.settings.default_rent_price);
          }
          if (data.settings?.billing_cycle) {
            setBillingCycle(data.settings.billing_cycle);
          }
          if (data.settings?.due_day) {
            setDueDay(data.settings.due_day);
          }
          if (data.settings?.bank_account) {
            setBankName(data.settings.bank_account.bank_name || 'BCA');
            setBankAccountNo(data.settings.bank_account.account_number || '');
            setBankAccountHolder(data.settings.bank_account.account_holder || '');
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[KosSetupWizard] Failed to fetch tenant:', err);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [tenantId, initialData]);

  // Inisialisasi daftar kamar default jika masih kosong
  useEffect(() => {
    if (roomList.length === 0) {
      const initial = Array.from({ length: 6 }, (_, i) => ({
        id: `room-${i + 1}`,
        label: `Kamar ${String(i + 1).padStart(2, '0')}`,
        status: 'vacant',
        facilities: [...selectedFacilities],
        price: defaultRentPrice,
      }));
      setRoomList(initial);
    }
  }, [roomList.length, defaultRentPrice, selectedFacilities]);

  // Toggle fasilitas
  const handleToggleFacility = (facility) => {
    setSelectedFacilities((prev) =>
      prev.includes(facility) ? prev.filter((f) => f !== facility) : [...prev, facility]
    );
  };

  // Generate kamar otomatis
  const handleGenerateRooms = () => {
    const count = parseInt(roomCountInput, 10);
    if (isNaN(count) || count <= 0) {
      toast.error('Jumlah kamar harus berupa angka positif.');
      return;
    }
    if (count > 50) {
      toast.error('Maksimal generate 50 kamar sekaligus.');
      return;
    }

    const generated = Array.from({ length: count }, (_, i) => {
      const numStr = String(i + 1).padStart(2, '0');
      return {
        id: `room-gen-${Date.now()}-${i + 1}`,
        label: `${roomPrefix.trim()} ${numStr}`.trim(),
        status: 'vacant',
        facilities: [...selectedFacilities],
        price: defaultRentPrice,
      };
    });

    setRoomList(generated);
    toast.success(`${count} kamar berhasil digenerate.`);
  };

  // Tambah kamar manual
  const handleAddRoomManual = () => {
    if (!manualRoomLabel.trim()) {
      toast.error('Nama atau nomor kamar wajib diisi.');
      return;
    }
    if (roomList.some((r) => r.label.toLowerCase() === manualRoomLabel.trim().toLowerCase())) {
      toast.error(`Kamar "${manualRoomLabel.trim()}" sudah ada dalam daftar.`);
      return;
    }

    const price = parseFloat(manualRoomPrice) || defaultRentPrice;
    setRoomList((prev) => [
      ...prev,
      {
        id: `room-manual-${Date.now()}`,
        label: manualRoomLabel.trim(),
        status: 'vacant',
        facilities: [...selectedFacilities],
        price,
      },
    ]);
    setManualRoomLabel('');
    setManualRoomPrice('');
    toast.success(`Kamar "${manualRoomLabel.trim()}" ditambahkan.`);
  };

  const handleRemoveRoom = (idToRemove) => {
    if (roomList.length <= 1) {
      toast.error('Minimal harus ada 1 kamar di kos Anda.');
      return;
    }
    setRoomList((prev) => prev.filter((r) => r.id !== idToRemove));
  };

  // Tambah biaya tambahan
  const handleAddFee = () => {
    if (!newFeeName.trim()) {
      toast.error('Nama biaya tambahan tidak boleh kosong.');
      return;
    }
    const amt = parseFloat(newFeeAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Nominal biaya harus lebih dari Rp 0.');
      return;
    }
    setAdditionalFees((prev) => [
      ...prev,
      { id: `fee-${Date.now()}`, name: newFeeName.trim(), amount: amt },
    ]);
    setNewFeeName('');
    setNewFeeAmount('');
    toast.success(`Biaya "${newFeeName.trim()}" ditambahkan.`);
  };

  const handleRemoveFee = (id) => {
    setAdditionalFees((prev) => prev.filter((f) => f.id !== id));
  };

  // Simpan Setup Selesai
  const handleSaveSetup = async () => {
    if (!kosName.trim()) {
      toast.error('Nama kos-kosan tidak boleh kosong.');
      setCurrentStep(1);
      return;
    }
    if (roomList.length === 0) {
      toast.error('Anda harus menentukan minimal 1 kamar.');
      setCurrentStep(2);
      return;
    }
    if (!defaultRentPrice || defaultRentPrice <= 0) {
      toast.error('Harga sewa bulanan standar harus lebih dari Rp 0.');
      setCurrentStep(3);
      return;
    }

    setSaving(true);
    try {
      const inviteCode = generateInviteCode(kosName);

      // 1. Simpan kamar ke tenant_units (status: 'vacant', metadata kos)
      await bulkCreateTenantUnits(
        tenantId,
        roomList.map((r, index) => ({
          label: r.label,
          status: 'vacant', // status default kamar kos adalah kosong/siap sewa
          metadata: {
            room_number: r.label,
            order_index: index + 1,
            facilities: r.facilities || selectedFacilities,
            default_rent_price: Number(r.price) || defaultRentPrice,
            initial_wizard: true,
          },
        }))
      );

      // 2. Simpan settings profil tenant kos
      const settingsPayload = {
        onboarding_completed: true,
        invite_code: inviteCode,
        default_rent_price: Number(defaultRentPrice),
        billing_cycle: billingCycle,
        due_day: Number(dueDay) || 1,
        kos_rules: kosRules.trim(),
        additional_fees: additionalFees.map((f) => ({
          name: f.name,
          amount: Number(f.amount),
        })),
        bank_account: {
          bank_name: bankName.trim(),
          account_number: bankAccountNo.trim(),
          account_holder: bankAccountHolder.trim(),
        },
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: kosName.trim(),
        address: address.trim(),
        contact_phone: contactPhone.trim(),
        settings: settingsPayload,
      });

      await refreshTenant();
      setGeneratedInviteCode(inviteCode);
      setSetupFinished(true);
      toast.success('Pengaturan awal Kos-kosan berhasil disimpan!');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[KosSetupWizard] Save failed:', err);
      toast.error(err.message || 'Gagal menyimpan pengaturan kos.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan formulir pendaftaran penyewa disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-600 animate-pulse text-sm">
          Menyiapkan formulir inisiasi kos-kosan...
        </div>
      </div>
    );
  }

  // Layar Sukses Selesai Setup
  if (setupFinished) {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xs text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-xs">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-forest-800">Setup Kos Selesai</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1 font-display">
              {kosName} Siap Beroperasi!
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Sebanyak <strong className="text-slate-900">{roomList.length} kamar</strong> telah siap disewakan dengan tarif standar{' '}
              <strong className="text-forest-900">{formatRupiah(defaultRentPrice)}/bulan</strong>.
            </p>
          </div>

          {/* Kotak Kode Undangan Penyewa */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Kode Pendaftaran Calon Penyewa
              </span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                Langsung Aktif
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="font-mono text-lg sm:text-xl font-bold text-forest-900 tracking-wider">
                {generatedInviteCode}
              </span>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs"
              >
                {copiedCode ? <AiOutlineCheck /> : <AiOutlineCopy />}
                <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Bagikan tautan atau kode ini ke calon penyewa agar mereka dapat mengisi formulir identitas dan memilih kamar yang diinginkan secara mandiri.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/t/${tenantId}/dashboard`}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-sm transition-colors shadow-xs"
            >
              <span>Masuk ke Dashboard Kos</span>
              <AiOutlineArrowRight />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Breadcrumb & Title */}
        <div>
          <button
            type="button"
            onClick={() => navigate(`/t/${tenantId}/dashboard`)}
            className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 transition-colors mb-3"
          >
            <AiOutlineArrowLeft /> Kembali ke Dashboard
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-forest-800 uppercase tracking-wider block mb-1">
                Onboarding Vertikal Kos-Kosan
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                Inisiasi Properti &amp; Kamar Kos
              </h1>
            </div>
            <div className="text-xs text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs w-fit">
              Langkah <strong className="text-forest-800">{currentStep}</strong> dari 4
            </div>
          </div>
        </div>

        {/* Stepper Wizard Progress */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 pb-2 border-b border-slate-200">
          {[
            { step: 1, label: 'Identitas Kos', icon: AiOutlineHome },
            { step: 2, label: 'Daftar Kamar', icon: AiOutlineAppstore },
            { step: 3, label: 'Ketentuan Sewa', icon: AiOutlineDollarCircle },
            { step: 4, label: 'Review & Selesai', icon: AiOutlineCheckCircle },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentStep === item.step;
            const isPassed = currentStep > item.step;

            return (
              <button
                key={item.step}
                type="button"
                onClick={() => {
                  if (isPassed) setCurrentStep(item.step);
                }}
                className={`text-left p-2 sm:p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-forest-50 border-2 border-forest-800 text-forest-900 font-bold shadow-xs'
                    : isPassed
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-sm sm:text-base">
                  <Icon />
                  <span className="text-xs font-semibold hidden sm:inline">Langkah {item.step}</span>
                </div>
                <p className="text-[11px] sm:text-xs truncate">{item.label}</p>
              </button>
            );
          })}
        </div>

        {/* STEP 1: Identitas & Lokasi Kos */}
        {currentStep === 1 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display">Langkah 1: Identitas Properti Kos</h2>
              <p className="text-xs text-slate-500 mt-1">
                Tentukan nama bangunan kos, alamat lengkap, dan kontak pengelola untuk komunikasi dengan calon penyewa.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Kos-Kosan / Kontrakan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={kosName}
                  onChange={(e) => setKosName(e.target.value)}
                  placeholder="Contoh: Kos Melati Harmoni / Paviliun 88"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Alamat Lengkap Lokasi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contoh: Jl. Melati Raya No. 12, Sleman, Yogyakarta"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nomor WhatsApp Pengelola / Penjaga <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Peraturan Umum Kos (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={kosRules}
                  onChange={(e) => setKosRules(e.target.value)}
                  placeholder="Contoh: Jam bertamu maksimal pukul 22.00, dilarang merokok di dalam kamar, menjaga kebersihan bersama."
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!kosName.trim()) {
                    toast.error('Nama kos tidak boleh kosong.');
                    return;
                  }
                  setCurrentStep(2);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs"
              >
                <span>Lanjut ke Daftar Kamar</span>
                <AiOutlineArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Daftar & Konfigurasi Kamar */}
        {currentStep === 2 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display">Langkah 2: Konfigurasi Kamar Kos</h2>
              <p className="text-xs text-slate-500 mt-1">
                Generate daftar kamar otomatis atau tambahkan kamar satu per satu. Setiap kamar baru akan berstatus{' '}
                <strong className="text-emerald-700">Vacant (Siap Sewa)</strong>.
              </p>
            </div>

            {/* Pemilihan Fasilitas Umum Bawaan */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Fasilitas Standar Kamar
              </span>
              <div className="flex flex-wrap gap-2">
                {COMMON_FACILITIES.map((f) => {
                  const isSelected = selectedFacilities.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleToggleFacility(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generator Kamar Otomatis */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Generator Kamar Cepat
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prefix Kamar</label>
                  <input
                    type="text"
                    value={roomPrefix}
                    onChange={(e) => setRoomPrefix(e.target.value)}
                    placeholder="Kamar "
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Jumlah Kamar</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={roomCountInput}
                    onChange={(e) => setRoomCountInput(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleGenerateRooms}
                    className="w-full py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shadow-xs"
                  >
                    Generate Ulang
                  </button>
                </div>
              </div>
            </div>

            {/* Tambah Kamar Manual */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={manualRoomLabel}
                onChange={(e) => setManualRoomLabel(e.target.value)}
                placeholder="Tambah kamar manual (misal: Kamar VIP Depan)"
                className="flex-1 w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-forest-800 focus:outline-none shadow-xs"
              />
              <button
                type="button"
                onClick={handleAddRoomManual}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 border border-slate-200 transition-colors shadow-xs"
              >
                <AiOutlinePlus />
                <span>Tambah Kamar</span>
              </button>
            </div>

            {/* List Kamar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Daftar Kamar ({roomList.length} unit terdaftar)</span>
                <span>Status Awal</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {roomList.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div>
                      <strong className="text-xs text-slate-900 block">{r.label}</strong>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block mt-0.5 font-semibold">
                        Siap Huni (Vacant)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRoom(r.id)}
                      title="Hapus kamar"
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs transition-colors"
                    >
                      <AiOutlineDelete />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-xs"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (roomList.length === 0) {
                    toast.error('Minimal harus ada 1 kamar.');
                    return;
                  }
                  setCurrentStep(3);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs"
              >
                <span>Lanjut ke Ketentuan Sewa</span>
                <AiOutlineArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Tarif Sewa Default & Rekening Penagihan */}
        {currentStep === 3 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display">Langkah 3: Tarif Sewa &amp; Rekening Penagihan</h2>
              <p className="text-xs text-slate-500 mt-1">
                Atur harga sewa standar per kamar, siklus tagihan, serta rekening bank tujuan pembayaran sewa penyewa.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Harga Sewa Standar per Bulan (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={100000}
                  step={50000}
                  value={defaultRentPrice}
                  onChange={(e) => setDefaultRentPrice(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
                <span className="text-[11px] text-forest-800 font-semibold mt-1 block">
                  {formatRupiah(defaultRentPrice)} / bulan
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Siklus Penagihan Default
                </label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                >
                  <option value="monthly">Bulanan (Setiap Bulan)</option>
                  <option value="quarterly">3 Bulanan (Per Triwulan)</option>
                  <option value="biannual">6 Bulanan (Per Semester)</option>
                  <option value="annual">Tahunan (Per Tahun)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Jatuh Tempo Penagihan
                </label>
                <select
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                >
                  {[1, 5, 10, 15, 20, 25, 28].map((d) => (
                    <option key={d} value={d}>
                      Tanggal {d} setiap bulan
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Bank Penerima
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Contoh: BCA / Mandiri / BRI"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nomor Rekening Bank
                </label>
                <input
                  type="text"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="Contoh: 8830123456"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Atas Nama Pemilik Rekening
                </label>
                <input
                  type="text"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                  placeholder="Contoh: Pengelola Kos Melati"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                />
              </div>
            </div>

            {/* Biaya Tambahan Opsional */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Biaya Tambahan (Opsional)
              </span>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  value={newFeeName}
                  onChange={(e) => setNewFeeName(e.target.value)}
                  placeholder="Nama biaya (misal: Parkir Mobil, Laundry)"
                  className="flex-1 w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-forest-800 focus:outline-none shadow-xs"
                />
                <input
                  type="number"
                  value={newFeeAmount}
                  onChange={(e) => setNewFeeAmount(e.target.value)}
                  placeholder="Nominal (Rp)"
                  className="w-full sm:w-36 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-forest-800 focus:outline-none shadow-xs"
                />
                <button
                  type="button"
                  onClick={handleAddFee}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 border border-slate-200 shadow-xs"
                >
                  Tambah Biaya
                </button>
              </div>

              {additionalFees.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {additionalFees.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-800 font-medium">{f.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-forest-800 font-bold">{formatRupiah(f.amount)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFee(f.id)}
                          className="text-rose-500 hover:text-rose-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-xs"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!defaultRentPrice || defaultRentPrice <= 0) {
                    toast.error('Tarif sewa bulanan harus lebih dari Rp 0.');
                    return;
                  }
                  setCurrentStep(4);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs"
              >
                <span>Lanjut ke Review</span>
                <AiOutlineArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Selesai */}
        {currentStep === 4 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display">Langkah 4: Tinjau &amp; Aktifkan Kos</h2>
              <p className="text-xs text-slate-500 mt-1">
                Periksa kembali data properti sebelum disimpan ke sistem SaaS RuangWarga.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Ringkasan Properti */}
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-forest-800 uppercase tracking-wider block">
                  Identitas Properti
                </span>
                <div>
                  <span className="text-xs text-slate-500 block">Nama Kos:</span>
                  <strong className="text-sm text-slate-900">{kosName}</strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Alamat:</span>
                  <span className="text-xs text-slate-700">{address || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Kontak WhatsApp:</span>
                  <span className="text-xs text-slate-700">{contactPhone || '-'}</span>
                </div>
              </div>

              {/* Ringkasan Tarif & Rekening */}
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                  Ketentuan Sewa &amp; Rekening
                </span>
                <div>
                  <span className="text-xs text-slate-500 block">Tarif Sewa Standar:</span>
                  <strong className="text-sm text-slate-900">{formatRupiah(defaultRentPrice)} / bulan</strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Siklus &amp; Jatuh Tempo:</span>
                  <span className="text-xs text-slate-700 capitalize">
                    {billingCycle} &bull; Setiap tanggal {dueDay}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Rekening Bank:</span>
                  <span className="text-xs text-slate-700">
                    {bankName} {bankAccountNo} a.n {bankAccountHolder || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ringkasan Kamar Siap Disewa */}
            <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Kamar Siap Disewa ({roomList.length} Kamar)
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                  Status: Vacant
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {roomList.map((r) => (
                  <span
                    key={r.id}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs"
                  >
                    {r.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-xs"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={handleSaveSetup}
                disabled={saving}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-extrabold transition-all shadow-xs disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                    <span>Menyimpan Konfigurasi...</span>
                  </>
                ) : (
                  <>
                    <AiOutlineCheckCircle className="text-base" />
                    <span>Simpan &amp; Aktifkan Kos</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
