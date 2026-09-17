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
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigasi Back */}
        <div className="flex items-center gap-3">
          <Link
            to={`/t/${tenantId}/dashboard`}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-xs transition-colors"
          >
            <AiOutlineArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <AiOutlineUserSwitch className="text-forest-800 text-xl" />
              <h1 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900">
                Tetapkan Peran Anggota (RBAC v2)
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Penugasan role aktif dan wewenang operasional untuk anggota komunitas
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-500 text-xs">
            <div className="h-7 w-7 rounded-full border-2 border-slate-300 border-t-forest-800 animate-spin mx-auto mb-3" />
            Memuat data anggota dan role...
          </div>
        ) : !member ? (
          <div className="p-8 text-center text-slate-500 bg-white rounded-3xl border border-slate-200 text-xs shadow-xs">
            Anggota tidak ditemukan.
          </div>
        ) : (
          <form onSubmit={handleAssignRole} className="space-y-6">
            {/* Profil Anggota */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-xs">
              <div className="text-xs font-semibold text-slate-500">Target Anggota:</div>
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center font-bold text-base text-forest-800 shadow-xs">
                  {member.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">
                    {member.full_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {member.phone || 'Nomor telepon belum diatur'} &bull;{' '}
                    <span className="text-forest-800 font-semibold">
                      Unit: {member.tenant_units?.label || '-'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Pilihan Role */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-xs">
              <div>
                <h4 className="text-base font-bold text-slate-900 font-display">
                  Pilih Peran yang Ditugaskan
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Satu anggota hanya dapat memiliki satu role aktif per tenant pada satu waktu (FR-38).
                </p>
              </div>

              <div className="space-y-2.5">
                {roles.map((role) => {
                  const isSelected = selectedRoleId === role.id;
                  return (
                    <label
                      key={role.id}
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all shadow-xs ${
                        isSelected
                          ? 'bg-forest-50/70 border-forest-400 ring-2 ring-forest-800/10'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tenant_role"
                        value={role.id}
                        checked={isSelected}
                        onChange={() => setSelectedRoleId(role.id)}
                        className="mt-1 text-forest-800 focus:ring-0 focus:ring-offset-0 bg-white border-slate-300"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{role.name}</span>
                          {role.is_owner_role && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Pemilik (Penuh)
                            </span>
                          )}
                          {role.is_base_role && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-200/70 text-slate-700 border border-slate-300">
                              Dasar
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
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
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Wewenang yang Diberikan ({selectedRoleObj.name}):
                  </div>
                  {(selectedRoleObj.permissions || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Hanya hak akses dasar: melihat &amp; membayar tagihan miliknya sendiri.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {PLATFORM_PERMISSIONS.filter((p) =>
                        (selectedRoleObj.permissions || []).includes(p.key)
                      ).map((p) => (
                        <span
                          key={p.key}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 shadow-xs"
                        >
                          <AiOutlineCheck className="text-emerald-600 text-xs" />
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
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-colors"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={submitting || isReadOnly || !canManage}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 disabled:opacity-50 text-gold-400 text-xs font-bold transition-all shadow-xs"
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
