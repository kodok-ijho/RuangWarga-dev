import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineHome,
  AiOutlineCheckCircle,
  AiOutlineSwap,
  AiOutlineArrowRight,
  AiOutlineSetting,
  AiOutlineTeam,
  AiOutlineTable,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import TrialCountdownBanner from '../../components/TrialCountdownBanner';

export default function TenantDashboardPlaceholder() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const {
    activeTenant,
    activeTenantId,
    switchTenant,
    subscriptionStatus,
    userRole,
    isTenantAdmin,
  } = useTenant();

  const template = useTenantTemplate();

  // Sinkronkan activeTenantId dengan URL param jika berbeda
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Top Header Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-6 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <span className="text-4xl p-3 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs">
                {template.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-500 font-semibold">{template.name}</span>
                  <span className="text-slate-300">&bull;</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold ${
                      subscriptionStatus === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : subscriptionStatus === 'trial'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {subscriptionStatus === 'trial' ? 'Trial 15 Hari' : subscriptionStatus}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                  {activeTenant?.name || 'Dashboard Operasional'}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tenant ID: <span className="font-mono text-slate-700">{tenantId}</span> &bull; Peran Anda:{' '}
                  <strong className="text-forest-800 capitalize font-bold">{userRole}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isTenantAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate(`/t/${tenantId}/approval`)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors shadow-xs"
                  >
                    <AiOutlineTeam className="text-sm text-forest-800" />
                    <span>Persetujuan Warga</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/t/${tenantId}/setup`)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest-50 hover:bg-forest-100 text-forest-900 text-xs font-semibold border border-forest-200 transition-colors shadow-xs"
                  >
                    <AiOutlineSetting className="text-sm text-forest-800" />
                    <span>Setup Wizard</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate('/account/tenants')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 transition-colors shadow-xs"
              >
                <AiOutlineSwap className="text-sm" />
                <span>Ganti Tenant</span>
              </button>
            </div>
          </div>

          {/* Konteks & Kamus Istilah Vertikal */}
          <div className="pt-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Kamus Istilah Vertikal Terpasang (TenantTemplate)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-500 block font-medium">Satuan Unit</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">{template.unitLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-500 block font-medium">Jenis Iuran / Tagihan</span>
                <span className="text-sm font-bold text-forest-800 mt-0.5 block">{template.billLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-500 block font-medium">Sebutan Anggota</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">{template.memberLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-500 block font-medium">Tindakan Bayar</span>
                <span className="text-sm font-bold text-emerald-700 mt-0.5 block">{template.paymentActionLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trial Countdown Banner (T4.3) */}
        <TrialCountdownBanner tenantId={tenantId} />

        {/* Setup Wizard Warning Banner jika belum selesai (T6.2) */}
        {isTenantAdmin && !activeTenant?.settings?.onboarding_completed && (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <h4 className="text-sm font-bold text-amber-900">Pengaturan Awal Belum Selesai</h4>
                <p className="text-xs text-amber-700 mt-0.5">
                  Lengkapi daftar unit/kamar/slot dan rincian komponen tarif iuran untuk mulai mengelola anggota.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/setup`)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shrink-0 shadow-xs"
            >
              <span>Mulai Setup Wizard</span>
              <AiOutlineArrowRight />
            </button>
          </div>
        )}

        {/* Invite Link Card (T6.3) */}
        {activeTenant?.settings?.invite_code && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🔗</span>
              <div>
                <span className="text-slate-600">Kode Undangan: </span>
                <strong className="font-mono text-forest-900 bg-forest-50 border border-forest-200 px-2 py-0.5 rounded-lg text-sm font-bold tracking-wide">
                  {activeTenant.settings.invite_code}
                </strong>
              </div>
            </div>
            <Link
              to={`/join/${activeTenant.settings.invite_code}`}
              target="_blank"
              className="text-forest-800 hover:text-forest-900 inline-flex items-center gap-1.5 font-bold"
            >
              <span>Buka Formulir Pendaftaran</span>
              <AiOutlineArrowRight />
            </Link>
          </div>
        )}

        {/* Status Phase 2 Milestone Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-xs flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200 text-2xl shadow-xs">
            <AiOutlineCheckCircle />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 font-display">
              Alur Fondasi Tenant Context &amp; Onboarding Berhasil Mengalir!
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              Halaman ini membuktikan bahwa <strong className="text-slate-900 font-semibold">TenantContext</strong>, pemilihan tipe tenant,
              auto-provisioning trial, dan resolusi routing operasional <strong className="text-forest-800 font-semibold">/t/:tenantId/*</strong>{' '}
              telah tersambung mulus dari Phase 1 dan Phase 2. Fitur operasional vertikal penuh (manajemen unit, tagihan,
              pengocokan arisan, matriks multi-tahun) akan dihubungkan secara modular pada Phase 6 s/d 9.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-200">
              {isTenantAdmin && (
                <Link
                  to={`/t/${tenantId}/approval`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors shadow-xs"
                >
                  <AiOutlineTeam />
                  <span>Persetujuan Anggota Baru</span>
                </Link>
              )}
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-200 transition-colors shadow-xs"
              >
                <AiOutlineHome />
                <span>Lihat Fitur Operasional Existing</span>
              </Link>
              <Link
                to="/account/tenants"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-xs font-bold text-gold-400 transition-colors shadow-xs"
              >
                <span>Daftar Layanan Saya</span>
                <AiOutlineArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
