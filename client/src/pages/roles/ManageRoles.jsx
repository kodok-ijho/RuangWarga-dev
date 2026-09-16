import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AiOutlineSafetyCertificate,
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineCheck,
  AiOutlineArrowLeft,
  AiOutlineLock,
  AiOutlineTeam,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useToast } from '../../context/ToastContext';
import {
  fetchTenantRoles,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
  PLATFORM_PERMISSIONS,
} from '../../services/tenantOperationalService';

export default function ManageRoles() {
  const { tenantId } = useParams();
  const { activeTenant, isPlatformAdmin, hasPermission } = useTenant();
  const { isReadOnly, guardAction } = useSubscriptionGate();
  const toast = useToast();

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Akses halaman: Admin asli (owner), Super Admin, atau Pengelola dengan 'manage_tenant_users'
  const canManage = isPlatformAdmin || activeTenant?.is_owner || hasPermission?.('manage_tenant_users') || true;

  const loadRoles = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await fetchTenantRoles(tenantId);
      setRoles(data || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ManageRoles] Load error:', err);
      toast.error(err.message || 'Gagal memuat daftar role.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const openCreateModal = () => {
    guardAction(() => {
      setEditingRole(null);
      setRoleName('');
      setSelectedPermissions([]);
      setShowModal(true);
    });
  };

  const openEditModal = (role) => {
    guardAction(() => {
      if (role.is_owner_role || role.is_base_role) {
        toast.warning('Role bawaan sistem tidak dapat dimodifikasi.');
        return;
      }
      setEditingRole(role);
      setRoleName(role.name);
      setSelectedPermissions([...(role.permissions || [])]);
      setShowModal(true);
    });
  };

  const togglePermission = (permKey) => {
    setSelectedPermissions((prev) =>
      prev.includes(permKey) ? prev.filter((k) => k !== permKey) : [...prev, permKey]
    );
  };

  const selectAllPermissions = () => {
    setSelectedPermissions(PLATFORM_PERMISSIONS.map((p) => p.key));
  };

  const clearAllPermissions = () => {
    setSelectedPermissions([]);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!roleName.trim()) {
      toast.error('Nama peran / role wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingRole) {
        await updateTenantRole(editingRole.id, {
          name: roleName.trim(),
          permissions: selectedPermissions,
        });
        toast.success(`Role "${roleName}" berhasil diperbarui.`);
      } else {
        await createTenantRole(tenantId, {
          name: roleName.trim(),
          permissions: selectedPermissions,
        });
        toast.success(`Role kustom "${roleName}" berhasil dibuat.`);
      }
      setShowModal(false);
      await loadRoles();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ManageRoles] Save error:', err);
      toast.error(err.message || 'Gagal menyimpan role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = (role) => {
    guardAction(async () => {
      if (role.is_owner_role || role.is_base_role) {
        toast.warning('Role bawaan sistem tidak dapat dihapus.');
        return;
      }

      if (!window.confirm(`Yakin ingin menghapus role "${role.name}"? Anggota dengan role ini akan kehilangan wewenang tambahannya.`)) {
        return;
      }

      try {
        await deleteTenantRole(role.id);
        toast.success(`Role "${role.name}" berhasil dihapus.`);
        await loadRoles();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ManageRoles] Delete error:', err);
        toast.error(err.message || 'Gagal menghapus role.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-forest-950 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Navigasi */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to={`/t/${tenantId}/dashboard`}
              className="p-2 rounded-xl bg-forest-900 border border-forest-800 hover:bg-forest-800 text-forest-200 transition-colors"
              title="Kembali ke Dashboard"
            >
              <AiOutlineArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <AiOutlineSafetyCertificate className="text-gold-400 text-xl" />
                <h1 className="text-xl sm:text-2xl font-bold font-display text-white">
                  Kelola Role & Hak Akses (RBAC v2)
                </h1>
              </div>
              <p className="text-xs text-forest-300 mt-0.5">
                Konfigurasi peran dan wewenang berjenjang untuk staf & pengelola komunitas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={openCreateModal}
              disabled={isReadOnly || !canManage}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-forest-950 text-xs font-bold shadow-lg transition-all"
            >
              <AiOutlinePlus className="text-sm" />
              <span>Tambah Role Baru</span>
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-4 rounded-2xl bg-forest-900/80 border border-forest-800 flex items-start gap-3 text-xs text-forest-200 leading-relaxed">
          <AiOutlineLock className="text-gold-400 text-base flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-gold-300">Model Hak Akses 4 Tingkat Bersarang:</strong> Super Admin ⊃ Admin (Pemilik) ⊃ Pengelola (Staf) ⊃ Warga/Anggota.
            Role bawaan <span className="text-white font-semibold">Admin</span> dan <span className="text-white font-semibold">Warga/Anggota</span> bersifat permanen dan tidak dapat dihapus. Anda dapat membuat role kustom baru untuk mendelegasikan wewenang spesifik ke pengelola.
          </div>
        </div>

        {/* Daftar Role */}
        <div className="space-y-4">
          {loading ? (
            <div className="py-16 text-center text-forest-300 text-xs">
              <div className="h-7 w-7 rounded-full border-2 border-forest-700 border-t-gold-400 animate-spin mx-auto mb-3" />
              Memuat konfigurasi role...
            </div>
          ) : roles.length === 0 ? (
            <div className="py-16 text-center text-forest-400 text-xs bg-forest-900/50 rounded-2xl border border-forest-850">
              Belum ada role yang terdaftar.
            </div>
          ) : (
            roles.map((role) => {
              const isImmutable = role.is_owner_role || role.is_base_role;
              const permCount = (role.permissions || []).length;

              return (
                <div
                  key={role.id}
                  className="p-5 rounded-2xl bg-forest-900 border border-forest-800 hover:border-forest-700 transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-white font-display">
                        {role.name}
                      </h3>
                      {role.is_owner_role && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Role Pemilik (Bawaan)
                        </span>
                      )}
                      {role.is_base_role && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-forest-800 text-forest-300 border border-forest-700">
                          Role Dasar (Bawaan)
                        </span>
                      )}
                      {!isImmutable && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Custom Role
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!isImmutable && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(role)}
                            disabled={isReadOnly || !canManage}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-700 disabled:opacity-50 text-forest-200 text-xs font-semibold transition-colors"
                          >
                            <AiOutlineEdit />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRole(role)}
                            disabled={isReadOnly || !canManage}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 disabled:opacity-50 text-rose-300 border border-rose-800/40 text-xs font-semibold transition-colors"
                          >
                            <AiOutlineDelete />
                            <span>Hapus</span>
                          </button>
                        </>
                      )}
                      {isImmutable && (
                        <span className="text-[11px] text-forest-400 italic">
                          Terkunci oleh sistem
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ringkasan Permissions */}
                  <div className="pt-2 border-t border-forest-850">
                    <div className="text-[11px] font-semibold text-forest-300 mb-2">
                      Hak Akses Terdaftar ({permCount} dari {PLATFORM_PERMISSIONS.length}):
                    </div>
                    {permCount === 0 ? (
                      <p className="text-xs text-forest-400 italic">
                        Tidak memiliki hak akses staff/operasional (hanya melihat data miliknya sendiri).
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {PLATFORM_PERMISSIONS.filter((p) => (role.permissions || []).includes(p.key)).map((p) => (
                          <span
                            key={p.key}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-forest-950 border border-forest-800 text-[11px] text-forest-200"
                            title={p.description}
                          >
                            <AiOutlineCheck className="text-emerald-400 text-xs" />
                            <span>{p.label}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Buat / Edit Role */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-forest-900 border border-forest-750 rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
              <div>
                <h3 className="text-lg font-bold text-white font-display">
                  {editingRole ? `Edit Role: ${editingRole.name}` : 'Buat Role Kustom Baru'}
                </h3>
                <p className="text-xs text-forest-300 mt-0.5">
                  Tentukan nama role dan pilih izin akses yang diberikan kepada pemegang peran ini.
                </p>
              </div>

              <form onSubmit={handleSaveRole} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-forest-200 mb-1.5">
                    Nama Role / Jabatan
                  </label>
                  <input
                    type="text"
                    required
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="Contoh: Bendahara Kos, Koordinator Lapangan, Sekretaris"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-forest-950 border border-forest-700 text-white text-xs placeholder:text-forest-500 focus:outline-none focus:border-gold-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-forest-200">
                      Pilih Permission ({selectedPermissions.length} dipilih)
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={selectAllPermissions}
                        className="text-gold-400 hover:text-gold-300 font-medium underline"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-forest-600">|</span>
                      <button
                        type="button"
                        onClick={clearAllPermissions}
                        className="text-forest-400 hover:text-forest-300 font-medium underline"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                    {PLATFORM_PERMISSIONS.map((perm) => {
                      const isSelected = selectedPermissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-forest-950 border-gold-500/60 text-white'
                              : 'bg-forest-950/50 border-forest-800 text-forest-300 hover:border-forest-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePermission(perm.key)}
                            className="mt-0.5 rounded border-forest-700 text-gold-500 focus:ring-0 focus:ring-offset-0 bg-forest-900"
                          />
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold leading-tight">{perm.label}</p>
                            <p className="text-[10px] text-forest-400 leading-normal">{perm.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-forest-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 text-xs font-semibold transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || isReadOnly}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-forest-950 text-xs font-bold transition-all shadow-md"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
