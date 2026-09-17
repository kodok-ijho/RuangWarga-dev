import { useNavigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineHome,
  AiOutlineCreditCard,
  AiOutlineSwap,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { getTenantTemplate } from '../../config/tenantTemplates';

const STATUS_BADGES = {
  active: {
    label: 'Aktif',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  trial: {
    label: 'Trial 15 Hari',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  read_only: {
    label: 'Read-Only (Perlu Perpanjangan)',
    style: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export default function MyTenants() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const {
    userTenants,
    activeTenantId,
    switchTenant,
    loading,
    refreshTenant,
  } = useTenant();

  const handleSelectTenant = (tenantId) => {
    switchTenant(tenantId);
    navigate(`/t/${tenantId}/dashboard`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🏢</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                Layanan Saya (My Tenants)
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Kelola seluruh komunitas, properti kos, kelompok arisan, atau kelas yang Anda miliki atau ikuti.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => refreshTenant()}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 shadow-xs transition-colors"
              title="Perbarui Data"
            >
              Segarkan
            </button>
            <button
              type="button"
              onClick={() => navigate('/account/add-tenant')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs transition-all"
            >
              <AiOutlinePlus className="text-sm font-bold" />
              <span>Tambah Layanan Baru</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-forest-800 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && userTenants.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-3xl mx-auto mb-4">
              🏘️
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-display mb-2">Belum Ada Layanan Terdaftar</h2>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Anda belum memiliki atau tergabung ke dalam layanan komunitas manapun. Buat layanan pertama Anda sekarang
              untuk memulai!
            </p>
            <button
              type="button"
              onClick={() => navigate('/account/add-tenant')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs transition-all"
            >
              <AiOutlinePlus />
              <span>Buat Layanan Pertama (Trial Gratis)</span>
            </button>
          </div>
        )}

        {/* Grid Kartu Tenant */}
        {!loading && userTenants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {userTenants.map((tenant) => {
              const isActive = tenant.id === activeTenantId;
              const template = getTenantTemplate(tenant.type);
              const subStatus = tenant.subscription?.status || 'trial';
              const badgeInfo = STATUS_BADGES[subStatus] || STATUS_BADGES.trial;
              const isOwner = tenant.owner_id === (user?.id || profile?.id);

              return (
                <div
                  key={tenant.id}
                  className={`rounded-2xl p-6 transition-all flex flex-col justify-between ${
                    isActive
                      ? 'bg-white border-2 border-forest-800 ring-4 ring-forest-800/10 shadow-sm'
                      : 'bg-white border border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div>
                    {/* Top Row: Icon, Title, Active Badge */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                          {template.icon}
                        </span>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 font-display leading-tight">{tenant.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500 font-semibold">{template.name}</span>
                            <span className="text-slate-300">&bull;</span>
                            <span className="text-xs text-forest-800 font-medium capitalize">
                              Peran: {tenant.role_name || (tenant.is_owner ? 'Admin' : (tenant.role || (isOwner ? 'Admin' : 'Anggota')))}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-forest-800 text-gold-400 shadow-xs">
                          <AiOutlineCheckCircle /> Sedang Aktif
                        </span>
                      )}
                    </div>

                    {/* Subscription Details */}
                    <div className="py-2.5 px-3 bg-slate-50/80 rounded-xl border border-slate-200 my-4 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-semibold">
                          Status Langganan
                        </span>
                        <span className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${badgeInfo.style}`}>
                          {badgeInfo.label}
                        </span>
                      </div>

                      {tenant.subscription?.trial_ends_at && subStatus === 'trial' && (
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">Berakhir pada:</span>
                          <span className="text-xs font-semibold text-amber-700">
                            {new Date(tenant.subscription.trial_ends_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleSelectTenant(tenant.id)}
                      className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                        isActive
                          ? 'bg-forest-800 hover:bg-forest-900 text-gold-400 shadow-xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs'
                      }`}
                    >
                      <span>{isActive ? 'Buka Dashboard' : 'Pilih & Buka'}</span>
                      <AiOutlineArrowRight />
                    </button>

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          switchTenant(tenant.id);
                          navigate(`/account/subscription`);
                        }}
                        className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-forest-800 border border-slate-200 shadow-xs transition-colors"
                        title="Kelola Langganan & Kapasitas"
                      >
                        <AiOutlineCreditCard className="text-base" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
