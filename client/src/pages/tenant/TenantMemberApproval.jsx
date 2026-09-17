import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AiOutlineUser,
  AiOutlineCheck,
  AiOutlineClose,
  AiOutlineLoading3Quarters,
  AiOutlineHome,
  AiOutlinePhone,
  AiOutlineClockCircle,
  AiOutlineArrowLeft,
  AiOutlineCheckCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useToast } from '../../hooks/useToast';
import {
  fetchPendingTenantMembers,
  approveTenantMember,
  rejectTenantMember,
  fetchTenantUnits,
  fetchTenantRoles,
} from '../../services/tenantOperationalService';
import SubscriptionGateButton from '../../components/SubscriptionGateButton';

export default function TenantMemberApproval() {
  const { tenantId } = useParams();
  const toast = useToast();
  const { activeTenant, activeTenantId, switchTenant, isTenantAdmin } = useTenant();
  const { isReadOnly, guardAction } = useSubscriptionGate();

  const [pendingList, setPendingList] = useState([]);
  const [unitsList, setUnitsList] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Modal approve state
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedRole, setSelectedRole] = useState('anggota');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedOccupancy, setSelectedOccupancy] = useState('owner_occupied');

  // Sinkronkan activeTenantId
  useEffect(() => {
    if (tenantId && tenantId !== activeTenantId) {
      switchTenant(tenantId);
    }
  }, [tenantId, activeTenantId, switchTenant]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [members, units, roles] = await Promise.all([
        fetchPendingTenantMembers(tenantId),
        fetchTenantUnits(tenantId),
        fetchTenantRoles(tenantId).catch(() => []),
      ]);
      setPendingList(members || []);
      setUnitsList(units || []);
      setRolesList(roles || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TenantMemberApproval] load error:', err);
      toast.error('Gagal memuat daftar permohonan anggota.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openApproveModal = (member) => {
    guardAction(() => {
      setSelectedMember(member);
      setSelectedRole(member.tenant_roles?.name || 'Warga/Anggota');
      // Default to member's tenant_role_id or base role
      const defaultRole = rolesList.find((r) => r.id === member.tenant_role_id) ||
        rolesList.find((r) => r.is_base_role) ||
        rolesList[0];
      setSelectedRoleId(defaultRole?.id || '');
      setSelectedUnitId(member.unit_id ? String(member.unit_id) : '');
      setSelectedOccupancy(member.occupancy_status || 'owner_occupied');
    });
  };

  const handleConfirmApprove = async () => {
    if (!selectedMember) return;

    setProcessingId(selectedMember.id);
    try {
      await approveTenantMember(selectedMember.id, {
        role: selectedRole,
        tenantRoleId: selectedRoleId || null,
        unitId: selectedUnitId ? Number(selectedUnitId) : null,
        occupancyStatus: selectedOccupancy,
      });

      toast.success(`${selectedMember.full_name} berhasil disetujui bergabung!`);
      setSelectedMember(null);
      await loadData();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TenantMemberApproval] approve error:', err);
      toast.error(err.message || 'Gagal menyetujui permohonan.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = (member) => {
    guardAction(async () => {
      if (!window.confirm(`Yakin ingin menolak pendaftaran "${member.full_name}"?`)) {
        return;
      }

      setProcessingId(member.id);
      try {
        await rejectTenantMember(member.id);
        toast.info(`Pendaftaran ${member.full_name} telah ditolak.`);
        await loadData();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TenantMemberApproval] reject error:', err);
        toast.error(err.message || 'Gagal menolak permohonan.');
      } finally {
        setProcessingId(null);
      }
    });
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Breadcrumb */}
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
                Manajemen Anggota Warga
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                Persetujuan Pendaftaran Warga Baru
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Komunitas: <strong className="text-slate-800 font-semibold">{activeTenant?.name || tenantId}</strong>
              </p>
            </div>
            <div className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs w-fit">
              Menunggu Verifikasi:{' '}
              <strong className="text-forest-800 font-mono font-bold">{pendingList.length}</strong> orang
            </div>
          </div>
        </div>

        {/* List Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <AiOutlineLoading3Quarters className="animate-spin text-base text-forest-800" />
              <span>Memuat daftar permohonan...</span>
            </div>
          ) : pendingList.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto text-2xl shadow-xs">
                <AiOutlineCheckCircle />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Tidak Ada Permohonan Pending</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Semua pendaftaran warga telah diproses. Bagikan tautan undangan komplek untuk mengajak warga lain bergabung.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingList.map((m) => {
                const isProcessing = processingId === m.id;
                const unitLabel = m.tenant_units?.label || (m.unit_id ? `Unit ID ${m.unit_id}` : 'Belum memilih unit');

                return (
                  <div
                    key={m.id}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{m.full_name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-forest-50 border border-forest-200 text-forest-900 font-semibold uppercase">
                          {m.occupancy_status === 'tenant' ? 'Penyewa' : 'Pemilik'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <AiOutlineHome />
                          <span>{unitLabel}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <AiOutlinePhone />
                          <span>{m.phone || '-'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <AiOutlineClockCircle />
                          <span>{formatRelativeTime(m.created_at)}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <SubscriptionGateButton
                        onClick={() => openApproveModal(m)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
                      >
                        <AiOutlineCheck />
                        <span>Setujui</span>
                      </SubscriptionGateButton>

                      <SubscriptionGateButton
                        onClick={() => handleReject(m)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
                      >
                        <AiOutlineClose />
                        <span>Tolak</span>
                      </SubscriptionGateButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Konfirmasi Persetujuan */}
        {selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl space-y-5 animate-in fade-in zoom-in-95">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-display">
                  Konfirmasi Persetujuan Warga
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tetapkan nomor rumah dan peran untuk{' '}
                  <strong className="text-forest-800 font-bold">{selectedMember.full_name}</strong>.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor Rumah / Unit Warga
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                  >
                    <option value="">-- Pilih Unit --</option>
                    {unitsList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Status Tinggal
                  </label>
                  <select
                    value={selectedOccupancy}
                    onChange={(e) => setSelectedOccupancy(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                  >
                    <option value="owner_occupied">Pemilik (Dihuni Sendiri)</option>
                    <option value="tenant">Penyewa / Kontrak</option>
                    <option value="owner_vacant">Pemilik (Rumah Kosong)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Peran / Hak Akses (RBAC)
                  </label>
                  {rolesList.length > 0 ? (
                    <select
                      value={selectedRoleId}
                      onChange={(e) => {
                        const rId = e.target.value;
                        setSelectedRoleId(rId);
                        const found = rolesList.find((r) => r.id === rId);
                        if (found) {
                          setSelectedRole(found.is_owner_role ? 'admin' : found.name.toLowerCase());
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    >
                      {rolesList.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} {r.is_owner_role ? '(Admin / Pemilik)' : r.is_base_role ? '(Standar Anggota)' : '(Kustom)'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-forest-800 shadow-xs"
                    >
                      <option value="anggota">Warga / Anggota Biasa</option>
                      <option value="pengurus">Pengurus Lingkungan</option>
                      <option value="bendahara">Bendahara</option>
                      <option value="admin">Administrator</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApprove}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-colors shadow-xs"
                >
                  <AiOutlineCheck />
                  <span>Setujui Sekarang</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
