import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineArrowLeft,
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineDollarCircle,
  AiOutlineBank,
  AiOutlineCalendar,
  AiOutlineBook,
  AiOutlineUser,
  AiOutlineInfoCircle,
  AiOutlineUsergroupAdd,
  AiOutlineShareAlt,
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

const CLASS_TYPES = [
  {
    id: 'reguler',
    name: 'Kelas Reguler / Sekolah',
    description: 'Kelas belajar kelompok atau sekolah dengan banyak siswa dan biaya SPP seragam.',
    icon: '🏫',
    defaultSlots: 20,
    prefix: 'Siswa #',
  },
  {
    id: 'privat',
    name: 'Les Privat / Bimbel Kecil',
    description: 'Bimbingan belajar intensif 1-on-1 atau kelompok kecil dengan perhatian khusus.',
    icon: '🧑‍🏫',
    defaultSlots: 5,
    prefix: 'Siswa #',
  },
];

const BANK_OPTIONS = [
  'BCA',
  'Bank Mandiri',
  'BRI',
  'BNI',
  'BSI (Bank Syariah Indonesia)',
  'Bank Jago',
  'SeaBank',
  'GoPay / OVO / Dana',
  'Lainnya',
];

export default function KelasSetupWizard({ tenantId: propTenantId, initialData }) {
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
  const [copiedWaMessage, setCopiedWaMessage] = useState(false);

  // Step 1: Identitas & Tipe Kelas
  const [classType, setClassType] = useState(initialData?.settings?.class_type || 'reguler');
  const [className, setClassName] = useState(initialData?.name || '');
  const [subject, setSubject] = useState(initialData?.settings?.subject || '');
  const [instructorName, setInstructorName] = useState(initialData?.settings?.instructor_name || '');
  const [contactPhone, setContactPhone] = useState(initialData?.contact_phone || '');
  const [classDescription, setClassDescription] = useState(
    initialData?.settings?.class_description || ''
  );

  // Step 2: Kuota & Slot Siswa
  const [slotCountInput, setSlotCountInput] = useState(
    initialData?.settings?.class_type === 'privat' ? 5 : 20
  );
  const [slotPrefix, setSlotPrefix] = useState('Siswa #');
  const [slotList, setSlotList] = useState([]);
  const [manualSlotLabel, setManualSlotLabel] = useState('');

  // Step 3: Biaya SPP & Rekening Pembayaran
  const [sppAmount, setSppAmount] = useState(
    initialData?.settings?.spp_amount || 200000
  );
  const [dueDay, setDueDay] = useState(initialData?.settings?.due_day || 10);
  const [billingCycle] = useState('monthly');
  const [bankName, setBankName] = useState('BCA');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [sppNotes, setSppNotes] = useState(
    initialData?.settings?.spp_notes ||
      'SPP dibayarkan setiap bulan paling lambat sesuai tanggal jatuh tempo untuk kelancaran kegiatan belajar mengajar.'
  );

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  // Load initial data jika belum disediakan via prop
  useEffect(() => {
    let isMounted = true;
    if (initialData) {
      setLoadingInitial(false);
      return;
    }

    async function loadData() {
      if (!tenantId) return;
      try {
        setLoadingInitial(true);
        const data = await fetchTenantDetails(tenantId);
        if (!isMounted) return;

        if (data) {
          if (data.name) setClassName(data.name);
          if (data.contact_phone) setContactPhone(data.contact_phone);
          if (data.settings) {
            if (data.settings.class_type) setClassType(data.settings.class_type);
            if (data.settings.subject) setSubject(data.settings.subject);
            if (data.settings.instructor_name) setInstructorName(data.settings.instructor_name);
            if (data.settings.spp_amount) setSppAmount(data.settings.spp_amount);
            if (data.settings.due_day) setDueDay(data.settings.due_day);
            if (data.settings.bank_info) {
              setBankName(data.settings.bank_info.bank_name || 'BCA');
              setBankAccountNo(data.settings.bank_info.account_number || '');
              setBankAccountHolder(data.settings.bank_info.account_holder || '');
            }
          }
        }
      } catch (err) {
        console.error('[KelasSetupWizard] Gagal memuat detail tenant:', err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [tenantId, initialData]);

  // Inisiasi slot list default berdasarkan classType
  useEffect(() => {
    const defaultCount = classType === 'privat' ? 5 : 20;
    setSlotCountInput(defaultCount);
    setSlotList(
      Array.from({ length: defaultCount }, (_, i) => ({
        id: `slot-${i + 1}`,
        label: `Siswa #${String(i + 1).padStart(2, '0')}`,
      }))
    );
  }, [classType]);

  // Handler Generate Slot Siswa Otomatis
  const handleGenerateSlots = () => {
    const count = parseInt(slotCountInput, 10);
    if (isNaN(count) || count <= 0) {
      toast.error('Jumlah kuota siswa harus berupa angka positif minimal 1.');
      return;
    }
    if (count > 100) {
      toast.error('Kapasitas kelas maksimal 100 slot siswa untuk satu grup.');
      return;
    }

    const generated = Array.from({ length: count }, (_, i) => ({
      id: `slot-${Date.now()}-${i + 1}`,
      label: `${slotPrefix}${String(i + 1).padStart(2, '0')}`,
    }));

    setSlotList(generated);
    toast.success(`Berhasil membuat ${count} slot siswa.`);
  };

  // Handler Tambah Slot Manual
  const handleAddManualSlot = () => {
    if (!manualSlotLabel.trim()) return;
    const newSlot = {
      id: `slot-${Date.now()}`,
      label: manualSlotLabel.trim(),
    };
    setSlotList((prev) => [...prev, newSlot]);
    setManualSlotLabel('');
  };

  // Handler Hapus Slot
  const handleRemoveSlot = (id) => {
    if (slotList.length <= 1) {
      toast.warning('Kelas minimal harus memiliki 1 slot siswa.');
      return;
    }
    setSlotList((prev) => prev.filter((item) => item.id !== id));
  };

  // Validasi Tiap Langkah
  const validateStep = (step) => {
    if (step === 1) {
      if (!className.trim()) {
        toast.error('Nama kelas atau kursus wajib diisi.');
        return false;
      }
      if (!instructorName.trim()) {
        toast.error('Nama pengajar atau wali kelas wajib diisi.');
        return false;
      }
      if (!contactPhone.trim()) {
        toast.error('Nomor kontak WhatsApp pengajar wajib diisi.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (slotList.length === 0) {
        toast.error('Daftar slot siswa tidak boleh kosong.');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!sppAmount || sppAmount <= 0) {
        toast.error('Nominal SPP atau biaya per siswa harus lebih dari Rp 0.');
        return false;
      }
      if (!dueDay || dueDay < 1 || dueDay > 28) {
        toast.error('Tanggal jatuh tempo SPP harus antara tanggal 1 hingga 28.');
        return false;
      }
      if (!bankAccountNo.trim() || !bankAccountHolder.trim()) {
        toast.error('Nomor rekening dan nama pemilik rekening penerima SPP wajib diisi.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Simpan Konfigurasi Lengkap Kelas
  const handleSaveAll = async () => {
    if (!validateStep(3)) return;

    try {
      setSaving(true);

      // 1. Buat slot siswa ke tabel tenant_units (generik)
      const unitsPayload = slotList.map((slot, index) => ({
        label: slot.label,
        type: 'seat',
        floor: 1,
        capacity: 1,
        status: 'vacant',
        metadata: {
          slot_index: index + 1,
          slot_type: classType === 'privat' ? 'private_student' : 'regular_student',
          expected_spp: Number(sppAmount),
        },
      }));

      await bulkCreateTenantUnits(tenantId, unitsPayload);

      // 2. Generate kode undangan unik
      const inviteCode = await generateInviteCode(tenantId, 'anggota');

      // 3. Simpan metadata pengaturan kelas ke tabel tenants
      const settingsPayload = {
        class_type: classType,
        subject: subject.trim(),
        instructor_name: instructorName.trim(),
        class_description: classDescription.trim(),
        slot_count: slotList.length,
        spp_amount: Number(sppAmount),
        due_day: Number(dueDay),
        billing_cycle: billingCycle,
        bank_info: {
          bank_name: bankName,
          account_number: bankAccountNo.trim(),
          account_holder: bankAccountHolder.trim(),
        },
        spp_notes: sppNotes.trim(),
        invite_code: inviteCode,
        is_setup_completed: true,
        current_cycle: 1,
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: className.trim(),
        contact_phone: contactPhone.trim(),
        address: `Pengajar: ${instructorName.trim()} | Mata Pelajaran: ${subject.trim() || '-'}`,
        settings: settingsPayload,
      });

      await refreshTenant();
      setGeneratedInviteCode(inviteCode);
      setSetupFinished(true);
      toast.success('Pengaturan awal kelas berhasil disimpan!');
    } catch (err) {
      console.error('[KelasSetupWizard] Gagal menyimpan setup kelas:', err);
      toast.error(err.message || 'Gagal menyimpan konfigurasi setup wizard.');
    } finally {
      setSaving(false);
    }
  };

  // Copy Tautan Undangan
  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan undangan disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Format Pesan WhatsApp untuk Wali Murid / Siswa
  const waInviteMessage = useMemo(() => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    return `Halo Bapak/Ibu Wali Murid & Siswa *${className}*,\n\nKami mengundang Anda untuk bergabung ke portal kelas digital kami. Melalui tautan ini, Anda dapat memantau status SPP, jadwal belajar, dan pengumuman kelas secara transparan:\n\n🔗 ${inviteUrl}\n\nKode Undangan: *${generatedInviteCode}*\nPengajar: *${instructorName}*\n\nTerima kasih! 🙏`;
  }, [className, generatedInviteCode, instructorName]);

  const handleCopyWaMessage = () => {
    navigator.clipboard.writeText(waInviteMessage);
    setCopiedWaMessage(true);
    toast.success('Pesan undangan WhatsApp disalin!');
    setTimeout(() => setCopiedWaMessage(false), 2500);
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-600 animate-pulse text-sm">
          Menyiapkan formulir inisiasi kelas...
        </div>
      </div>
    );
  }

  // Tampilan Layar Sukses (Langkah 4)
  if (setupFinished) {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    const waShareUrl = `https://wa.me/?text=${encodeURIComponent(waInviteMessage)}`;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xs text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center mx-auto text-4xl shadow-xs">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <span className="text-xs font-bold text-blue-700 uppercase tracking-widest block mb-1">
              Setup Kelas Selesai
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
              {className} Siap Digunakan!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2">
              Kapasitas {slotList.length} slot siswa telah diinisiasi dengan SPP bulanan{' '}
              <strong className="text-blue-700 font-bold">{formatRupiah(sppAmount)}</strong> jatuh tempo tanggal{' '}
              {dueDay}.
            </p>
          </div>

          {/* Kartu Ringkasan Kelas */}
          <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500">Tipe Kelas:</span>
              <span className="font-bold text-slate-900 capitalize">{classType === 'privat' ? 'Les Privat' : 'Kelas Reguler'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500">Pengajar / Pengelola:</span>
              <span className="font-semibold text-slate-800">{instructorName}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500">Total Kuota Siswa:</span>
              <span className="font-bold text-blue-700">{slotList.length} Siswa</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Iuran SPP Bulanan:</span>
              <span className="font-bold text-emerald-700">{formatRupiah(sppAmount)} / bulan</span>
            </div>
          </div>

          {/* Kotak Tautan Undangan */}
          <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 sm:p-5 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900">Tautan Masuk Wali Murid &amp; Siswa</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                Kode: {generatedInviteCode}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="bg-transparent text-xs text-slate-800 font-mono select-all focus:outline-none flex-1 truncate"
              />
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
                title="Salin Tautan"
              >
                {copiedCode ? <AiOutlineCheck className="text-emerald-600" /> : <AiOutlineCopy />}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyWaMessage}
                className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-200 shadow-xs"
              >
                {copiedWaMessage ? <AiOutlineCheck className="text-emerald-600" /> : <AiOutlineCopy />}
                <span>Salin Teks Undangan WA</span>
              </button>

              <a
                href={waShareUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <AiOutlineShareAlt className="text-sm" />
                <span>Bagikan ke WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/dashboard`)}
              className="w-full py-3.5 px-6 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-extrabold text-sm shadow-xs transition-all"
            >
              Masuk ke Dashboard Kelas &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header Setup Wizard */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider mb-1">
            <span>📚 Wizard Inisiasi Kelas &amp; Kursus</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
            Konfigurasi Portal Kelas
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            Atur identitas kelas, kuota siswa, jadwal SPP, dan nomor rekening penerima sebelum mengundang siswa dan wali murid.
          </p>
        </div>

        {/* Stepper Indikator (3 Langkah) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Identitas' },
              { num: 2, label: 'Slot Siswa' },
              { num: 3, label: 'SPP & Rekening' },
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border transition-all ${
                      currentStep === s.num
                        ? 'bg-blue-700 border-blue-700 text-white shadow-xs'
                        : currentStep > s.num
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {currentStep > s.num ? <AiOutlineCheck /> : s.num}
                  </div>
                  <div className="hidden sm:block text-left">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block leading-none">
                      Langkah {s.num}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        currentStep === s.num ? 'text-blue-900 font-bold' : 'text-slate-700'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>
                {idx < 2 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 sm:mx-6 ${
                      currentStep > s.num ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Kontainer Form Wizard */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          {/* LANGKAH 1: IDENTITAS & TIPE KELAS */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AiOutlineBook className="text-blue-700 text-xl" />
                  <span>Identitas &amp; Tipe Pembelajaran</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pilih model kelas dan lengkapi rincian pengajar pengelola.
                </p>
              </div>

              {/* Pemilihan Tipe Kelas (Reguler vs Privat) */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Tipe Kelas <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CLASS_TYPES.map((type) => {
                    const isSelected = classType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setClassType(type.id)}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between shadow-xs ${
                          isSelected
                            ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">{type.icon}</span>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs">
                                <AiOutlineCheck />
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{type.name}</h4>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {type.description}
                          </p>
                        </div>
                        <span className="mt-3 text-[10px] font-bold text-blue-700">
                          Rekomendasi awal: {type.defaultSlots} Slot Siswa
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Input Detail Kelas */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Kelas / Kursus <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="Contoh: Kelas 5B SD Juara / Kursus Bahasa Inggris Privat"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-forest-800 shadow-xs transition-colors placeholder-slate-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mata Pelajaran / Bidang
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Contoh: Matematika, Fisika, Menggambar"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-forest-800 shadow-xs transition-colors placeholder-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Pengajar / Wali Kelas <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={instructorName}
                      onChange={(e) => setInstructorName(e.target.value)}
                      placeholder="Contoh: Ibu Rina S.Pd / Kak Dimas"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-forest-800 shadow-xs transition-colors placeholder-slate-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Kontak WhatsApp Pengajar <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-forest-800 shadow-xs transition-colors placeholder-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Deskripsi / Jadwal Belajar Singkat
                    </label>
                    <input
                      type="text"
                      value={classDescription}
                      onChange={(e) => setClassDescription(e.target.value)}
                      placeholder="Contoh: Setiap Selasa & Kamis pukul 16.00 WIB"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-forest-800 shadow-xs transition-colors placeholder-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 2: KUOTA & SLOT SISWA */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AiOutlineUsergroupAdd className="text-blue-700 text-xl" />
                  <span>Kapasitas &amp; Slot Siswa</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tentukan jumlah kuota siswa di kelas ini. Tiap slot akan menjadi tempat pendaftaran bagi siswa atau wali murid.
                </p>
              </div>

              {/* Generator Otomatis */}
              <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                <span className="text-xs font-bold text-blue-900 uppercase tracking-wider block">
                  Generator Cepat Slot Siswa
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Prefix Label</label>
                    <input
                      type="text"
                      value={slotPrefix}
                      onChange={(e) => setSlotPrefix(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Jumlah Kuota</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={slotCountInput}
                      onChange={(e) => setSlotCountInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleGenerateSlots}
                      className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-blue-700 border border-blue-200 text-xs font-bold transition-colors shadow-xs"
                    >
                      Generate Ulang
                    </button>
                  </div>
                </div>
              </div>

              {/* Tambah Slot Manual */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSlotLabel}
                  onChange={(e) => setManualSlotLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManualSlot()}
                  placeholder="Tambah slot khusus (misal: Siswa Cadangan / Kursi A)..."
                  className="flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={handleAddManualSlot}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 shadow-xs"
                >
                  <AiOutlinePlus />
                  <span>Tambah</span>
                </button>
              </div>

              {/* Daftar Slot Siswa Terdaftar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Daftar Slot Siap Didaftarkan ({slotList.length} Slot)
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pr-1">
                  {slotList.map((slot) => (
                    <div
                      key={slot.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs group hover:border-slate-300 shadow-xs"
                    >
                      <span className="truncate font-medium text-slate-800" title={slot.label}>
                        {slot.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 opacity-60 group-hover:opacity-100 transition-opacity"
                        title="Hapus Slot"
                      >
                        <AiOutlineDelete className="text-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 3: BIAYA SPP & REKENING PEMBAYARAN */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AiOutlineDollarCircle className="text-blue-700 text-xl" />
                  <span>Biaya SPP &amp; Rekening Pembayaran</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tentukan nominal iuran berkala per siswa, tanggal penagihan bulanan, dan rekening bank penerima.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal SPP / Iuran per Siswa (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="10000"
                    step="10000"
                    value={sppAmount}
                    onChange={(e) => setSppAmount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-bold text-base focus:outline-none focus:border-forest-800 shadow-xs"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Terbaca: <strong className="text-blue-700">{formatRupiah(sppAmount)}</strong> / bulan
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Jatuh Tempo Bulanan <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={dueDay}
                      onChange={(e) => setDueDay(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-bold text-sm focus:outline-none focus:border-forest-800 shadow-xs"
                    />
                    <span className="text-xs text-slate-500 shrink-0">tiap bulan</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Paling lambat tanggal 1 s.d. 28 setiap bulannya.
                  </span>
                </div>
              </div>

              {/* Rincian Rekening Bank */}
              <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <AiOutlineBank className="text-base text-blue-700" />
                  <span>Rekening Tujuan Pembayaran SPP</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Bank / E-Wallet</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    >
                      {BANK_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Nomor Rekening</label>
                    <input
                      type="text"
                      required
                      value={bankAccountNo}
                      onChange={(e) => setBankAccountNo(e.target.value)}
                      placeholder="Contoh: 1234567890"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Atas Nama Pemilik</label>
                    <input
                      type="text"
                      required
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      placeholder="Contoh: Rina Kusuma"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Catatan / Kebijakan SPP */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan / Kebijakan Iuran SPP
                </label>
                <textarea
                  rows="2"
                  value={sppNotes}
                  onChange={(e) => setSppNotes(e.target.value)}
                  placeholder="Informasi tambahan terkait kebijakan pembayaran SPP..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs transition-colors placeholder-slate-400"
                />
              </div>
            </div>
          )}

          {/* Tombol Navigasi Bawah */}
          <div className="pt-6 mt-6 border-t border-slate-200 flex items-center justify-between">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-2 border border-slate-200 transition-colors disabled:opacity-50 shadow-xs"
              >
                <AiOutlineArrowLeft />
                <span>Sebelumnya</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs flex items-center gap-2 transition-all shadow-xs"
              >
                <span>Lanjutkan</span>
                <AiOutlineArrowRight />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs flex items-center gap-2 transition-all shadow-xs disabled:opacity-50"
              >
                {saving ? (
                  <span>Menyimpan Pengaturan...</span>
                ) : (
                  <>
                    <AiOutlineCheck />
                    <span>Simpan &amp; Terbitkan Kelas</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
