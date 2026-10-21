import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineArrowLeft,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineBank,
  AiOutlineInfoCircle,
  AiOutlineShareAlt,
  AiOutlineTeam,
  AiOutlineCalendar,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  fetchTenantDetails,
  fetchTenantInviteCode,
  updateTenantProfileAndSettings,
  saveInviteCodeWithRetry,
  normalizeBankAccount,
  pickBankAccountForForm,
} from '../../services/tenantOperationalService';

export const ORGANIZATION_TYPES = [
  'Sekolah/OSIS',
  'Kampus/BEM',
  'Karang Taruna',
  'Komunitas',
  'Rumah Ibadah',
  'Perusahaan',
  'Lainnya',
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

export default function PanitiaSetupWizard({ tenantId: propTenantId, initialData }) {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { activeTenant, activeTenantId, switchTenant, refreshTenant } = useTenant();

  const tenantId = propTenantId || routeTenantId || activeTenantId;

  const [currentStep, setCurrentStep] = useState(1);
  const [loadingInitial, setLoadingInitial] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [setupFinished, setSetupFinished] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedWaMessage, setCopiedWaMessage] = useState(false);

  // Step 1: Profil Organisasi & Kepanitiaan
  const [tenantName, setTenantName] = useState(initialData?.name || '');
  const [organizationType, setOrganizationType] = useState(
    initialData?.settings?.organization_type || 'Komunitas'
  );
  const [description, setDescription] = useState(
    initialData?.settings?.description || ''
  );
  const [contactPhone, setContactPhone] = useState(initialData?.contact_phone || '');

  // Step 2: Rekening Penerima (Opsional)
  const [bankName, setBankName] = useState('BCA');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  // Sinkronisasi active tenant context
  useEffect(() => {
    if (tenantId && activeTenantId !== tenantId) {
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
          if (data.name) setTenantName(data.name);
          if (data.contact_phone) setContactPhone(data.contact_phone);
          if (data.settings) {
            if (data.settings.organization_type) {
              setOrganizationType(data.settings.organization_type);
            }
            if (data.settings.description) {
              setDescription(data.settings.description);
            }
            const bankData = pickBankAccountForForm(data.settings);
            if (bankData) {
              setBankName(bankData.bank_name || 'BCA');
              setAccountNumber(bankData.account_number || '');
              setAccountHolder(bankData.account_holder || '');
            }
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PanitiaSetupWizard] Gagal memuat detail tenant:', err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [tenantId, initialData]);

  const validateStep = (step) => {
    if (step === 1) {
      if (!tenantName.trim()) {
        toast.error('Nama kepanitiaan / organisasi wajib diisi.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      // Rekening opsional; jika diisi, nomor dan nama pemilik harus valid
      if (accountNumber.trim()) {
        try {
          normalizeBankAccount({
            bank_name: bankName,
            account_number: accountNumber.trim(),
            account_holder: accountHolder.trim(),
          });
        } catch (err) {
          toast.error(err.message || 'Data rekening tidak valid.');
          return false;
        }
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

  // Simpan pengaturan dan finalisasi (TIDAK membuat unit)
  const handleSaveAll = async () => {
    if (!validateStep(2)) return;

    try {
      setSaving(true);

      // 1. Simpan kode undangan: gunakan kode lama bila sudah ada
      let savedInviteCode = await fetchTenantInviteCode(tenantId);
      if (!savedInviteCode) {
        savedInviteCode = await saveInviteCodeWithRetry(tenantId, tenantName);
      }
      setGeneratedInviteCode(savedInviteCode);

      // 2. Normalisasi rekening bank (bila diisi)
      let normalizedBank = null;
      if (accountNumber.trim()) {
        normalizedBank = normalizeBankAccount({
          bank_name: bankName,
          account_number: accountNumber.trim(),
          account_holder: accountHolder.trim(),
        });
      }

      // 3. Simpan profil dan settings
      const settingsPayload = {
        organization_type: organizationType,
        description: description.trim(),
        bank_account: normalizedBank,
        onboarding_completed: true,
        is_setup_completed: true,
      };

      await updateTenantProfileAndSettings(tenantId, {
        name: tenantName.trim(),
        contact_phone: contactPhone.trim(),
        settings: settingsPayload,
      });

      await refreshTenant();
      setSetupFinished(true);
      toast.success('Inisiasi Kepanitiaan berhasil disimpan!');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PanitiaSetupWizard] Gagal menyimpan inisiasi:', err);
      toast.error(err.message || 'Gagal menyimpan pengaturan kepanitiaan.');
    } finally {
      setSaving(false);
    }
  };

  const inviteUrl = `${window.location.origin}/join/${generatedInviteCode}`;

  const waInviteMessage = useMemo(() => {
    return `Halo Rekan Panitia *${tenantName}*,\n\nKami mengundang Anda untuk bergabung ke portal panitia digital kami. Melalui tautan ini, kita dapat memantau anggaran, pemasukan, dan pengeluaran acara secara transparan:\n\n🔗 ${inviteUrl}\n\nKode Undangan: *${generatedInviteCode}*\n\nTerima kasih! 🙏`;
  }, [tenantName, generatedInviteCode, inviteUrl]);

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    toast.success('Tautan undangan disalin ke clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

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
          Menyiapkan formulir inisiasi kepanitiaan...
        </div>
      </div>
    );
  }

  // Tampilan Selesai (Langkah 3)
  if (setupFinished) {
    const waShareUrl = `https://wa.me/?text=${encodeURIComponent(waInviteMessage)}`;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xs text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center mx-auto text-4xl shadow-xs">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <span className="text-xs font-bold text-blue-700 uppercase tracking-widest block mb-1">
              Setup Selesai
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
              {tenantName} Siap Digunakan!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2">
              Kepanitiaan acara Anda telah dikonfigurasi. Anda dapat mengundang rekan panitia dan mulai menyusun rencana anggaran kegiatan.
            </p>
          </div>

          {/* Kartu Ringkasan Panitia */}
          <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500">Jenis Organisasi:</span>
              <span className="font-bold text-slate-900">{organizationType}</span>
            </div>
            {contactPhone && (
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Kontak:</span>
                <span className="font-semibold text-slate-800">{contactPhone}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Rekening:</span>
              <span className="font-semibold text-slate-800">
                {accountNumber ? `${bankName} • ${accountNumber}` : 'Belum diatur (opsional)'}
              </span>
            </div>
          </div>

          {/* Kartu Undangan Anggota Panitia */}
          <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-200 text-left space-y-3">
            <div className="flex items-center gap-2 text-blue-800">
              <AiOutlineTeam className="text-lg" />
              <h3 className="text-xs font-bold uppercase tracking-wide">
                Undang Rekan Panitia
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bagikan tautan pendaftaran ini kepada rekan panitia. Mereka tidak perlu memilih unit/kamar, cukup mendaftar langsung dengan akun Google.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 select-all"
              />
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shrink-0 transition flex items-center gap-1.5"
              >
                {copiedCode ? <AiOutlineCheck className="text-emerald-400" /> : <AiOutlineCopy />}
                <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>

            <div className="pt-1 flex flex-wrap gap-2">
              <a
                href={waShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition"
              >
                <AiOutlineShareAlt />
                <span>Kirim via WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={handleCopyWaMessage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition"
              >
                {copiedWaMessage ? <AiOutlineCheck className="text-emerald-600" /> : <AiOutlineCopy />}
                <span>Salin Draf Pesan WA</span>
              </button>
            </div>
          </div>

          {/* Tombol Aksi Akhir */}
          <div className="space-y-2.5 pt-2">
            <Link
              to={`/t/${tenantId}/programs`}
              className="w-full py-3.5 px-4 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-sm shadow-xs transition flex items-center justify-center gap-2"
            >
              <AiOutlineCalendar className="text-lg" />
              <span>Buat Acara Pertama</span>
            </Link>

            <Link
              to={`/t/${tenantId}/dashboard`}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition inline-block text-center"
            >
              Buka Dashboard Panitia
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tampilan Formulir Wizard (Langkah 1 & 2)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Wizard */}
        <div className="text-center space-y-1">
          <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">
            Inisiasi Kepanitiaan & Acara
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900 tracking-tight">
            {currentStep === 1 && 'Identitas Organisasi & Panitia'}
            {currentStep === 2 && 'Rekening Penerima (Opsional)'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            {currentStep === 1 && 'Atur profil kepanitiaan, jenis organisasi, dan kontak koordinasi.'}
            {currentStep === 2 && 'Rekening untuk penerimaan transfer iuran, sponsor, atau donasi acara.'}
          </p>
        </div>

        {/* Indikator Langkah */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 py-2">
          {[
            { step: 1, label: 'Organisasi' },
            { step: 2, label: 'Rekening' },
            { step: 3, label: 'Selesai' },
          ].map((item) => (
            <div key={item.step} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === item.step
                    ? 'bg-blue-600 text-white shadow-xs ring-4 ring-blue-100'
                    : currentStep > item.step
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {currentStep > item.step ? <AiOutlineCheck /> : item.step}
              </div>
              <span
                className={`text-xs font-semibold hidden sm:inline ${
                  currentStep === item.step ? 'text-blue-700 font-bold' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
              {item.step < 3 && <div className="w-8 sm:w-12 h-0.5 bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Konten Tiap Langkah */}
        <div className="pv-card p-6 sm:p-8 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-6">
          {/* LANGKAH 1: IDENTITAS ORGANISASI */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Kepanitiaan / Komunitas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Misal: Panitia HUT RI ke-81 / Dies Natalis BEM"
                  className="pv-input text-xs sm:text-sm w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Jenis Organisasi <span className="text-rose-500">*</span>
                </label>
                <select
                  value={organizationType}
                  onChange={(e) => setOrganizationType(e.target.value)}
                  className="pv-input text-xs sm:text-sm w-full"
                >
                  {ORGANIZATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Deskripsi Singkat (Opsional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tuliskan tujuan organisasi atau lingkup kepanitiaan..."
                  rows={3}
                  className="pv-input text-xs sm:text-sm w-full resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kontak WhatsApp / Pengurus
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Misal: 081234567890"
                  className="pv-input text-xs sm:text-sm w-full"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Kontak ini memudahkan anggota dan pihak luar menghubungi pengurus kepanitiaan.
                </p>
              </div>
            </div>
          )}

          {/* LANGKAH 2: REKENING PENERIMA (OPSIONAL) */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200 text-xs text-slate-700 flex items-start gap-3">
                <AiOutlineBank className="text-blue-700 text-lg shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-blue-900 mb-0.5">Pengaturan Rekening Panitia (Opsional)</p>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Rekening ini digunakan jika Anda ingin menerima transfer iuran anggota panitia, sponsorship, atau donasi secara langsung. Anda dapat melewati langkah ini bila belum memiliki rekening bersama.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Bank / Penyedia Rekening
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="pv-input text-xs sm:text-sm w-full"
                >
                  {BANK_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nomor Rekening / Akun
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Misal: 1234567890 (kosongkan bila belum ada)"
                  className="pv-input text-xs sm:text-sm w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Pemilik Rekening
                </label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Misal: Budi Santoso (Bendahara)"
                  className="pv-input text-xs sm:text-sm w-full"
                />
              </div>
            </div>
          )}

          {/* Navigasi Tombol Kembali & Lanjut */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="pv-btn-ghost text-xs flex items-center gap-1.5"
              >
                <AiOutlineArrowLeft />
                <span>Kembali</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 2 ? (
              <button
                type="button"
                onClick={handleNext}
                className="pv-btn-primary text-xs flex items-center gap-1.5"
              >
                <span>Lanjut</span>
                <AiOutlineArrowRight />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
              >
                {saving ? (
                  <span>Menyimpan...</span>
                ) : (
                  <>
                    <span>Selesaikan Setup</span>
                    <AiOutlineCheckCircle className="text-base" />
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
