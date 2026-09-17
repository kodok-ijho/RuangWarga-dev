import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineCheckCircle,
  AiOutlineLoading3Quarters,
  AiOutlineArrowRight,
  AiOutlineSafetyCertificate,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getInviteDetails, requestJoinTenant } from '../../services/tenantOperationalService';

export default function JoinTenant() {
  const { inviteCode: paramInviteCode } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAuthenticated, signInWithGoogle } = useAuth();

  const [inputCode, setInputCode] = useState(paramInviteCode || '');
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [lookupError, setLookupError] = useState('');

  // Form states
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [unitId, setUnitId] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState('owner_occupied');
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Otomatis lookup jika ada kode di URL param
  useEffect(() => {
    if (paramInviteCode) {
      loadTenantByCode(paramInviteCode);
    }
  }, [paramInviteCode]);

  // Sync profile data jika baru login
  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name);
    }
    if (profile?.phone && !phone) {
      setPhone(profile.phone);
    }
  }, [profile, fullName, phone]);

  const loadTenantByCode = async (codeToLookup) => {
    if (!codeToLookup?.trim()) {
      setLookupError('Silakan masukkan kode undangan.');
      return;
    }

    setLoadingTenant(true);
    setLookupError('');
    setTenantInfo(null);

    try {
      const res = await getInviteDetails(codeToLookup.trim());
      if (res && res.found) {
        setTenantInfo(res);
        if (res.units && res.units.length > 0) {
          setUnitId(String(res.units[0].id));
        }
      } else {
        setLookupError(res?.message || 'Komunitas dengan kode undangan tersebut tidak ditemukan.');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[JoinTenant] Lookup error:', err);
      setLookupError('Terjadi kendala saat memeriksa kode undangan.');
    } finally {
      setLoadingTenant(false);
    }
  };

  const handleManualLookup = (e) => {
    e.preventDefault();
    loadTenantByCode(inputCode);
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();

    if (!tenantInfo?.tenant_id) {
      toast.error('Komunitas belum ditentukan.');
      return;
    }

    if (!fullName.trim()) {
      toast.error('Nama lengkap wajib diisi.');
      return;
    }

    if (!isAuthenticated) {
      // Simpan draft form di sessionStorage lalu arahkan ke login
      sessionStorage.setItem(
        'rw_pending_join',
        JSON.stringify({
          inviteCode: inputCode || paramInviteCode,
          tenantId: tenantInfo.tenant_id,
          unitId,
          fullName,
          phone,
          occupancyStatus,
        })
      );
      toast.info('Silakan masuk dengan akun Google untuk menyelesaikan pendaftaran.');
      navigate('/login', {
        state: { from: `/join/${inputCode || paramInviteCode}` },
      });
      return;
    }

    setSubmitting(true);
    try {
      const currentUserId = user?.id || profile?.id;
      await requestJoinTenant({
        tenantId: tenantInfo.tenant_id,
        userId: currentUserId,
        unitId: unitId ? Number(unitId) : null,
        fullName,
        phone,
        occupancyStatus,
      });

      setSubmittedSuccess(true);
      toast.success('Permohonan bergabung berhasil dikirim!');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[JoinTenant] Submit error:', err);
      toast.error(err.message || 'Gagal mengirim permohonan pendaftaran.');
    } finally {
      setSubmitting(false);
    }
  };

  // Layar Berhasil Dikirim
  if (submittedSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xs text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto text-3xl shadow-xs">
            <AiOutlineCheckCircle />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold font-display text-slate-900">
              Pendaftaran Terkirim!
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              Permohonan Anda untuk bergabung di <strong className="text-slate-900 font-bold">{tenantInfo?.tenant_name}</strong>{' '}
              telah diterima.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-1.5 text-slate-600 shadow-xs">
            <p className="font-bold text-slate-900">Status Permohonan: Menunggu Verifikasi</p>
            <p>
              Pengurus / Koordinator akan memeriksa data Anda. Setelah disetujui, Anda dapat masuk dan mengakses seluruh
              informasi iuran, matriks keuangan, dan bukti pembayaran.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full py-3.5 px-4 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs"
          >
            Kembali ke Halaman Utama
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-lg w-full space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-forest-50 border border-forest-200 text-forest-800 text-xs font-bold uppercase tracking-wider">
            <AiOutlineSafetyCertificate className="text-sm" />
            <span>Pendaftaran Anggota &bull; Portal Komunitas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
            Bergabung dengan Komunitas
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Daftarkan diri Anda untuk kemudahan informasi tagihan, iuran, dan kas lingkungan transparan
          </p>
        </div>

        {/* Input Kode Undangan jika belum ditemukan */}
        {!tenantInfo && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
            <form onSubmit={handleManualLookup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Masukkan Kode Undangan (Invite Code)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: RW-PALM-9F2B"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-sm focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={loadingTenant}
                    className="px-5 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
                  >
                    {loadingTenant ? <AiOutlineLoading3Quarters className="animate-spin text-sm" /> : 'Cek'}
                  </button>
                </div>
              </div>

              {lookupError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs shadow-xs">
                  {lookupError}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Form Pendaftaran jika Tenant Ditemukan */}
        {tenantInfo && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            {/* Info Box Tenant */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-forest-800 uppercase tracking-wider">
                  Komunitas Terpilih
                </span>
                <button
                  type="button"
                  onClick={() => setTenantInfo(null)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                >
                  Ganti Kode
                </button>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 font-display">
                {tenantInfo.tenant_name}
              </h2>
              <p className="text-xs text-slate-500">{tenantInfo.address || 'Alamat belum diatur'}</p>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Lengkap Pemohon <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <AiOutlineUser className="absolute left-3.5 top-3 text-slate-400 text-sm" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama sesuai KTP..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nomor WhatsApp / HP Aktif <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <AiOutlinePhone className="absolute left-3.5 top-3 text-slate-400 text-sm" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:border-forest-800 focus:outline-none shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Pilih Nomor Unit / Slot <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                  >
                    {(tenantInfo.units || []).length === 0 ? (
                      <option value="">Tidak ada unit tersedia</option>
                    ) : (
                      tenantInfo.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Status Tinggal
                  </label>
                  <select
                    value={occupancyStatus}
                    onChange={(e) => setOccupancyStatus(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                  >
                    <option value="owner_occupied">Pemilik (Dihuni Sendiri)</option>
                    <option value="tenant">Penyewa / Kontrak</option>
                    <option value="owner_vacant">Pemilik (Unit Kosong)</option>
                  </select>
                </div>
              </div>

              {/* Status Login Warning jika belum auth */}
              {!isAuthenticated && (
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-slate-700 shadow-xs">
                  <strong className="text-blue-900 block mb-1">Akun Google Diperlukan:</strong>
                  Anda akan diminta masuk menggunakan Google setelah menekan tombol di bawah untuk memverifikasi akun Anda.
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <AiOutlineLoading3Quarters className="animate-spin" />
                    <span>Mengirimkan Permohonan...</span>
                  </>
                ) : (
                  <>
                    <span>Ajukan Pendaftaran Anggota</span>
                    <AiOutlineArrowRight />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
