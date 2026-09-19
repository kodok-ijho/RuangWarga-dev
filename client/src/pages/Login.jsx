import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  useAuth,
  IS_DEMO_MODE,
  GOOGLE_AUTH_READY,
  GOOGLE_OAUTH_CLIENT_ID,
} from '../hooks/useAuth';
import { mockUnits } from '../services/mockData';
import { AiOutlineSafetyCertificate, AiOutlineClose, AiOutlineHome } from 'react-icons/ai';
import { FcGoogle } from 'react-icons/fc';
import pkg from '../../package.json';

const GOOGLE_SCRIPT_ID = 'google-identity-services';
const APP_VERSION = `v${pkg.version || '1.0.1'}`;

export default function Login() {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    signInWithSupabaseGoogle,
    loginDemoAdmin,
    enableDemoAdmin,
    isAuthenticated,
    loading,
    accountStatus,
    authError,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const googleButtonRef = useRef(null);
  const [mode, setMode] = useState('login'); // 'login' | 'register_google'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [registrationUnitId, setRegistrationUnitId] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingSuccess, setPendingSuccess] = useState(null);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const [googleRegistration, setGoogleRegistration] = useState(null);
  const [registrationError, setRegistrationError] = useState('');

  const handleGoogleCredential = useCallback(async (credential) => {
    if (!credential) {
      setError('Token Google tidak diterima. Silakan coba lagi.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = await signInWithGoogle(credential);
      if (result?.registrationRequired) {
        setRegistrationUnitId('');
        setRegistrationError('');
        setGoogleRegistration({
          credential,
          currentUser: result.currentUser,
          units: result.units,
        });
        return;
      }
      if (result?.pending) {
        setPendingSuccess({ message: result.message });
        return;
      }
      // Cek apakah ada pending tenant onboarding dari ChooseTenantType
      const pendingType = sessionStorage.getItem('rw_pending_tenant_type');
      const pendingName = sessionStorage.getItem('rw_pending_tenant_name');
      if (pendingType && pendingName) {
        sessionStorage.removeItem('rw_pending_tenant_type');
        sessionStorage.removeItem('rw_pending_tenant_name');
        navigate('/onboarding/choose-type', {
          replace: true,
          state: { autoSubmit: true, type: pendingType, name: pendingName },
        });
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login Google belum berhasil.');
    } finally {
      setSubmitting(false);
    }
  }, [from, navigate, signInWithGoogle]);

  useEffect(() => {
    if (IS_DEMO_MODE || !GOOGLE_AUTH_READY) return;

    let cancelled = false;
    const initializeGoogle = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        callback: (response) => handleGoogleCredential(response?.credential),
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(360, googleButtonRef.current.offsetWidth || 360),
      });
      setGoogleButtonReady(true);
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existingScript) {
      initializeGoogle();
      existingScript.addEventListener('load', initializeGoogle, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', initializeGoogle);
      };
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = () => {
      if (!cancelled) setError('Google login tidak dapat dimuat. Coba refresh halaman.');
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [handleGoogleCredential]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-forest-500">Memuat sesi keamanan JWT...</div>;
  }
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const contextualError = pendingSuccess ? error : (error || authError);
  const statusTitle = {
    pending_approval: 'Akun menunggu persetujuan',
    rejected: 'Pendaftaran ditolak',
    blocked: 'Gmail diblokir',
    suspended: 'Akun tidak aktif',
    invalid_session: 'Sesi berakhir',
    session_check_failed: 'Sesi perlu diverifikasi ulang',
  }[accountStatus] || 'Login belum berhasil';

  // Simulasi login Google untuk demo mode tanpa backend production.
  const handleGoogleLoginDemo = async (emailToUse) => {
    setError('');
    setSubmitting(true);
    try {
      await signIn(emailToUse || 'warga@palmvillage.id', 'demo123');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Gagal mengotentikasi token JWT Google.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!googleEmail.includes('@')) {
      setError('Silakan masukkan email akun Google Anda yang sah (@gmail.com / @palmvillage.id).');
      return;
    }
    setSubmitting(true);
    try {
      if (!registrationUnitId) {
        setError('Silakan pilih unit rumah yang ditempati.');
        return;
      }
      const result = await signUp(googleEmail, 'demo123', fullName, phone, registrationUnitId);
      if (result?.pending) {
        setPendingSuccess({ message: result.message });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Gagal mendaftar dengan akun Google.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeGoogleRegistration = () => {
    if (submitting) return;
    setGoogleRegistration(null);
    setRegistrationUnitId('');
    setRegistrationError('');
  };

  const handleGoogleUnitSubmit = async (event) => {
    event.preventDefault();
    if (!googleRegistration?.credential || submitting) return;
    if (!registrationUnitId) {
      setRegistrationError('Silakan pilih unit rumah yang ditempati.');
      return;
    }

    setRegistrationError('');
    setSubmitting(true);
    try {
      const result = await signInWithGoogle(googleRegistration.credential, {
        unitId: registrationUnitId,
      });
      if (result?.registrationRequired) {
        setGoogleRegistration((current) => ({
          ...current,
          currentUser: result.currentUser || current?.currentUser,
          units: result.units,
        }));
        setRegistrationError('Unit belum dapat diproses. Silakan pilih kembali.');
        return;
      }
      if (result?.pending) {
        const selectedUnit = googleRegistration.units.find(
          (unit) => String(unit.id) === String(registrationUnitId)
        );
        setPendingSuccess({
          message: result.message,
          unitLabel: selectedUnit
            ? `Blok ${selectedUnit.block}/${selectedUnit.unit_number}`
            : 'Unit terpilih',
        });
        setGoogleRegistration(null);
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setRegistrationError(err.message || 'Pendaftaran belum berhasil. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 selection:bg-gold-500 selection:text-forest-950 font-sans">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-block group">
            <img
              src="/logo.png"
              alt="Logo RuangWarga"
              className="h-16 w-auto rounded-2xl object-cover mx-auto ring-2 ring-forest-800/10 shadow-md mb-3 group-hover:scale-105 transition"
            />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-forest-950 font-display tracking-tight flex items-center justify-center gap-2">
            <span>RuangWarga</span>
            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-mono font-bold border border-slate-200">
              {APP_VERSION}
            </span>
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-wider mt-1 font-medium">
            Platform Komunitas &amp; Properti (RT/RW • Kos • Arisan • Kelas)
          </p>
        </div>

        {/* Tampilan Menunggu Persetujuan setelah registrasi sukses */}
        {pendingSuccess && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center mb-6 shadow-xl text-slate-900">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <AiOutlineSafetyCertificate className="text-3xl" />
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 font-display mb-2">Pendaftaran Google Berhasil!</h2>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">{pendingSuccess.message}</p>
            <div className="bg-slate-50 p-3.5 rounded-2xl text-xs text-slate-600 text-left space-y-1.5 mb-5 border border-slate-200">
              <p><strong>Status:</strong> Menunggu persetujuan Pengurus/Bendahara</p>
              <p><strong>Auth Provider:</strong> Google OAuth 2.0 + App JWT</p>
              <p>
                <strong>Unit diajukan:</strong>{' '}
                {pendingSuccess.unitLabel || (mockUnits.find((unit) => String(unit.id) === String(registrationUnitId))
                  ? `Blok ${mockUnits.find((unit) => String(unit.id) === String(registrationUnitId)).block}/${mockUnits.find((unit) => String(unit.id) === String(registrationUnitId)).unit_number}`
                  : 'Belum dipilih')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setPendingSuccess(null); setMode('login'); setError(''); }}
              className="pv-btn-primary w-full py-2.5 text-sm"
            >
              Kembali ke Layar Masuk
            </button>
          </div>
        )}

        <div className="pv-card p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-200/90 bg-white text-slate-900">
          {/* Tab Mode */}
          {IS_DEMO_MODE && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl mb-6 border border-slate-200/90">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                  mode === 'login'
                    ? 'bg-forest-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Masuk Demo
              </button>
              <button
                type="button"
                onClick={() => { setMode('register_google'); setError(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                  mode === 'register_google'
                    ? 'bg-forest-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daftar Demo
              </button>
            </div>
          )}

          {!IS_DEMO_MODE || mode === 'login' ? (
            <div className="space-y-5">
              {/* Tombol Masuk dengan Akun Google */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    setSubmitting(true);
                    try {
                      await signInWithSupabaseGoogle({ redirectTo: window.location.origin });
                    } catch (err) {
                      setError(err.message || 'Gagal memulai login Google.');
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl shadow-xs transition-all border border-slate-200 active:scale-[0.98]"
                >
                  <FcGoogle className="w-5 h-5 shrink-0" />
                  <span className="text-sm">Masuk dengan Akun Google</span>
                </button>

                {GOOGLE_AUTH_READY && (
                  <div className="rounded-xl bg-white p-2 border border-slate-200 shadow-xs">
                    <div ref={googleButtonRef} className="min-h-[44px] w-full flex items-center justify-center" />
                    {!googleButtonReady && (
                      <button
                        type="button"
                        disabled
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 text-sm font-semibold text-slate-500"
                      >
                        <FcGoogle className="text-xl" />
                        Memuat Google...
                      </button>
                    )}
                  </div>
                )}

                {IS_DEMO_MODE && (
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleGoogleLoginDemo('dyudhiantoro@gmail.com')}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-gradient-to-r from-gold-500 to-amber-400 hover:from-gold-400 hover:to-amber-300 text-forest-950 font-bold rounded-xl shadow-xs transition-all text-xs border border-gold-400 active:scale-[0.98]"
                    >
                      <span>👑</span>
                      <span>Masuk sebagai Superadmin (dyudhiantoro@gmail.com)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Info Keamanan Akses Portal */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2 text-forest-800 font-bold">
                  <AiOutlineSafetyCertificate className="text-base shrink-0" />
                  <span>Keamanan Akses RuangWarga</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Akses masuk diamankan menggunakan otentikasi Google OAuth terverifikasi dengan enkripsi data dan isolasi tenant (RLS).
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleGoogleRegisterSubmit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 mb-2">
                <p>Pendaftaran demo warga baru akan masuk status menunggu persetujuan.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Email Akun Google (@gmail.com)
                </label>
                <input
                  type="email"
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  required
                  placeholder="nama.anda@gmail.com"
                  className="pv-input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Nama Lengkap Sesuai KTP
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Nama Lengkap Anda"
                  className="pv-input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Nomor HP / WhatsApp Aktif
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="08xx-xxxx-xxxx"
                  className="pv-input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Unit Rumah yang Ditempati
                </label>
                <select
                  value={registrationUnitId}
                  onChange={(e) => setRegistrationUnitId(e.target.value)}
                  required
                  className="pv-input"
                >
                  <option value="">Pilih unit rumah</option>
                  {mockUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      Blok {unit.block}/{unit.unit_number}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Admin akan memeriksa dan mengonfirmasi unit ini saat verifikasi.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="pv-btn-primary w-full py-3 text-sm mt-2 flex items-center justify-center gap-2"
              >
                {submitting ? 'Memverifikasi Google OAuth...' : 'Daftar dengan Google Account'}
              </button>
            </form>
          )}

          {contextualError && (
            <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 text-center animate-fadeIn">
              <strong className="block text-rose-900 mb-1">{statusTitle}</strong>
              {contextualError}
            </div>
          )}


        </div>

        {/* Banner Registrasi Tenant Baru (Multi-tenant Onboarding T2.3) */}
        <div className="mt-5 p-5 rounded-3xl bg-white border border-slate-200/90 shadow-card text-center">
          <p className="text-xs font-bold text-slate-800">
            Ingin mengelola perumahan, kos, arisan, atau kelas Anda sendiri?
          </p>
          <button
            type="button"
            onClick={() => navigate('/onboarding/choose-type')}
            className="mt-2.5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 text-xs font-bold transition-all shadow-xs"
          >
            <span>Buka Layanan Baru (Trial 15 Hari Gratis)</span>
            <span>&rarr;</span>
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-[11px] text-slate-400 font-mono">
            RuangWarga {APP_VERSION} &bull; &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>

      {googleRegistration && (
        <div className="pv-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="registration-unit-title">
          <div className="pv-dialog-panel relative max-w-md">
            <button
              type="button"
              onClick={closeGoogleRegistration}
              disabled={submitting}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-forest-500 transition-colors hover:bg-forest-100 hover:text-forest-900 disabled:opacity-50"
              aria-label="Tutup pemilihan unit"
              title="Tutup"
            >
              <AiOutlineClose aria-hidden="true" />
            </button>

            <div className="pr-10">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-700 border border-gold-200">
                <AiOutlineHome className="text-xl" aria-hidden="true" />
              </div>
              <h2 id="registration-unit-title" className="text-lg font-extrabold text-forest-950 font-display">
                Pilih Unit Rumah
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Akun Google ini belum terdaftar. Pilih unit yang akan diajukan untuk diverifikasi admin.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              {googleRegistration.currentUser?.avatar_url ? (
                <img
                  src={googleRegistration.currentUser.avatar_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-forest-800/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-800 text-sm font-bold text-white">
                  {(googleRegistration.currentUser?.full_name || 'W').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {googleRegistration.currentUser?.full_name || 'Warga baru'}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {googleRegistration.currentUser?.email || '-'}
                </p>
              </div>
            </div>

            <form onSubmit={handleGoogleUnitSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="google-registration-unit" className="mb-1 block text-sm font-medium text-forest-700">
                  Unit Rumah yang Ditempati
                </label>
                <select
                  id="google-registration-unit"
                  value={registrationUnitId}
                  onChange={(event) => {
                    setRegistrationUnitId(event.target.value);
                    setRegistrationError('');
                  }}
                  className="pv-input"
                  required
                  autoFocus
                >
                  <option value="">Pilih unit rumah</option>
                  {googleRegistration.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      Blok {unit.block}/{unit.unit_number}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-forest-500">
                  Admin akan memeriksa kecocokan identitas dan unit sebelum akun diaktifkan.
                </p>
              </div>

              {googleRegistration.units.length === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Daftar unit belum tersedia. Tutup dialog lalu coba kembali beberapa saat lagi.
                </p>
              )}
              {registrationError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {registrationError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={closeGoogleRegistration}
                  disabled={submitting}
                  className="pv-btn-ghost min-h-10 text-sm disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || googleRegistration.units.length === 0}
                  className="pv-btn-primary min-h-10 text-sm disabled:opacity-50"
                >
                  {submitting ? 'Mengirim...' : 'Ajukan Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
