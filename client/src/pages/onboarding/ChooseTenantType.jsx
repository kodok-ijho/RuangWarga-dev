import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AiOutlineCheck, AiOutlineArrowRight, AiOutlineSafetyCertificate, AiOutlineArrowLeft } from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { useToast } from '../../hooks/useToast';

export const TENANT_TYPE_OPTIONS = [
  {
    type: 'rt_rw',
    title: 'RT/RW & Perumahan',
    icon: '🏘️',
    badge: 'Paling Populer',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    targetRole: 'Ketua RT/RW & Pengurus Paguyuban',
    labels: {
      unit: 'Rumah / Kavling',
      bill: 'IPL & Kas',
      member: 'Warga / Penghuni',
    },
    description:
      'Solusi lengkap tata kelola iuran perumahan, matriks pembayaran multi-tahun, verifikasi transfer & kas RT/RW transparan.',
    features: [
      'Matriks iuran bulanan & multi-tahun',
      'Verifikasi transfer bank & QRIS',
      'Laporan arus kas & transparansi warga',
      'Manajemen data warga & bukti bayar',
    ],
    placeholderName: 'Contoh: Palm Village RT 05 / Cluster Bougenville',
  },
  {
    type: 'kos',
    title: 'Kos-kosan & Kontrakan',
    icon: '🏢',
    badge: 'Manajemen Sewa',
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    targetRole: 'Pemilik & Pengelola Kos-kosan',
    labels: {
      unit: 'Kamar / Pintu',
      bill: 'Uang Sewa',
      member: 'Penyewa',
    },
    description:
      'Kelola kamar kosong vs terisi, penagihan uang sewa bulanan otomatis berdasarkan kontrak sewa, dan riwayat checkout penyewa.',
    features: [
      'Status kamar (kosong, terisi, booking)',
      'Kontrak sewa berjangka & auto-billing',
      'Riwayat checkout penyewa tanpa hilang data',
      'Pengingat jatuh tempo sewa kamar',
    ],
    placeholderName: 'Contoh: Kos Melati Harmoni / Paviliun 88',
  },
  {
    type: 'arisan',
    title: 'Kelompok Arisan',
    icon: '🎲',
    badge: 'Putaran Adil',
    badgeColor: 'bg-purple-50 text-purple-800 border-purple-200',
    targetRole: 'Admin & Pengurus Arisan',
    labels: {
      unit: 'Slot / Undian',
      bill: 'Kontribusi',
      member: 'Peserta Arisan',
    },
    description:
      'Kelola putaran arisan, pencatatan kontribusi peserta tepat waktu, dan mekanisme pengocokan acak digital yang dijamin adil tanpa duplikat.',
    features: [
      'Siklus putaran & periode arisan',
      'Pengocokan acak digital anti-duplikat',
      'Pemantauan status setoran seluruh anggota',
      'Riwayat penerima arisan per periode',
    ],
    placeholderName: 'Contoh: Arisan Keluarga Besar / Arisan Alumni 2010',
  },
  {
    type: 'kelas',
    title: 'Kelas & Kursus',
    icon: '📚',
    badge: 'Iuran Siswa',
    badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
    targetRole: 'Pengajar & Pengelola Kelas',
    labels: {
      unit: 'Slot Siswa',
      bill: 'SPP / Iuran',
      member: 'Siswa / Peserta',
    },
    description:
      'Pencatatan iuran SPP, bimbel kelompok kecil, kelas sanggar, dan kursus privat dengan monitoring status pembayaran yang ringkas.',
    features: [
      'Pencatatan iuran berkala kelompok kecil',
      'Daftar siswa & monitoring pembayaran',
      'Pengingat iuran bulanan',
      'Laporan keuangan kelas yang sederhana',
    ],
    placeholderName: 'Contoh: Bimbel Bintang Juara / Sanggar Tari Kenanga',
  },
];

export default function ChooseTenantType({ onCancel, initialType = 'rt_rw', redirectOnSuccess = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { createTenant } = useTenant();

  const [selectedType, setSelectedType] = useState(() => location.state?.type || initialType);
  const [tenantName, setTenantName] = useState(() => location.state?.name || '');
  const [submitting, setSubmitting] = useState(false);

  // Auto-submit jika kembali dari login dengan pending tenant data
  useEffect(() => {
    if (location.state?.autoSubmit && location.state?.name && isAuthenticated && !submitting) {
      const runAutoCreate = async () => {
        setSubmitting(true);
        try {
          const tenant = await createTenant({
            name: location.state.name,
            type: location.state.type || selectedType,
          });
          toast.success(`Layanan "${tenant.name}" berhasil dibuat! Trial 15 hari aktif.`);
          if (redirectOnSuccess) {
            const targetType = location.state.type || selectedType;
            if (targetType === 'rt_rw' || targetType === 'kos') {
              navigate(`/t/${tenant.id}/setup`, { replace: true });
            } else {
              navigate(`/t/${tenant.id}/dashboard`, { replace: true });
            }
          }
        } catch (err) {
          toast.error(err.message || 'Gagal membuat layanan otomatis.');
        } finally {
          setSubmitting(false);
        }
      };
      runAutoCreate();
    }
  }, [location.state, isAuthenticated, createTenant, redirectOnSuccess, navigate, selectedType, submitting, toast]);

  const activeOption = TENANT_TYPE_OPTIONS.find((o) => o.type === selectedType) || TENANT_TYPE_OPTIONS[0];

  const handleCreateTenant = async (e) => {
    e.preventDefault();

    if (!tenantName.trim()) {
      toast.error('Nama komunitas / layanan tidak boleh kosong.');
      return;
    }

    // Jika user belum login, simpan preferensi dan arahkan ke login Google
    if (!isAuthenticated) {
      sessionStorage.setItem('rw_pending_tenant_type', selectedType);
      sessionStorage.setItem('rw_pending_tenant_name', tenantName.trim());
      navigate('/login', {
        state: {
          from: '/onboarding/choose-type',
          pendingTenant: { type: selectedType, name: tenantName.trim() },
        },
      });
      return;
    }

    setSubmitting(true);
    try {
      const newTenant = await createTenant({
        name: tenantName.trim(),
        type: selectedType,
      });

      toast.success(`Layanan "${newTenant.name}" berhasil dibuat! Trial 15 hari aktif.`);

      if (redirectOnSuccess) {
        if (selectedType === 'rt_rw' || selectedType === 'kos') {
          navigate(`/t/${newTenant.id}/setup`, { replace: true });
        } else {
          navigate(`/t/${newTenant.id}/dashboard`, { replace: true });
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ChooseTenantType] Error creating tenant:', err);
      toast.error(err.message || 'Terjadi kendala saat membuat layanan baru.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Tombol Kembali (Opsional) */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
          >
            <AiOutlineArrowLeft /> Kembali
          </button>
        )}

        {/* Header Onboarding */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-50 border border-gold-200 text-gold-800 text-xs font-semibold mb-4">
            <AiOutlineSafetyCertificate className="text-sm" />
            <span>Trial Otomatis 15 Hari Gratis &bull; 10 Unit Kapasitas Penuh</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-display">
            Pilih Jenis Layanan RuangWarga
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600">
            Setiap layanan disesuaikan dengan alur bisnis, tata nama, dan matriks keuangan vertikal Anda. Anda dapat
            membuat lebih dari satu layanan untuk kebutuhan berbeda.
          </p>
        </div>

        {/* 4 Kartu Pilihan Vertikal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {TENANT_TYPE_OPTIONS.map((option) => {
            const isSelected = selectedType === option.type;
            return (
              <div
                key={option.type}
                onClick={() => setSelectedType(option.type)}
                className={`relative rounded-2xl p-6 cursor-pointer transition-all duration-200 flex flex-col justify-between border-2 ${
                  isSelected
                    ? 'bg-white border-forest-800 ring-4 ring-forest-800/10 shadow-sm scale-[1.01]'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs shadow-none'
                }`}
              >
                {/* Header Kartu */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                        {option.icon}
                      </span>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 font-display leading-tight">{option.title}</h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{option.targetRole}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${option.badgeColor}`}
                    >
                      {option.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{option.description}</p>

                  {/* Naming Tags */}
                  <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] mb-4">
                    <span className="text-slate-400 font-medium">Unit:</span>
                    <span className="text-slate-800 font-bold">{option.labels.unit}</span>
                    <span className="text-slate-300">&bull;</span>
                    <span className="text-slate-400 font-medium">Iuran:</span>
                    <span className="text-forest-900 font-bold">{option.labels.bill}</span>
                    <span className="text-slate-300">&bull;</span>
                    <span className="text-slate-400 font-medium">Anggota:</span>
                    <span className="text-slate-800 font-bold">{option.labels.member}</span>
                  </div>

                  {/* Fitur Utama */}
                  <ul className="space-y-1.5 mb-4">
                    {option.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                        <AiOutlineCheck className="text-emerald-600 shrink-0 text-sm" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Status Seleksi */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    {isSelected ? 'Layanan Terpilih' : 'Klik untuk Memilih'}
                  </span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                      isSelected ? 'bg-forest-800 border-forest-900 text-gold-400' : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <AiOutlineCheck className="text-xs font-black" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Formulir Konfirmasi & Nama Layanan */}
        <form
          onSubmit={handleCreateTenant}
          className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs"
        >
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
              <span className="text-2xl">{activeOption.icon}</span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 font-display">
                  Daftarkan Layanan: <span className="text-forest-800">{activeOption.title}</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Unit akan dinamai <strong className="text-slate-900">{activeOption.labels.unit}</strong> dan iuran sebagai{' '}
                  <strong className="text-forest-800 font-semibold">{activeOption.labels.bill}</strong>.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="tenantName" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Nama Komunitas / Layanan Anda
              </label>
              <input
                id="tenantName"
                type="text"
                required
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder={activeOption.placeholderName}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-forest-800 focus:ring-1 focus:ring-forest-800 transition-all font-medium shadow-xs"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Nama ini dapat diperbarui kapan saja di menu Pengaturan setelah layanan aktif.
              </p>
            </div>

            {/* Banner Trial Garansi */}
            <div className="flex items-start gap-3 p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs text-emerald-900">
              <span className="text-lg">🎁</span>
              <div>
                <p className="font-semibold text-slate-900">Langsung Aktif: Trial 15 Hari Bebas Biaya</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Termasuk 1 blok kapasitas penuh (10 {activeOption.labels.unit}). Tidak perlu kartu kredit atau pembayaran di awal.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-gold-400 border-t-white animate-spin" />
                  <span>Membuat Layanan...</span>
                </>
              ) : (
                <>
                  <span>Lanjutkan & Aktifkan Layanan</span>
                  <AiOutlineArrowRight className="text-base" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
