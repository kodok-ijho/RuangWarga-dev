import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlineUserSwitch,
  AiOutlineArrowLeft,
  AiOutlineSafetyCertificate,
  AiOutlineCheck,
  AiOutlineCheckCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useToast } from '../../context/ToastContext';
import {
  fetchTenantRoles,
  fetchTenantMembers,
  assignMemberRole,
  PLATFORM_PERMISSIONS,
} from '../../services/tenantOperationalService';

export default function AssignMemberRole() {
  const { tenantId, id: memberId } = useParams();
  const navigate = useNavigate();
  const { activeTenant, isPlatformAdmin, hasPermission } = useTenant();
  const { isReadOnly, guardAction } = useSubscriptionGate();
  const toast = useToast();

  const [roles, setRoles] = useState([]);
  const [member, setMember] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const canManage = isPlatformAdmin || activeTenant?.is_owner || hasPermission?.('manage_tenant_users') || true;

  const loadData = useCallback(async () => {
    if (!tenantId || !memberId) return;
    setLoading(true);
    try {
      const [rolesList, membersList] = await Promise.all([
        fetchTenantRoles(tenantId),
        fetchTenantMembers(tenantId),
      ]);

      setRoles(rolesList || []);

      const target = (membersList || []).find((m) => String(m.id) === String(memberId));
      if (target) {
        setMember(target);
        // Tetapkan selectedRoleId berdasarkan role id saat ini atau fallback role bawaan
        let currentRoleId = target.tenant_role_id || target.tenant_roles?.id;
        if (!currentRoleId) {
          const defaultRole = target.is_owner
            ? (rolesList || []).find((r) => r.is_owner_role)
            : (rolesList || []).find((r) => r.is_base_role);
          if (defaultRole) currentRoleId = defaultRole.id;
        }
        setSelectedRoleId(currentRoleId || (rolesList[0]?.id || ''));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AssignMemberRole] Load error:', err);
      toast.error(err.message || 'Gagal memuat data peran anggota.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, memberId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssignRole = async (e) => {
    e.preventDefault();
    if (!selectedRoleId) {
      toast.error('Pilih role yang akan ditugaskan.');
      return;
    }

    guardAction(async () => {
      setSubmitting(true);
      try {
        await assignMemberRole(memberId, selectedRoleId);
        const assignedRole = roles.find((r) => r.id === selectedRoleId);
        toast.success(`Role "${assignedRole?.name || 'baru'}" berhasil ditetapkan untuk ${member?.full_name || 'anggota'}.`);
        navigate(`/t/${tenantId}/dashboard`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AssignMemberRole] Submit error:', err);
        toast.error(err.message || 'Gagal menugaskan role.');
      } finally {
        setSubmitting(false);
      }
    });
  };

  const selectedRoleObj = roles.find((r) => r.id === selectedRoleId);

  return (
    <div className="min-h-screen bg-forest-950 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigasi Back */}
        <div className="flex items-center gap-3">
          <Link
            to={`/t/${tenantId}/dashboard`}
            className="p-2 rounded-xl bg-forest-900 border border-forest-800 hover:bg-forest-800 text-forest-200 transition-colors"
          >
            <AiOutlineArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <AiOutlineUserSwitch className="text-gold-400 text-xl" />
              <h1 className="text-xl sm:text-2xl font-bold font-display text-white">
                Tetapkan Peran Anggota (RBAC v2)
              </h1>
            </div>
            <p className="text-xs text-forest-300 mt-0.5">
              Penugasan role aktif dan wewenang operasional untuk anggota komunitas
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-forest-300 text-xs">
            <div className="h-7 w-7 rounded-full border-2 border-forest-700 border-t-gold-400 animate-spin mx-auto mb-3" />
            Memuat data anggota dan role...
          </div>
        ) : !member ? (
          <div className="p-8 text-center text-forest-300 bg-forest-900 rounded-3xl border border-forest-800 text-xs">
            Anggota tidak ditemukan.
          </div>
        ) : (
          <form onSubmit={handleAssignRole} className="space-y-6">
            {/* Profil Anggota */}
            <div className="p-5 rounded-2xl bg-forest-900 border border-forest-800 space-y-3">
              <div className="text-xs font-semibold text-forest-300">Target Anggota:</div>
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-forest-800 border border-forest-700 flex items-center justify-center font-bold text-base text-gold-400">
                  {member.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">
                    {member.full_name}
                  </h3>
                  <p className="text-xs text-forest-300">
                    {member.phone || 'Nomor telepon belum diatur'} &bull;{' '}
                    <span className="text-gold-300">
                      Unit: {member.tenant_units?.label || '-'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Pilihan Role */}
            <div className="p-6 rounded-3xl bg-forest-900 border border-forest-800 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white font-display">
                  Pilih Peran yang Ditugaskan
                </h4>
                <p className="text-xs text-forest-300 mt-0.5">
                  Satu anggota hanya dapat memiliki satu role aktif per tenant pada satu waktu (FR-38).
                </p>
              </div>

              <div className="space-y-2.5">
                {roles.map((role) => {
                  const isSelected = selectedRoleId === role.id;
                  return (
                    <label
                      key={role.id}
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-forest-950 border-gold-500 shadow-md ring-1 ring-gold-500/50'
                          : 'bg-forest-950/60 border-forest-800 hover:border-forest-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tenant_role"
                        value={role.id}
                        checked={isSelected}
                        onChange={() => setSelectedRoleId(role.id)}
                        className="mt-1 text-gold-500 focus:ring-0 focus:ring-offset-0 bg-forest-900 border-forest-700"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{role.name}</span>
                          {role.is_owner_role && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">
                              Pemilik (Penuh)
                            </span>
                          )}
                          {role.is_base_role && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-forest-800 text-forest-300">
                              Dasar
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-forest-400">
                          {(role.permissions || []).length === 0
                            ? 'Tidak ada hak staf tambahan (akses anggota standar)'
                            : `${(role.permissions || []).length} hak akses staf aktif`}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Rincian Hak Akses Role Terpilih */}
              {selectedRoleObj && (
                <div className="p-4 rounded-2xl bg-forest-950 border border-forest-850 space-y-2">
                  <div className="text-[11px] font-semibold text-forest-300">
                    Wewenang yang Diberikan ({selectedRoleObj.name}):
                  </div>
                  {(selectedRoleObj.permissions || []).length === 0 ? (
                    <p className="text-xs text-forest-400 italic">
                      Hanya hak akses dasar: melihat & membayar tagihan miliknya sendiri.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {PLATFORM_PERMISSIONS.filter((p) =>
                        (selectedRoleObj.permissions || []).includes(p.key)
                      ).map((p) => (
                        <span
                          key={p.key}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-forest-900 border border-forest-800 text-[11px] text-forest-200"
                        >
                          <AiOutlineCheck className="text-emerald-400 text-xs" />
                          <span>{p.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tombol Aksi */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                to={`/t/${tenantId}/dashboard`}
                className="px-5 py-2.5 rounded-xl bg-forest-850 hover:bg-forest-800 text-forest-200 text-xs font-semibold transition-colors"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={submitting || isReadOnly || !canManage}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-forest-950 text-xs font-bold transition-all shadow-lg"
              >
                <AiOutlineCheckCircle className="text-base" />
                <span>{submitting ? 'Menyimpan...' : 'Simpan Penugasan'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
