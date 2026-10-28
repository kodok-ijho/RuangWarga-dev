import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineCheckCircle,
  AiOutlineArrowRight,
  AiOutlineCreditCard,
  AiOutlineReload,
  AiOutlineAppstore,
} from 'react-icons/ai';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { getTenantTemplate } from '../../config/tenantTemplates';
import { Button, Card, Badge, PageHeader, EmptyState } from '../../components/ui';
import PushNotificationCard from '../../components/PushNotificationCard';

const STATUS_BADGES = {
  active: {
    label: 'Aktif',
    variant: 'emerald',
  },
  trial: {
    label: 'Trial 15 Hari',
    variant: 'amber',
  },
  read_only: {
    label: 'Read-Only (Perlu Perpanjangan)',
    variant: 'rose',
  },
};

const KOS_PUSH_PERMISSIONS = [
  'generate_billing',
  'manage_billing_cash',
  'manage_billing_transfer',
];

export default function MyTenants() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const {
    userTenants = [],
    joinRequests = [],
    activeTenantId,
    activeTenant,
    isOwner: isCurrentOwner,
    hasPermission,
    switchTenant,
    loading,
    refreshTenant,
  } = useTenant();

  const currentUserId = user?.id || profile?.id;

  // KOS-5F.2 (Requirement 1): Kartu notifikasi push hanya tampil bila pengguna
  // di salah satu tenant bertipe kos adalah owner atau punya izin penagihan/verifikasi bayar.
  const isEligibleForKosPush = React.useMemo(() => {
    const hasInUserTenants = (userTenants || []).some((t) => {
      if (t?.type !== 'kos') return false;
      const isTenantOwner = Boolean(
        t.is_owner ||
        (t.owner_id && currentUserId && t.owner_id === currentUserId)
      );
      if (isTenantOwner) return true;
      const perms = Array.isArray(t.permissions) ? t.permissions : [];
      return perms.some((p) => KOS_PUSH_PERMISSIONS.includes(p));
    });

    if (hasInUserTenants) return true;

    // Fallback: periksa activeTenant bila context aktif bernilai kos
    if (activeTenant?.type === 'kos') {
      const isOwnerActive = Boolean(
        isCurrentOwner ||
        activeTenant.is_owner ||
        (activeTenant.owner_id && currentUserId && activeTenant.owner_id === currentUserId)
      );
      if (isOwnerActive) return true;
      if (typeof hasPermission === 'function') {
        return KOS_PUSH_PERMISSIONS.some((p) => hasPermission(p));
      }
    }

    return false;
  }, [userTenants, currentUserId, activeTenant, isCurrentOwner, hasPermission]);

  const handleSelectTenant = (tenantId) => {
    switchTenant(tenantId);
    navigate(`/t/${tenantId}/dashboard`);
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Komunitas Saya"
        description="Kelola seluruh komunitas, properti, grup arisan, atau kepanitiaan yang Anda kelola atau ikuti."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={AiOutlineReload}
              onClick={() => refreshTenant()}
              title="Perbarui Data"
            >
              Segarkan
            </Button>
            <Button
              variant="neutral"
              size="sm"
              icon={AiOutlinePlus}
              onClick={() => navigate('/account/add-tenant')}
            >
              Tambah Komunitas
            </Button>
          </div>
        }
      />

      {/* ── Loading State ────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
        </div>
      )}

      {/* ── Kartu Permohonan Bergabung (KOS-1.4b) ───────────────────────── */}
      {!loading && joinRequests && joinRequests.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span>Permohonan Bergabung</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              {joinRequests.length}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {joinRequests.map((req) => {
              const reqTemplate = getTenantTemplate(req.tenant_type);
              const isPending = req.status === 'pending';
              const formattedDate = req.requested_at
                ? new Date(req.requested_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';

              return (
                <div
                  key={req.member_id}
                  className="rw-card p-4 sm:p-5 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl p-2 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
                        {reqTemplate.icon}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-base font-bold text-slate-900 truncate">
                          {req.tenant_name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {req.unit_label
                            ? `${reqTemplate.unitLabel} ${req.unit_label}`
                            : reqTemplate.name}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                        isPending
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {isPending ? 'Menunggu Persetujuan' : 'Ditolak'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Diajukan: {formattedDate}
                    </span>
                    <span
                      className={`font-semibold ${
                        isPending ? 'text-amber-700' : 'text-rose-700'
                      }`}
                    >
                      {isPending
                        ? 'Menunggu persetujuan pengelola'
                        : 'Ditolak, hubungi pengelola'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────────────────── */}
      {!loading && userTenants.length === 0 && (
        <Card className="p-8 text-center max-w-md mx-auto">
          <EmptyState
            title={
              joinRequests && joinRequests.length > 0
                ? 'Pendaftaran Anda sedang diperiksa'
                : 'Belum Ada Komunitas Terdaftar'
            }
            description={
              joinRequests && joinRequests.length > 0
                ? 'Permohonan bergabung Anda ke komunitas telah terkirim dan sedang menunggu verifikasi serta persetujuan dari pengelola.'
                : 'Anda belum memiliki atau tergabung ke dalam komunitas manapun. Buat komunitas pertama Anda sekarang untuk memulai!'
            }
            icon={<div className="text-3xl">{joinRequests && joinRequests.length > 0 ? '⏳' : '🏘️'}</div>}
            action={
              joinRequests && joinRequests.length > 0 ? (
                <Link
                  to="/account/add-tenant"
                  className="text-xs text-slate-600 hover:text-slate-900 underline font-medium inline-block transition"
                >
                  Ingin mengelola komunitas sendiri? Daftarkan tenant
                </Link>
              ) : (
                <Button
                  variant="neutral"
                  icon={AiOutlinePlus}
                  onClick={() => navigate('/account/add-tenant')}
                >
                  Buat Komunitas Pertama (Trial Gratis)
                </Button>
              )
            }
          />
        </Card>
      )}

      {/* ── Grid Kartu Komunitas (Tenant-Neutral SaaS) ────────────────────── */}
      {!loading && userTenants.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {userTenants.map((tenant) => {
            const isActive = tenant.id === activeTenantId;
            const template = getTenantTemplate(tenant.type);
            const subStatus = tenant.subscription?.status || 'trial';
            const badgeInfo = STATUS_BADGES[subStatus] || STATUS_BADGES.trial;
            const isOwner = tenant.owner_id === (user?.id || profile?.id);

            return (
              <div
                key={tenant.id}
                className={`rw-card p-5 sm:p-6 transition-all flex flex-col justify-between ${
                  isActive
                    ? 'ring-2 ring-slate-900 border-slate-900 shadow-rw-card'
                    : 'hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Row: Icon, Title, Active Badge */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl sm:text-3xl p-2 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
                        {template.icon}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug truncate">
                          {tenant.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                          <span className="font-medium">{template.name}</span>
                          <span className="text-slate-300">&bull;</span>
                          <span className="text-slate-700 font-semibold capitalize truncate">
                            {tenant.role_name || (tenant.is_owner ? 'Admin' : (tenant.role || (isOwner ? 'Admin' : 'Anggota')))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-900 text-white shrink-0 shadow-xs">
                        <AiOutlineCheckCircle className="text-xs" />
                        <span>Aktif</span>
                      </span>
                    )}
                  </div>

                  {/* Status Langganan Box */}
                  <div className="py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-200/80 my-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                        Langganan
                      </span>
                      <Badge variant={badgeInfo.variant} className="mt-0.5">
                        {badgeInfo.label}
                      </Badge>
                    </div>

                    {tenant.subscription?.trial_ends_at && subStatus === 'trial' && (
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Trial berakhir:</span>
                        <span className="text-xs font-semibold text-slate-700">
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

                {/* Bottom Actions */}
                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2.5">
                  <Button
                    variant={isActive ? 'neutral' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => handleSelectTenant(tenant.id)}
                    iconRight={AiOutlineArrowRight}
                  >
                    {isActive ? 'Buka Ruang Kerja' : 'Pilih & Masuk'}
                  </Button>

                  {isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        switchTenant(tenant.id);
                        navigate('/account/subscription');
                      }}
                      title="Kelola Langganan & Kapasitas"
                    >
                      <AiOutlineCreditCard className="text-sm" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pengaturan Notifikasi Perangkat Pemilik/Staf Kos (KOS-5F.2) ─── */}
      {!loading && isEligibleForKosPush && (
        <div className="pt-2">
          <PushNotificationCard
            description="Notifikasi pemilik: ringkasan pengingat sewa setiap pagi dan pemberitahuan saat penyewa mengunggah bukti bayar."
          />
        </div>
      )}
    </div>
  );
}
