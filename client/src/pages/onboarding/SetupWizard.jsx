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
  AiOutlineIdcard,
  AiOutlineDollarCircle,
  AiOutlineBank,
  AiOutlineCluster,
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
import KosSetupWizard from './KosSetupWizard';
import ArisanSetupWizard from './ArisanSetupWizard';
import KelasSetupWizard from './KelasSetupWizard';

const DEFAULT_IPL_COMPONENTS = [
  { id: 'comp-1', name: 'Keamanan Lingkungan', amount: 80000 },
  { id: 'comp-2', name: 'Kebersihan & Sampah', amount: 30000 },
  { id: 'comp-3', name: 'Kas Paguyuban / RT', amount: 20000 },
  { id: 'comp-4', name: 'Dana Duka Cita (Sosial)', amount: 10000 },
];

export default function SetupWizard() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { activeTenant, activeTenantId, switchTenant, refreshTenant, isTenantAdmin } = useTenant();

  const [currentStep, setCurrentStep] = useState(1);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupFinished, setSetupFinished] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [tenantType, setTenantType] = useState('rt_rw');
  const [tenantDetails, setTenantDetails] = useState(null);

  // Step 1: Identitas Komplek
  const [complexName, setComplexName] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Step 2: Generator & Daftar Unit
  const [blockPrefix, setBlockPrefix] = useState('Blok A-');
  const [unitCountInput, setUnitCountInput] = useState(10);
  const [unitList, setUnitList] = useState([]);
  const [newUnitLabel, setNewUnitLabel] = useState('');

  // Step 3: Komponen IPL & Aturan Tagihan
  const [iplComponents, setIplComponents] = useState(DEFAULT_IPL_COMPONENTS);
  const [newCompName, setNewCompName] = useState('');
  const [newCompAmount, setNewCompAmount] = useState('');
  const [dueDay, setDueDay] = useState(10);
  const [bankName, setBankName] = useState('BCA');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  // Sinkronkan activeTenantId dengan URL param
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  // Load data tenant awal
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!tenantId) return;
      try {
        setLoadingInitial(true);
        const tenantData = await fetchTenantDetails(tenantId);
        if (mounted && tenantData) {
          const resolvedType = tenantData.type || activeTenant?.type || 'rt_rw';
          setTenantType(resolvedType);
          setTenantDetails(tenantData);

          setComplexName(tenantData.name || '');
          setAddress(tenantData.address || '');
          setContactPhone(tenantData.contact_phone || '');

          if (tenantData.settings?.ipl_components?.length > 0) {
            setIplComponents(tenantData.settings.ipl_components);
          }
          if (tenantData.settings?.due_day) {
            setDueDay(tenantData.settings.due_day);
          }
          if (tenantData.settings?.bank_account) {
            setBankName(tenantData.settings.bank_account.bank_name || 'BCA');
            setBankAccountNo(tenantData.settings.bank_account.account_number || '');
            setBankAccountHolder(tenantData.settings.bank_account.account_holder || '');
          }

          // Pre-populate unit list default jika belum ada
          setUnitList(
            Array.from({ length: 10 }, (_, i) => ({
              id: `u-${i + 1}`,
              label: `Blok A-${String(i + 1).padStart(2, '0')}`,
            }))
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SetupWizard] Failed to fetch tenant details:', err);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  // Total nominal IPL per bulan
  const totalIplAmount = useMemo(() => {
    return iplComponents.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [iplComponents]);

  // Format IDR
  const formatIDR = (num) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num || 0);
  };

  // Helper generate unit otomatis
  const handleGenerateUnits = () => {
    const count = parseInt(unitCountInput, 10);
    if (isNaN(count) || count <= 0) {
      toast.error('Jumlah unit harus berupa angka positif.');
      return;
    }
    if (count > 50) {
      toast.error('Untuk inisiasi awal, maksimal generate 50 unit sekaligus.');
      return;
    }

    const generated = Array.from({ length: count }, (_, i) => {
      const numStr = String(i + 1).padStart(2, '0');
      return {
        id: `gen-${Date.now()}-${i + 1}`,
        label: `${blockPrefix.trim()} ${numStr}`.trim(),
      };
    });

    setUnitList(generated);
    toast.success(`${count} unit berhasil digenerate.`);
  };

  const handleAddUnitManual = () => {
    if (!newUnitLabel.trim()) return;
    if (unitList.some((u) => u.label.toLowerCase() === newUnitLabel.trim().toLowerCase())) {
      toast.error(`Unit "${newUnitLabel.trim()}" sudah ada dalam daftar.`);
      return;
    }

    setUnitList((prev) => [
      ...prev,
      { id: `custom-${Date.now()}`, label: newUnitLabel.trim() },
    ]);
    setNewUnitLabel('');
  };

  const handleRemoveUnit = (idToRemove) => {
    setUnitList((prev) => prev.filter((u) => u.id !== idToRemove));
  };

  // Komponen IPL Handlers
  const handleAddIplComponent = () => {
    if (!newCompName.trim()) {
      toast.error('Nama komponen biaya tidak boleh kosong.');
      return;
    }
    const amt = parseFloat(newCompAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Nominal iuran harus lebih dari Rp 0.');
      return;
    }

    setIplComponents((prev) => [
      ...prev,
      { id: `comp-${Date.now()}`, name: newCompName.trim(), amount: amt },
    ]);
    setNewCompName('');
    setNewCompAmount('');
    toast.success(`Komponen "${newCompName.trim()}" ditambahkan.`);
  };

  const handleRemoveIplComponent = (id) => {
    if (iplComponents.length <= 1) {
      toast.error('Minimal harus ada satu komponen iuran IPL.');
      return;
    }
    setIplComponents((prev) => prev.filter((c) => c.id !== id));
  };

  // Simpan Setup Selesai
  const handleSaveSetup = async () => {
    if (!complexName.trim()) {
      toast.error('Nama komplek tidak boleh kosong.');
      setCurrentStep(1);
      return;
    }
    if (unitList.length === 0) {
      toast.error('Anda harus menentukan minimal 1 rumah/kavling unit.');
      setCurrentStep(2);
      return;
    }
    if (iplComponents.length === 0 || totalIplAmount <= 0) {
      toast.error('Komponen IPL harus diisi dan total iuran harus lebih dari Rp 0.');
      setCurrentStep(3);
      return;
    }

    setSaving(true);
    try {
      const inviteCode = generateInviteCode(complexName);

      // 1. Simpan unit ke tenant_units
      await bulkCreateTenantUnits(
        tenantId,
        unitList.map((u) => ({
          label: u.label,
          status: 'active',
          metadata: { initial_wizard: true },
        }))
      );

      // 2. Simpan settings dan profil tenant
      const settingsPayload = {
        onboarding_completed: true,
        invite_code: inviteCode,
        due_day: Number(dueDay) || 10,
        ipl_components: iplComponents.map((c) => ({
          name: c.name,
          amount: Number(c.amount),
        })),
        bank_account: {
          bank_name: bankName.trim(),
          account_number: bankAccountNo.trim(),
          account_holder: bankAccountHolder.trim(),
        },
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: complexName.trim(),
        address: address.trim(),
        contact_phone: contactPhone.trim(),
        settings: settingsPayload,
      });

      await refreshTenant();
      setGeneratedInviteCode(inviteCode);
      setSetupFinished(true);
      toast.success('Pengaturan awal RT/RW berhasil disimpan!');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SetupWizard] Save failed:', err);
      toast.error(err.message || 'Gagal menyimpan konfigurasi setup wizard.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan undangan disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-500 animate-pulse text-sm">
          Menyiapkan formulir inisiasi komplek...
        </div>
      </div>
    );
  }

  // Jika Tenant bertipe Kos-kosan, delegasikan ke KosSetupWizard khusus
  if (tenantType === 'kos') {
    return <KosSetupWizard tenantId={tenantId} initialData={tenantDetails} />;
  }

  // Jika Tenant bertipe Arisan, delegasikan ke ArisanSetupWizard khusus
  if (tenantType === 'arisan') {
    return <ArisanSetupWizard tenantId={tenantId} initialData={tenantDetails} />;
  }

  // Jika Tenant bertipe Kelas, delegasikan ke KelasSetupWizard khusus
  if (tenantType === 'kelas') {
    return <KelasSetupWizard tenantId={tenantId} initialData={tenantDetails} />;
  }

  // Jika Setup Selesai Tampilkan Layar Sukses
  if (setupFinished) {
    const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white border border-emerald-200 rounded-3xl p-8 shadow-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto text-3xl">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <span className="text-xs font-bold text-forest-800 uppercase tracking-widest block mb-1">
              Setup Wizard Selesai
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
              {complexName} Siap Digunakan!
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              {unitList.length} unit rumah telah terdaftar dengan tarif IPL {formatIDR(totalIplAmount)} / bulan.
              Sekarang Anda dapat mulai mengundang warga untuk bergabung.
            </p>
          </div>

          {/* Kartu Kode Undangan */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
              Tautan Undangan Warga (Invite Link)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full bg-white border border-slate-300 text-xs text-forest-900 font-mono rounded-xl px-3 py-2.5 focus:outline-none shadow-xs"
              />
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shrink-0 shadow-xs"
              >
                {copiedCode ? <AiOutlineCheck /> : <AiOutlineCopy />}
                <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Bagikan link ini ke grup WhatsApp RT/RW. Warga dapat memilih nomor rumah dan mengajukan akun.
            </p>
          </div>

          {/* Navigasi Lanjut */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/dashboard`)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-sm transition-colors shadow-xs"
            >
              <span>Masuk ke Dashboard RT/RW</span>
              <AiOutlineArrowRight />
            </button>
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
          <Link
            to={`/t/${tenantId}/dashboard`}
            className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 transition-colors mb-3"
          >
            <AiOutlineArrowLeft /> Kembali ke Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-forest-800 uppercase tracking-wider block mb-1">
                Onboarding Vertikal RT/RW
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                Panduan Pengaturan Awal Komplek
              </h1>
            </div>
            <div className="text-xs text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs w-fit">
              Langkah <strong className="text-forest-800">{currentStep}</strong> dari 4
            </div>
          </div>
        </div>

        {/* Stepper Header */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 pb-2 border-b border-slate-200">
          {[
            { step: 1, label: 'Profil Komplek', icon: <AiOutlineIdcard /> },
            { step: 2, label: 'Daftar Unit', icon: <AiOutlineCluster /> },
            { step: 3, label: 'Komponen IPL', icon: <AiOutlineDollarCircle /> },
            { step: 4, label: 'Konfirmasi', icon: <AiOutlineCheckCircle /> },
          ].map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setCurrentStep(s.step)}
              className={`text-left p-2 sm:p-3 rounded-xl border transition-all ${
                currentStep === s.step
                  ? 'bg-forest-50 border-2 border-forest-800 text-forest-900 font-bold shadow-xs'
                  : currentStep > s.step
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 shadow-xs'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-sm sm:text-base">
                <span>{s.icon}</span>
                <span className="text-xs font-semibold hidden sm:inline">Langkah {s.step}</span>
              </div>
              <p className="text-[11px] sm:text-xs truncate">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Form Body Per Step */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          {/* STEP 1: Profil Komplek */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">Informasi Umum RT/RW &amp; Perumahan</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Masukkan identitas dasar perumahan atau rukun tetangga untuk ditampilkan pada kop tagihan warga.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nama Perumahan / Paguyuban RT/RW <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={complexName}
                    onChange={(e) => setComplexName(e.target.value)}
                    placeholder="Contoh: Palm Village RT 05 / Cluster Bougenville"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Alamat Lengkap / Kelurahan / Kecamatan
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Contoh: Jl. Palm Raya No. 1, Kel. Sukamaju, Kec. Cilodong, Kota Depok"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor Kontak Admin / WhatsApp Pengurus
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Contoh: 0812-3456-7890"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Akan ditampilkan kepada warga sebagai narahubung pertanyaan tagihan atau verifikasi iuran.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Daftar Unit / Rumah */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">Inisiasi Rumah / Kavling (Unit Warga)</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tentukan nomor atau label rumah warga di lingkungan Anda. Anda bisa meng-generate otomatis atau menambah manual.
                </p>
              </div>

              {/* Generator Otomatis Card */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-forest-800 uppercase tracking-wider block">
                  Generator Cepat Unit
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Awalan / Prefix</label>
                    <input
                      type="text"
                      value={blockPrefix}
                      onChange={(e) => setBlockPrefix(e.target.value)}
                      placeholder="Blok A-"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Jumlah Rumah</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={unitCountInput}
                      onChange={(e) => setUnitCountInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleGenerateUnits}
                      className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-colors"
                    >
                      Generate Ulang
                    </button>
                  </div>
                </div>
              </div>

              {/* Tambah Manual */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newUnitLabel}
                  onChange={(e) => setNewUnitLabel(e.target.value)}
                  placeholder="Tambah unit custom (mis: Blok B-05, Kav. 12)..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddUnitManual();
                    }
                  }}
                  className="flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:border-forest-800 focus:outline-none shadow-xs"
                />
                <button
                  type="button"
                  onClick={handleAddUnitManual}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shadow-xs"
                >
                  <AiOutlinePlus />
                  <span>Tambah</span>
                </button>
              </div>

              {/* Chips Daftar Unit */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Daftar Unit Terpilih ({unitList.length} unit):
                  </span>
                  {unitList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUnitList([])}
                      className="text-[11px] text-rose-600 hover:underline"
                    >
                      Hapus Semua
                    </button>
                  )}
                </div>

                {unitList.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 border border-dashed border-slate-300 rounded-2xl text-xs">
                    Belum ada unit yang didaftarkan. Silakan gunakan generator otomatis di atas atau tambah manual.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    {unitList.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 shadow-xs"
                      >
                        <span>{u.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveUnit(u.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Komponen IPL & Rekening */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">Komponen IPL &amp; Rekening Kas</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Atur rincian pos iuran bulanan warga dan rekening penampungan transfer kas RT/RW.
                </p>
              </div>

              {/* Table Pos Iuran */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Rincian Komponen Iuran Bulanan
                </span>

                <div className="space-y-2">
                  {iplComponents.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <span className="text-xs text-slate-900 font-medium">{comp.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold text-forest-900">
                          {formatIDR(comp.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveIplComponent(comp.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        >
                          <AiOutlineDelete className="text-sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form Tambah Pos Baru */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2">
                  <div className="sm:col-span-6">
                    <input
                      type="text"
                      value={newCompName}
                      onChange={(e) => setNewCompName(e.target.value)}
                      placeholder="Nama pos (misal: Perawatan CCTV)..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="number"
                      value={newCompAmount}
                      onChange={(e) => setNewCompAmount(e.target.value)}
                      placeholder="Nominal (Rp)..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddIplComponent}
                      className="w-full py-2 px-3 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold shadow-xs transition-colors"
                    >
                      + Tambah
                    </button>
                  </div>
                </div>

                {/* Total Box */}
                <div className="p-3.5 rounded-2xl bg-forest-50 border border-forest-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Total Tarif IPL Bulanan / Rumah:
                  </span>
                  <span className="text-base sm:text-lg font-black text-forest-900 font-mono">
                    {formatIDR(totalIplAmount)} / bln
                  </span>
                </div>
              </div>

              {/* Tanggal Jatuh Tempo & Rekening Bank */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tanggal Jatuh Tempo Tiap Bulan
                  </label>
                  <select
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        Tanggal {d} tiap bulan
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Bank Rekening Kas RT/RW
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="BCA / Mandiri / BRI"
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    value={bankAccountNo}
                    onChange={(e) => setBankAccountNo(e.target.value)}
                    placeholder="Contoh: 8830123456"
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Atas Nama Rekening
                  </label>
                  <input
                    type="text"
                    value={bankAccountHolder}
                    onChange={(e) => setBankAccountHolder(e.target.value)}
                    placeholder="Contoh: Kas RT 05 Palm Village"
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none shadow-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Konfirmasi */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">Tinjau Konfigurasi Komplek</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Pastikan seluruh data sudah sesuai sebelum mengaktifkan template RT/RW.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Identitas RT/RW
                  </span>
                  <p className="text-sm font-bold text-slate-900">{complexName}</p>
                  <p className="text-xs text-slate-600">{address || '-'}</p>
                  <p className="text-xs text-slate-500">Kontak: {contactPhone || '-'}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Kapasitas &amp; Unit
                  </span>
                  <p className="text-sm font-bold text-emerald-700">{unitList.length} Rumah / Kavling</p>
                  <p className="text-xs text-slate-600">
                    Contoh: {unitList.slice(0, 3).map((u) => u.label).join(', ')}
                    {unitList.length > 3 ? '...' : ''}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Tarif Tagihan IPL
                  </span>
                  <p className="text-base font-bold text-forest-900 font-mono">
                    {formatIDR(totalIplAmount)} / bulan
                  </p>
                  <p className="text-xs text-slate-600">
                    Jatuh tempo setiap tanggal {dueDay}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {iplComponents.map((c) => `${c.name}: ${formatIDR(c.amount)}`).join(' | ')}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Rekening Kas Penerima
                  </span>
                  <p className="text-sm font-bold text-slate-900">
                    {bankName} {bankAccountNo ? `- ${bankAccountNo}` : '(Belum diatur)'}
                  </p>
                  <p className="text-xs text-slate-600">a.n. {bankAccountHolder || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-200">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-colors"
              >
                <AiOutlineArrowLeft /> Kembali
              </button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 1 && !complexName.trim()) {
                    toast.error('Nama perumahan/RT tidak boleh kosong.');
                    return;
                  }
                  if (currentStep === 2 && unitList.length === 0) {
                    toast.error('Minimal harus ada 1 unit rumah.');
                    return;
                  }
                  if (currentStep === 3 && totalIplAmount <= 0) {
                    toast.error('Total IPL harus lebih dari Rp 0.');
                    return;
                  }
                  setCurrentStep((prev) => prev + 1);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shadow-xs"
              >
                <span>Lanjut ke Langkah {currentStep + 1}</span>
                <AiOutlineArrowRight />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveSetup}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
              >
                {saving ? (
                  <span>Menyimpan Konfigurasi...</span>
                ) : (
                  <>
                    <AiOutlineCheck />
                    <span>Selesaikan Setup &amp; Aktifkan Layanan</span>
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
