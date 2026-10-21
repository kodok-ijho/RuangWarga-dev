import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineUpload,
  AiOutlineDownload,
  AiOutlineUserAdd,
} from 'react-icons/ai';
import Papa from 'papaparse';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { useTenantAccess } from '../hooks/useTenantAccess';
import { useTenantTemplate } from '../hooks/useTenantTemplate';
import { useToast } from '../hooks/useToast';
import { useTour } from '../context/TourContext';
import Modal from '../components/Modal';
import {
  fetchResidents,
  createResident,
  updateResident,
  deleteResident,
  importResidentsCSV,
  fetchUnits,
} from '../services/dataService';
import {
  fetchTenantMembers,
  fetchTenantUnits,
  updateTenantMember,
  removeTenantMember,
  fetchTenantInviteCode,
  getCachedTenantInviteCode,
} from '../services/tenantOperationalService';
import {
  canModifyData,
  roleLabel,
  roleColor,
  occupancyStatusLabel,
  occupancyStatusColor,
  OCCUPANCY_STATUS,
  getOccupancyOptions,
  getMemberStatusBadge,
} from '../services/dataHelpers';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SearchInput,
  Pagination,
  EmptyState,
  SkeletonTable,
  SkeletonList,
  MobileList,
} from '../components/ui';
import { ResidentCard } from '../components/residents/ResidentCard';
import { ResidentDetailDrawer } from '../components/residents/ResidentDetailDrawer';

export default function Residents() {
  const params = useParams();
  const { role, token } = useAuth();
  const {
    activeTenant: contextActiveTenant,
    userTenants,
    activeTenantId: contextTenantId,
    isOwner: contextIsOwner,
    hasPermission,
  } = useTenant();
  const tenantAccess = useTenantAccess();
  const activeTenantId = params.tenantId || contextTenantId || contextActiveTenant?.id || userTenants?.[0]?.id || null;
  const activeTenant = contextActiveTenant?.id === activeTenantId
    ? contextActiveTenant
    : (userTenants || []).find((t) => t.id === activeTenantId) || null;
  const template = useTenantTemplate(activeTenant?.type);

  const isOwner = Boolean(contextIsOwner || activeTenant?.is_owner);
  const canManageRoles = Boolean(
    activeTenantId && (isOwner || (hasPermission && hasPermission('manage_tenant_users')))
  );

  const getMemberRoleLabel = (p) => {
    if (p?.is_owner) return 'Admin';
    if (p?.tenant_roles?.name) return p.tenant_roles.name;
    if (Array.isArray(p?.tenant_roles) && p.tenant_roles[0]?.name) return p.tenant_roles[0].name;
    if (p?.role_name) return p.role_name;
    if (p?.role) return roleLabel(p.role, activeTenant?.type);
    return 'Anggota';
  };

  const toast = useToast();
  const { triggerTour } = useTour();
  const canManage = activeTenantId
    ? Boolean(tenantAccess.canManageMembers && tenantAccess.canWrite)
    : canModifyData(role);

  // Data states
  const [profiles, setProfiles] = useState([]);
  const [units, setUnits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const pendingMembersCount = useMemo(() => {
    return profiles.filter((p) => p.status === 'pending').length;
  }, [profiles]);

  const fetchSeqRef = useRef(0);
  const activeTenantRef = useRef(activeTenantId);
  activeTenantRef.current = activeTenantId;

  // State filter, search, sort & pagination
  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOccupancy, setFilterOccupancy] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState(null);

  // State untuk CRUD, upload & invite
  const [modalAddEdit, setModalAddEdit] = useState(null); // null | 'add' | profile obj
  const [modalUpload, setModalUpload] = useState(false);
  const [modalInvite, setModalInvite] = useState(false);

  // Reset all transient state on tenant switch
  useEffect(() => {
    setSelectedId(null);
    setSearch('');
    setFilterBlock('');
    setFilterStatus('');
    setFilterOccupancy('');
    setSortKey('name');
    setSortDirection('asc');
    setCurrentPage(1);
    setModalAddEdit(null);
    setModalUpload(false);
    setModalInvite(false);
    setProfiles([]);
    setUnits([]);
    setLoadError(null);
  }, [activeTenantId]);

  const loadData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const targetTenantId = activeTenantId;
    setIsLoading(true);
    setLoadError(null);
    try {
      if (targetTenantId) {
        const [members, tenantUnits] = await Promise.all([
          fetchTenantMembers(targetTenantId),
          fetchTenantUnits(targetTenantId),
        ]);
        if (seq !== fetchSeqRef.current || activeTenantRef.current !== targetTenantId) {
          return;
        }
        setProfiles(members || []);
        setUnits(
          (tenantUnits || []).map((u) => ({
            ...u,
            block: u.metadata?.block || u.label || '',
            unit_number: u.metadata?.unit_number || '',
          }))
        );
      } else {
        const [res, uList] = await Promise.all([
          fetchResidents(token),
          fetchUnits(token),
        ]);
        if (seq !== fetchSeqRef.current || activeTenantRef.current !== targetTenantId) {
          return;
        }
        setProfiles(res || []);
        setUnits(uList || []);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current || activeTenantRef.current !== targetTenantId) {
        return;
      }
      const msg = err.message || `Gagal memuat data ${template.memberLabel.toLowerCase()}.`;
      setLoadError(msg);
      toast.error(msg);
      console.error('loadData Residents error:', err);
    } finally {
      if (seq === fetchSeqRef.current && activeTenantRef.current === targetTenantId) {
        setIsLoading(false);
      }
    }
  }, [token, toast, activeTenantId, template.memberLabel]);

  useEffect(() => {
    loadData();
    triggerTour('residents');
  }, [loadData, triggerTour]);

  const getUnitById = useCallback((id) => {
    if (!id) return null;
    return units.find((u) => u.id === Number(id) || String(u.id) === String(id));
  }, [units]);

  const getUnitOwner = useCallback((unitId) => {
    if (!unitId) return null;
    const unit = units.find((u) => u.id === Number(unitId) || String(u.id) === String(unitId));
    if (!unit) return null;
    if (unit.owner_id) {
      const p = profiles.find((p) => p.id === unit.owner_id || String(p.id) === String(unit.owner_id));
      if (p) return p;
    }
    return profiles.find(
      (p) => (p.unit_id === Number(unitId) || String(p.unit_id) === String(unitId)) && p.occupancy_status && p.occupancy_status.startsWith('owner_')
    ) || null;
  }, [units, profiles]);

  const blocks = useMemo(() => [...new Set(units.map((u) => u.block || u.metadata?.block).filter(Boolean))].sort(), [units]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterBlock('');
    setFilterStatus('');
    setFilterOccupancy('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    Boolean(search),
    Boolean(filterBlock),
    Boolean(filterStatus),
    Boolean(filterOccupancy),
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const list = profiles.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const unit = getUnitById(p.unit_id);
        const unitLabel = unit ? (unit.label || `${unit.block || ''}${unit.unit_number || ''}`) : '';
        if (
          !p.full_name?.toLowerCase().includes(q) &&
          !(p.email || '').toLowerCase().includes(q) &&
          !(p.phone || '').includes(q) &&
          !unitLabel.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterBlock) {
        const unit = getUnitById(p.unit_id);
        const uBlock = unit?.block || unit?.metadata?.block || '';
        if (uBlock !== filterBlock) return false;
      }
      if (filterStatus) {
        if (activeTenantId) {
          const s = p.status || (p.is_active !== false ? 'approved' : 'inactive');
          if (filterStatus === 'active' && s !== 'approved') return false;
          if (filterStatus === 'pending' && s !== 'pending') return false;
          if (filterStatus === 'inactive' && s !== 'rejected' && s !== 'inactive') return false;
        } else {
          if (filterStatus === 'active' && !p.is_active) return false;
          if (filterStatus === 'inactive' && p.is_active) return false;
        }
      }
      if (filterOccupancy && p.occupancy_status !== filterOccupancy) return false;
      return true;
    });

    list.sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortKey === 'name') {
        valA = (a.full_name || '').toLowerCase();
        valB = (b.full_name || '').toLowerCase();
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortKey === 'unit') {
        const uA = getUnitById(a.unit_id);
        const uB = getUnitById(b.unit_id);
        valA = uA ? (uA.label || `${uA.block || ''}${uA.unit_number || ''}`) : '';
        valB = uB ? (uB.label || `${uB.block || ''}${uB.unit_number || ''}`) : '';
        return sortDirection === 'asc'
          ? valA.localeCompare(valB, undefined, { numeric: true })
          : valB.localeCompare(valA, undefined, { numeric: true });
      }
      if (sortKey === 'status') {
        if (activeTenantId) {
          const statusWeight = { approved: 2, pending: 1, rejected: 0, inactive: 0 };
          valA = statusWeight[a.status] ?? (a.is_active ? 2 : 0);
          valB = statusWeight[b.status] ?? (b.is_active ? 2 : 0);
        } else {
          valA = a.is_active ? 1 : 0;
          valB = b.is_active ? 1 : 0;
        }
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortKey === 'role') {
        valA = (a.role || '').toLowerCase();
        valB = (b.role || '').toLowerCase();
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortKey === 'created_at') {
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });

    return list;
  }, [profiles, search, filterBlock, filterStatus, filterOccupancy, sortKey, sortDirection, getUnitById]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, safeCurrentPage, pageSize]);

  const selected = selectedId ? profiles.find((p) => p.id === selectedId || String(p.id) === String(selectedId)) : null;

  // ── Handlers ──────────────────────────────────────────
  const handleSaveProfile = async (data) => {
    if (!canManage) {
      toast.error(
        activeTenantId
          ? 'Anda tidak memiliki hak untuk mengelola anggota.'
          : 'Hanya Pengurus, Bendahara, atau Admin yang dapat menambah/mengubah data warga.'
      );
      return;
    }
    setIsSaving(true);
    try {
      if (activeTenantId) {
        // Mode Tenant
        await updateTenantMember(activeTenantId, data.id, {
          full_name: data.full_name,
          phone: data.phone,
          unit_id: data.unit_id ? Number(data.unit_id) : null,
          occupancy_status: data.occupancy_status || null,
        });
        toast.success(`Data ${template.memberLabel.toLowerCase()} "${data.full_name}" berhasil diperbarui.`);
        await loadData();
        setModalAddEdit(null);
      } else {
        // Mode Legacy Portal Warga
        if (modalAddEdit === 'add') {
          const payload = {
            ...data,
            unit_id: data.unit_id ? Number(data.unit_id) : null,
            is_active: data.is_active ?? true,
          };
          await createResident(token, payload);
          toast.success(`Warga "${data.full_name}" berhasil ditambahkan.`);
        } else {
          // edit
          const payload = {
            ...data,
            unit_id: data.unit_id ? Number(data.unit_id) : null,
          };
          await updateResident(token, data.id, payload);
          toast.success(`Data warga "${data.full_name}" berhasil diperbarui.`);
        }
        await loadData();
        setModalAddEdit(null);
      }
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan data warga.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper: cari unit berdasarkan blok+nomor (dipakai export/import CSV)
  const findUnit = (block, unitNumber) =>
    units.find(
      (u) => u.block === String(block).toUpperCase() && u.unit_number === String(unitNumber)
    );

  const handleDelete = async (profile) => {
    if (!canManage) {
      toast.error(
        activeTenantId
          ? 'Anda tidak memiliki hak untuk mengelola anggota.'
          : 'Hanya Pengurus, Bendahara, atau Admin yang dapat menghapus data warga.'
      );
      return;
    }

    if (activeTenantId) {
      // Mode Tenant
      if (profile.is_owner) {
        toast.error('Pemilik komunitas tidak dapat dikeluarkan.');
        return;
      }
      const confirmMsg = `Keluarkan "${profile.full_name}" dari komunitas? Riwayat pembayarannya tetap tersimpan.`;
      if (!window.confirm(confirmMsg)) return;

      setIsSaving(true);
      try {
        await removeTenantMember(activeTenantId, profile.id);
        toast.success(`${template.memberLabel} "${profile.full_name}" berhasil dikeluarkan.`);
        setSelectedId(null);
        await loadData();
      } catch (err) {
        toast.error(err.message || 'Gagal mengeluarkan anggota.');
        console.error(err);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Mode Legacy Portal Warga
    if (!confirm(`Hapus warga "${profile.full_name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setIsSaving(true);
    try {
      await deleteResident(token, profile.id);
      toast.success(`Warga "${profile.full_name}" berhasil dihapus.`);
      setSelectedId(null);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus data warga.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const header = ['Nama', 'Email', 'Telepon', 'Blok', 'Unit', 'Status', 'Status Tinggal', 'Pemilik', 'Role'];
    const rows = filteredAndSorted.map((p) => {
      const unit = getUnitById(p.unit_id);
      // Pemilik unit: kalau profil ini BUKAN owner, tampilkan nama pemilik
      const owner =
        p.occupancy_status === 'tenant' ? getUnitOwner(p.unit_id) : null;
      return [
        p.full_name,
        p.email || '',
        p.phone || '',
        unit?.block || '',
        unit?.unit_number || '',
        p.is_active ? 'Aktif' : 'Tidak Aktif',
        occupancyStatusLabel(p.occupancy_status),
        owner?.full_name || '',
        roleLabel(p.role),
      ];
    });
    const csv = Papa.unparse([header, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daftar_penghuni_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV berhasil di-export.');
  };

  const handleImportCSV = async (parsedRows, mode) => {
    if (activeTenantId) {
      toast.error('Impor data warga tidak tersedia di halaman ini. Silakan gunakan halaman Unit.');
      return;
    }

    // Reverse map label → key untuk occupancy_status
    const labelToStatusKey = Object.fromEntries(
      Object.entries(OCCUPANCY_STATUS).map(([k, v]) => [v.toLowerCase(), k])
    );
    const resolveStatus = (raw) => {
      if (!raw) return null;
      const v = String(raw).toLowerCase().trim();
      // Cocokkan exact label dulu, lalu partial keyword
      if (labelToStatusKey[v]) return labelToStatusKey[v];
      if (v.includes('kontrak') && !v.includes('dikontrakkan')) return 'tenant';
      if (v.includes('dikontrakkan')) return 'owner_rented';
      if (v.includes('dihuni')) return 'owner_occupied';
      if (v.includes('tidak dihuni') || v.includes('kosong')) return 'owner_vacant';
      return null;
    };

    // Validasi & mapping
    const mapped = parsedRows
      .filter((r) => r.Nama || r.full_name || r[0])
      .map((r) => {
        // Support header dalam berbagai format
        const name = r.Nama || r.full_name || r.nama || Object.values(r)[0];
        let email = (r.Email || r.email || '').toString().trim().toLowerCase();
        const phone = r.Telepon || r.phone || r.telepon || '';
        const block = (r.Blok || r.block || '').toString().toUpperCase();
        const unitNumber = (r.Unit || r.unit_number || '').toString();
        const roleVal = (r.Role || r.role || 'warga').toString().toLowerCase();
        const isActiveRaw = (r.Status || r.status || 'Aktif').toString().toLowerCase();
        const occupancyRaw = r['Status Tinggal'] || r.occupancy_status || '';

        // Cari unit_id
        const unit = block && unitNumber ? findUnit(block, unitNumber) : null;
        const unit_id = unit?.id || null;

        if (!email) {
          const cleanUnit = unit ? `unit_${unit.block.toLowerCase()}_${unit.unit_number.toLowerCase()}` : `unassigned_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          email = `${cleanUnit}@warga.palmvillage.local`;
        }

        return {
          full_name: name,
          email: email,
          phone: phone,
          unit_id,
          role: ['admin', 'bendahara', 'pengurus', 'warga'].includes(roleVal) ? roleVal : 'warga',
          is_active: isActiveRaw.includes('aktif') || isActiveRaw === 'true',
          occupancy_status: resolveStatus(occupancyRaw),
        };
      })
      .filter((p) => p.full_name);

    if (mapped.length === 0) {
      toast.error('Tidak ada data valid pada CSV.');
      return;
    }

    setIsSaving(true);
    try {
      await importResidentsCSV(token, mapped, mode);
      toast.success(`${mapped.length} warga berhasil di-import (mode: ${mode === 'delete-insert' ? 'Delete & Insert' : 'Upsert'}).`);
      await loadData();
    } catch (err) {
      toast.error('Gagal mengimpor data warga.');
      console.error(err);
    } finally {
      setIsSaving(false);
      setModalUpload(false);
    }
  };

  // ── Render ────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Daftar {template.memberLabel}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Menampilkan {filteredAndSorted.length} dari {profiles.length} {template.memberLabel.toLowerCase()}
          </p>
          {activeTenantId && canManage && (
            <p className="text-[11px] text-slate-500 mt-1">
              <Link
                to={`/t/${activeTenantId}/units`}
                className="text-slate-600 hover:text-emerald-700 underline font-medium transition"
              >
                Impor data rumah & penghuni tersedia di halaman Unit.
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              {!activeTenantId ? (
                <>
                  <button
                    type="button"
                    onClick={() => setModalUpload(true)}
                    className="pv-btn-ghost text-xs shadow-xs min-h-[36px]"
                  >
                    <AiOutlineUpload /> Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalAddEdit('add')}
                    className="pv-btn-primary text-xs shadow-xs min-h-[36px]"
                  >
                    <AiOutlinePlus /> Tambah {template.memberLabel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalInvite(true)}
                  className="pv-btn-primary text-xs shadow-xs min-h-[36px]"
                >
                  <AiOutlineUserAdd /> Undang {template.memberLabel}
                </button>
              )}
            </>
          )}
          {canManage && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="pv-btn-ghost text-xs shadow-xs min-h-[36px]"
            >
              <AiOutlineDownload /> Export
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold">{loadError}</div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 rounded-xl bg-white border border-rose-300 text-rose-900 text-xs font-bold hover:bg-rose-100 transition-colors shadow-2xs"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Banner pendaftar menunggu persetujuan (KOS-1.5) */}
      {activeTenantId && tenantAccess.canManageMembers && pendingMembersCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-bold text-sm">
              {pendingMembersCount}
            </span>
            <p className="text-sm font-medium">
              <span className="font-bold">{pendingMembersCount} pendaftar</span> menunggu persetujuan
            </p>
          </div>
          <Link
            to={`/t/${activeTenantId}/approval`}
            className="pv-btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs px-4 py-2 self-start sm:self-auto inline-flex items-center gap-1.5 shadow-xs"
          >
            Tinjau
          </Link>
        </div>
      )}

      {/* Search & filters */}
      <div data-tour="residents-filters" className="pv-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SearchInput
            placeholder={`Cari nama, email, telepon, ${template.unitLabel.toLowerCase()}...`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            onClear={() => {
              setSearch('');
              setCurrentPage(1);
            }}
            ariaLabel={`Cari data ${template.memberLabel.toLowerCase()}`}
          />
          <select
            value={filterBlock}
            onChange={(e) => {
              setFilterBlock(e.target.value);
              setCurrentPage(1);
            }}
            className="h-11 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-400 font-medium shadow-2xs"
            aria-label={`Filter berdasarkan blok atau kategori ${template.unitLabel.toLowerCase()}`}
          >
            <option value="">Semua Kategori / Blok</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="h-11 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-400 font-medium shadow-2xs"
            aria-label="Filter status keaktifan"
          >
            <option value="">Semua Status</option>
            <option value="active">Aktif</option>
            {activeTenantId && <option value="pending">Menunggu persetujuan</option>}
            <option value="inactive">Tidak Aktif</option>
          </select>
          <select
            value={filterOccupancy}
            onChange={(e) => {
              setFilterOccupancy(e.target.value);
              setCurrentPage(1);
            }}
            className="h-11 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-400 font-medium shadow-2xs"
            aria-label={`Filter ${template.contractLabel || 'status tinggal'}`}
          >
            <option value="">Semua {template.contractLabel || 'Status Tinggal'}</option>
            {getOccupancyOptions(activeTenant?.type).map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center justify-between pt-1 text-xs text-slate-500 border-t border-slate-100">
            <span className="font-medium">
              {activeFiltersCount} filter aktif diterapkan
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="font-bold text-slate-700 hover:text-slate-950 underline cursor-pointer"
            >
              Reset Filter & Pencarian
            </button>
          </div>
        )}
      </div>

      {/* Daftar Penghuni Adaptif (Mobile Cards / Desktop Table) */}
      <div data-tour="residents-list">
        {isLoading ? (
          <div>
            <div className="block md:hidden">
              <SkeletonList items={4} />
            </div>
            <div className="hidden md:block">
              <SkeletonTable cols={7} rows={6} />
            </div>
          </div>
        ) : loadError ? (
          <EmptyState
            icon="⚠️"
            title={`Data ${template.memberLabel} Belum Dapat Dimuat`}
            description={loadError}
            action={
              <button
                type="button"
                onClick={loadData}
                className="pv-btn-primary text-xs shadow-xs min-h-[44px]"
              >
                🔄 Coba Lagi
              </button>
            }
          />
        ) : filteredAndSorted.length === 0 ? (
          <EmptyState
            icon="👥"
            title={
              search
                ? `Tidak Ditemukan Hasil Pencarian`
                : activeFiltersCount > 0
                ? `Tidak Ada Data yang Cocok`
                : `Belum Ada ${template.memberLabel} Terdaftar`
            }
            description={
              search
                ? `Tidak ada data ${template.memberLabel.toLowerCase()} yang cocok dengan "${search}".`
                : activeFiltersCount > 0
                ? `Tidak ada data ${template.memberLabel.toLowerCase()} yang sesuai dengan filter yang Anda gunakan.`
                : `Mulai kelola komunitas dengan menambahkan data ${template.memberLabel.toLowerCase()} pertama Anda.`
            }
            action={
              activeFiltersCount > 0 ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="pv-btn-ghost text-xs shadow-2xs min-h-[44px]"
                >
                  Reset Filter & Pencarian
                </button>
              ) : canManage ? (
                activeTenantId ? (
                  <button
                    type="button"
                    onClick={() => setModalInvite(true)}
                    className="pv-btn-primary text-xs shadow-xs min-h-[44px]"
                  >
                    <AiOutlineUserAdd /> Undang {template.memberLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModalAddEdit('add')}
                    className="pv-btn-primary text-xs shadow-xs min-h-[44px]"
                  >
                    <AiOutlinePlus /> Tambah {template.memberLabel}
                  </button>
                )
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {/* Mobile View */}
            <div className="block md:hidden space-y-2.5">
              <MobileList
                items={paginatedItems}
                renderItem={(p) => {
                  const unit = getUnitById(p.unit_id);
                  return (
                    <ResidentCard
                      key={p.id}
                      profile={p}
                      unit={unit}
                      template={template}
                      activeTenant={activeTenant}
                      activeTenantId={activeTenantId}
                      canManageRoles={canManageRoles}
                      roleLabelText={activeTenantId ? getMemberRoleLabel(p) : undefined}
                      onClick={() => setSelectedId(p.id)}
                    />
                  );
                }}
              />
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={filteredAndSorted.length}
                pageSize={pageSize}
                onPageChange={(page) => setCurrentPage(page)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className="rounded-2xl border border-slate-200 shadow-xs"
              />
            </div>

            {/* Desktop View: Semantic Table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell
                      sortable
                      sortKey="name"
                      currentSortKey={sortKey}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                    >
                      Nama & Kontak
                    </TableHeaderCell>
                    <TableHeaderCell
                      sortable
                      sortKey="unit"
                      currentSortKey={sortKey}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                    >
                      {template.unitLabel}
                    </TableHeaderCell>
                    <TableHeaderCell className="hidden sm:table-cell">
                      Telepon
                    </TableHeaderCell>
                    <TableHeaderCell
                      sortable
                      sortKey="status"
                      currentSortKey={sortKey}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                    >
                      Status
                    </TableHeaderCell>
                    <TableHeaderCell className="hidden lg:table-cell">
                      {template.contractLabel || 'Status Tinggal'}
                    </TableHeaderCell>
                    <TableHeaderCell className="hidden lg:table-cell">
                      Pemilik
                    </TableHeaderCell>
                    <TableHeaderCell
                      sortable
                      sortKey="role"
                      currentSortKey={sortKey}
                      currentSortDirection={sortDirection}
                      onSort={handleSort}
                      className="hidden md:table-cell"
                    >
                      Role
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedItems.map((p) => {
                    const unit = getUnitById(p.unit_id);
                    const isPlaceholder = p.email && (p.email.includes('.local') || p.is_placeholder);
                    return (
                      <TableRow
                        key={p.id}
                        isClickable
                        onClick={() => setSelectedId(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedId(p.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Buka detail ${template.memberLabel?.toLowerCase() || 'warga'} ${p.full_name}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs">
                              {p.full_name.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">
                                {p.full_name}
                              </p>
                              {isPlaceholder ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                  Akun Sementara
                                </span>
                              ) : (
                                <p className="text-[11px] text-slate-400 truncate">
                                  {p.email || '—'}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-slate-800">
                          {unit ? (unit.label || `${unit.block}/${unit.unit_number}`) : '—'}
                        </TableCell>
                        <TableCell className="text-slate-500 hidden sm:table-cell">
                          {p.phone || '—'}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const badge = getMemberStatusBadge(p);
                            return (
                              <span className={`pv-badge ${badge.color}`}>
                                {badge.label}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {p.status === 'pending' ? (
                            <span className="pv-badge bg-amber-50 text-amber-700 border border-amber-200">
                              Calon {template.memberLabel}
                            </span>
                          ) : p.occupancy_status ? (
                            <span className={`pv-badge ${occupancyStatusColor(p.occupancy_status)}`}>
                              {occupancyStatusLabel(p.occupancy_status, activeTenant?.type)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-slate-700 text-xs font-medium">
                          {(() => {
                            if (!unit) return '—';
                            if (p.occupancy_status === 'tenant') {
                              const owner = getUnitOwner(p.unit_id);
                              return owner ? owner.full_name : '—';
                            }
                            if (p.occupancy_status && p.occupancy_status.startsWith('owner_')) {
                              return <span className="text-emerald-700 font-semibold">Diri sendiri</span>;
                            }
                            return '—';
                          })()}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {activeTenantId ? (
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`pv-badge ${
                                  p.is_owner
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : roleColor(p.role)
                                }`}
                              >
                                {getMemberRoleLabel(p)}
                              </span>
                              {canManageRoles && !p.is_owner && (
                                <Link
                                  to={`/t/${activeTenantId}/members/${p.id}/role`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] font-semibold text-forest-800 hover:text-forest-900 underline inline-block"
                                >
                                  Atur Jabatan
                                </Link>
                              )}
                            </div>
                          ) : (
                            <span className={`pv-badge ${roleColor(p.role)}`}>
                              {roleLabel(p.role, activeTenant?.type)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={filteredAndSorted.length}
                pageSize={pageSize}
                onPageChange={(page) => setCurrentPage(page)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal/Drawer detail */}
      {selected && (
        <ResidentDetailDrawer
          open={Boolean(selected)}
          profile={selected}
          unit={getUnitById(selected.unit_id)}
          owner={selected.occupancy_status === 'tenant' ? getUnitOwner(selected.unit_id) : null}
          canManage={canManage}
          template={template}
          activeTenant={activeTenant}
          activeTenantId={activeTenantId}
          canManageRoles={canManageRoles}
          roleLabelText={activeTenantId ? getMemberRoleLabel(selected) : undefined}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setModalAddEdit(selected);
            setSelectedId(null);
          }}
          onDelete={() => handleDelete(selected)}
          deleteLabel={activeTenantId ? 'Keluarkan' : 'Hapus'}
          canDelete={canManage && !(activeTenantId && selected?.is_owner)}
        />
      )}

      {/* Modal add/edit */}
      {modalAddEdit && canManage && (
        <ProfileFormModal
          profile={modalAddEdit === 'add' ? null : modalAddEdit}
          onSave={handleSaveProfile}
          onClose={() => setModalAddEdit(null)}
          isSaving={isSaving}
          units={units}
          currentUserRole={role}
          template={template}
          activeTenant={activeTenant}
          isTenantMode={Boolean(activeTenantId)}
        />
      )}

      {/* Modal upload CSV */}
      {modalUpload && canManage && !activeTenantId && (
        <UploadCSVModal
          onImport={handleImportCSV}
          onClose={() => setModalUpload(false)}
          isSaving={isSaving}
        />
      )}

      {/* Modal undang warga (mode tenant) */}
      {activeTenantId && modalInvite && canManage && (
        <InviteResidentModal
          isOpen={modalInvite}
          onClose={() => setModalInvite(false)}
          tenantId={activeTenantId}
          tenantName={activeTenant?.name}
          memberLabel={template.memberLabel}
        />
      )}
    </div>
  );
}
 
 // ── Sub-komponen ──────────────────────────────────────────────────
 
 function DetailModal({
  profile,
  canManage,
  template,
  activeTenant,
  activeTenantId,
  canManageRoles,
  roleLabelText,
  getUnitById,
  getUnitOwner,
  onClose,
  onEdit,
  onDelete,
}) {
  const unit = getUnitById(profile.unit_id);
  const owner = profile.occupancy_status === 'tenant' ? getUnitOwner(profile.unit_id) : null;
  const isOwnerMember = Boolean(activeTenantId && profile.is_owner);
  const deleteBtnLabel = activeTenantId ? 'Keluarkan' : 'Hapus';
  const memberRoleLabel = roleLabelText || (isOwnerMember ? 'Admin' : roleLabel(profile.role, activeTenant?.type));

  return (
    <Modal open onClose={onClose} title={`Detail ${template?.memberLabel || 'Penghuni'}`}>
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-forest-800 border border-slate-200 font-extrabold text-xl shadow-xs">
          {profile.full_name.charAt(0)}
        </span>
        <div>
          <h3 className="font-bold text-slate-900 text-base">{profile.full_name}</h3>
          {profile.email && profile.email.includes('@warga.palmvillage.local') ? (
            <p className="text-xs font-medium text-amber-600 mt-0.5">Akun Sementara (Belum Login Google)</p>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">{profile.email}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className={`pv-badge ${
                isOwnerMember ? 'bg-amber-50 text-amber-800 border-amber-200' : roleColor(profile.role)
              }`}
            >
              {memberRoleLabel}
            </span>
            {(() => {
              const statusBadge = getMemberStatusBadge(profile);
              return (
                <span className={`pv-badge ${statusBadge.color}`}>
                  {statusBadge.label}
                </span>
              );
            })()}
            {profile.status === 'pending' ? (
              <span className="pv-badge bg-amber-50 text-amber-700 border border-amber-200">
                Calon {template?.memberLabel || 'Anggota'}
              </span>
            ) : profile.occupancy_status ? (
              <span className={`pv-badge ${occupancyStatusColor(profile.occupancy_status)}`}>
                {occupancyStatusLabel(profile.occupancy_status, activeTenant?.type)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <Row label="Telepon" value={profile.phone || '—'} />
        <Row
          label={template?.unitLabel || 'Unit'}
          value={unit ? (unit.label || `Blok ${unit.block} / ${unit.unit_number} (Lt. ${unit.floor || '-'}, ${unit.size}m²)`) : `Tidak ada ${template?.unitLabel?.toLowerCase() || 'unit'}`}
        />
        <Row label="Status" value={getMemberStatusBadge(profile).label} />
        {profile.status === 'pending' ? (
          <Row label={template?.contractLabel || 'Status Tinggal'} value={`Calon ${template?.memberLabel || 'Anggota'}`} />
        ) : profile.occupancy_status ? (
          <Row label={template?.contractLabel || 'Status Tinggal'} value={occupancyStatusLabel(profile.occupancy_status, activeTenant?.type)} />
        ) : null}
        {owner && (
          <Row label={`Pemilik ${template?.unitLabel || 'Unit'}`} value={owner.full_name} />
        )}
      </div>
      <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
        {canManageRoles && activeTenantId && !profile.is_owner && (
          profile.status === 'pending' ? (
            <Link
              to={`/t/${activeTenantId}/approval`}
              className="pv-btn-primary bg-amber-600 hover:bg-amber-700 text-white flex-1 text-xs text-center inline-flex items-center justify-center gap-1 shadow-xs"
            >
              Tinjau & Setujui
            </Link>
          ) : (
            <Link
              to={`/t/${activeTenantId}/members/${profile.id}/role`}
              className="pv-btn-primary flex-1 text-xs text-center inline-flex items-center justify-center gap-1"
            >
              Atur Jabatan
            </Link>
          )
        )}
        {canManage && (
          <>
            <button onClick={onEdit} className="pv-btn-ghost flex-1 text-xs">
              <AiOutlineEdit /> Edit
            </button>
            {!isOwnerMember && (
              <button onClick={onDelete} className="pv-btn-danger flex-1 text-xs">
                <AiOutlineDelete /> {deleteBtnLabel}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ProfileFormModal({
  profile,
  onSave,
  onClose,
  isSaving,
  units,
  currentUserRole,
  template,
  activeTenant,
  isTenantMode = false,
}) {
  const isEdit = !!profile;
  const isKos = activeTenant?.type === 'kos';
  const isKelas = activeTenant?.type === 'kelas';
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    unit_id: profile?.unit_id || '',
    role: profile?.role || (isKos || isKelas ? 'anggota' : 'warga'),
    is_active: profile?.is_active ?? true,
    occupancy_status: profile?.occupancy_status || (isKos || isKelas ? 'tenant' : ''),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;

    if (isTenantMode) {
      onSave({
        ...(profile ? { id: profile.id } : {}),
        full_name: form.full_name.trim(),
        phone: form.phone ? form.phone.trim() : '',
        unit_id: form.unit_id ? Number(form.unit_id) : null,
        occupancy_status: form.occupancy_status || null,
      });
      return;
    }

    let finalEmail = form.email.trim().toLowerCase();
    if (!finalEmail) {
      const rand = Math.random().toString(36).substring(2, 7);
      const unit = units.find((u) => u.id === Number(form.unit_id));
      const cleanUnit = unit ? `unit_${(unit.label || `${unit.block}_${unit.unit_number}`).toLowerCase().replace(/[^a-z0-9]/g, '_')}` : `unassigned_${Date.now()}`;
      finalEmail = `${cleanUnit}_${rand}@warga.palmvillage.local`;
    }
    onSave({
      ...(profile ? { id: profile.id } : {}),
      full_name: form.full_name.trim(),
      email: finalEmail,
      phone: form.phone.trim(),
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      role: form.role,
      is_active: form.is_active,
      occupancy_status: form.occupancy_status || null,
    });
  };

  return (
    <Modal open onClose={onClose} title={`${isEdit ? 'Edit' : 'Tambah'} ${template?.memberLabel || 'Warga'}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nama Lengkap" required>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Contoh: Budi Santoso"
            autoComplete="name"
            enterKeyHint="next"
            className="pv-input text-xs"
            required
          />
        </Field>

        {!isTenantMode && (
          <Field label="Email Google (Login)">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="budi@gmail.com (opsional)"
              className="pv-input text-xs"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {isEdit
                ? 'Warga dapat login mandiri jika email cocok dengan akun Google-nya.'
                : 'Kosongkan jika warga belum memiliki akun Google. Sistem akan membuat akun sementara.'}
            </p>
          </Field>
        )}

        <Field label="Nomor Telepon / WhatsApp">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Contoh: 08123456789"
            className="pv-input text-xs"
          />
        </Field>

        <Field label={template?.unitLabel || 'Unit'}>
          <select
            value={form.unit_id}
            onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
            className="pv-input font-medium"
          >
            <option value="">Belum Memiliki {template?.unitLabel || 'Unit'}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label || `${u.block}/${u.unit_number}`}
              </option>
            ))}
          </select>
        </Field>

        {/* Status Tinggal / Hubungan Unit */}
        <Field label={template?.contractLabel || 'Status Tinggal'}>
          <select
            value={form.occupancy_status}
            onChange={(e) => setForm({ ...form, occupancy_status: e.target.value })}
            className="pv-input font-medium"
          >
            <option value="">Pilih {template?.contractLabel || 'Status Tinggal'}</option>
            {getOccupancyOptions(activeTenant?.type).map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>

        {!isTenantMode && (
          <>
            <Field label="Role Akses">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="pv-input font-medium"
              >
                {currentUserRole === 'admin' && (
                  <>
                    <option value="admin">Admin ({roleLabel('admin', activeTenant?.type)})</option>
                    <option value="bendahara">Bendahara</option>
                    <option value="pengurus">Pengurus ({roleLabel('pengurus', activeTenant?.type)})</option>
                  </>
                )}
                {currentUserRole === 'bendahara' && (
                  <>
                    <option value="bendahara">Bendahara</option>
                    <option value="pengurus">Pengurus ({roleLabel('pengurus', activeTenant?.type)})</option>
                  </>
                )}
                <option value={isKos || isKelas ? 'anggota' : 'warga'}>{template?.memberLabel || 'Warga'}</option>
              </select>
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-slate-300 text-gold-500 focus:ring-gold-400 h-4 w-4"
              />
              <label htmlFor="is_active" className="text-sm text-slate-700 font-medium">Status Aktif</label>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="pv-btn-ghost flex-1 text-xs">Batal</button>
          <button type="submit" disabled={isSaving} className="pv-btn-primary flex-1 text-xs">
            {isSaving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UploadCSVModal({ onImport, onClose, isSaving }) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('upsert');
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedRows(results.data);
        setStep(2);
      },
    });
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse({
      fields: ['Nama', 'Email', 'Telepon', 'Blok', 'Unit', 'Status', 'Role'],
      data: [['Contoh Warga', 'contoh@email.com', '08123456789', 'A', '01', 'Aktif', 'warga']],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_warga.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open onClose={onClose} title="Upload Data Warga (CSV)" size="lg">
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload file CSV berisi data warga. Format kolom: <strong>Nama, Email, Telepon, Blok, Unit, Status, Role</strong>.
          </p>

          <button onClick={downloadTemplate} disabled={isSaving} className="pv-btn-ghost text-xs">
            <AiOutlineDownload /> Download Template CSV
          </button>

          {/* Drop zone */}
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-10 cursor-pointer hover:border-gold-400 hover:bg-slate-50 transition-colors">
            <AiOutlineUpload size={32} className="text-slate-400" />
            <span className="text-sm text-slate-600 font-medium">
              {fileName ? fileName : 'Klik untuk pilih file CSV'}
            </span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              disabled={isSaving}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </label>

          {/* Mode */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Mode Import</p>
            <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
              <input
                type="radio"
                checked={mode === 'upsert'}
                disabled={isSaving}
                onChange={() => setMode('upsert')}
                className="mt-1 accent-gold-500"
              />
              <div>
                <p className="text-sm font-semibold text-slate-800">Upsert (Update & Insert)</p>
                <p className="text-[11px] text-slate-500">Update warga yang sudah ada (match email), tambah yang baru. Data lama dipertahankan.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
              <input
                type="radio"
                checked={mode === 'delete-insert'}
                disabled={isSaving}
                onChange={() => setMode('delete-insert')}
                className="mt-1 accent-gold-500"
              />
              <div>
                <p className="text-sm font-semibold text-slate-800">Delete & Insert</p>
                <p className="text-[11px] text-slate-500">Hapus SEMUA warga, ganti dengan data CSV. Akun Admin & Koordinator dipertahankan.</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700">
              <strong>{parsedRows.length}</strong> baris terbaca dari <strong>{fileName}</strong>
            </p>
            <span className="pv-badge bg-slate-100 text-slate-700 border border-slate-200">
              Mode: {mode === 'upsert' ? 'Upsert' : 'Delete & Insert'}
            </span>
          </div>

          {/* Preview table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100/90 border-b border-slate-200 sticky top-0">
                <tr>
                  {Object.keys(parsedRows[0] || {}).map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-bold text-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedRows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-1.5 text-slate-600">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 50 && (
              <p className="text-center text-[11px] text-slate-400 py-2">
                ...dan {parsedRows.length - 50} baris lainnya
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">← Kembali</button>
            <button
              onClick={() => onImport(parsedRows, mode)}
              disabled={isSaving}
              className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2"
            >
              {isSaving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Mengimpor...' : `Import ${parsedRows.length} Warga`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-slate-500 shrink-0 text-xs font-medium">{label}</span>
      <span className="text-slate-900 font-semibold text-right text-xs">{value}</span>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export function InviteResidentModal({
  isOpen,
  onClose,
  tenantId,
  tenantName,
  memberLabel = 'Warga',
}) {
  const [inviteCode, setInviteCode] = useState(() => getCachedTenantInviteCode(tenantId));
  const [isLoading, setIsLoading] = useState(false);
  const [copiedType, setCopiedType] = useState(null); // 'code' | 'link' | null

  useEffect(() => {
    if (isOpen && tenantId) {
      let isMounted = true;
      setIsLoading(true);
      fetchTenantInviteCode(tenantId)
        .then((code) => {
          if (isMounted) setInviteCode(code);
        })
        .catch(() => {
          if (isMounted) setInviteCode(null);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteLink = inviteCode ? `${origin}/join/${inviteCode}` : '';
  const waMessage = `Halo! Anda diundang untuk bergabung ke komunitas ${tenantName || 'kami'} di RuangWarga. Silakan klik tautan berikut untuk mendaftar:\n${inviteLink}\n\nAtau gunakan kode undangan: ${inviteCode}`;

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
      }
      setCopiedType('code');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      }
      setCopiedType('link');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal open onClose={onClose} title={`Undang ${memberLabel}`}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Memuat kode undangan...
          </div>
        ) : inviteCode ? (
          <>
            <p className="text-xs text-slate-600">
              Bagikan kode atau tautan undangan berikut agar calon {memberLabel.toLowerCase()} dapat mendaftar dan bergabung ke komunitas ini secara mandiri.
            </p>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                Kode Undangan
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-base font-extrabold text-forest-900 tracking-wider">
                  {inviteCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="pv-btn-ghost text-xs px-2.5 py-1 min-h-[32px]"
                >
                  {copiedType === 'code' ? 'Tersalin!' : 'Salin Kode'}
                </button>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                Tautan Pendaftaran
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-700 truncate min-w-0">
                  {inviteLink}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="pv-btn-ghost text-xs px-2.5 py-1 min-h-[32px] shrink-0"
                >
                  {copiedType === 'link' ? 'Tersalin!' : 'Salin Tautan'}
                </button>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pv-btn-primary flex-1 text-xs justify-center min-h-[36px]"
              >
                Bagikan via WhatsApp
              </a>
              <button
                type="button"
                onClick={onClose}
                className="pv-btn-ghost text-xs min-h-[36px]"
              >
                Tutup
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3 py-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
              Kode undangan belum tersedia atau gagal dimuat. Silakan buat atau periksa kode undangan di menu Pengaturan Komunitas.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pv-btn-ghost w-full text-xs min-h-[36px]"
            >
              Tutup
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
