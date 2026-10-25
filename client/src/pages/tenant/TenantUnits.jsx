import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineUpload,
  AiOutlineDownload,
  AiOutlineSearch,
  AiOutlineCheckCircle,
  AiOutlineCloseCircle,
  AiOutlineInfoCircle,
  AiOutlineWarning,
  AiOutlineCheck,
  AiOutlineClose,
} from 'react-icons/ai';
import Modal from '../../components/Modal';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { formatRupiah } from '../../services/dataHelpers';
import { formatDateWIB } from '../../utils/date';
import { KOS_FACILITIES } from '../../config/kosFacilities';
import {
  fetchTenantUnits,
  createTenantUnit,
  updateTenantUnit,
  setTenantUnitStatus,
  deleteTenantUnit,
  importTenantUnitsCSV,
  parseUnitsCsv,
  fetchTenantMembers,
  fetchKosContracts,
} from '../../services/tenantOperationalService';

/**
 * Menentukan status unit berikutnya saat tombol toggle ditekan (VERT-1.6)
 * @param {object} unit - objek unit ({ status, ... })
 * @param {string} tenantType - tipe tenant ('kos', 'kelas', 'rt_rw', dsb)
 * @returns {string|null} status berikutnya atau null bila tidak boleh diubah
 */
export function getNextUnitStatus(unit, tenantType) {
  const currentStatus = unit?.status;
  if (currentStatus === 'occupied') {
    return null; // jangan pernah mengubah occupied dari tombol toggle
  }

  if (currentStatus === 'inactive') {
    return (tenantType === 'kos' || tenantType === 'kelas') ? 'vacant' : 'active';
  }

  // active atau vacant dinonaktifkan
  return 'inactive';
}

/**
 * Menghasilkan konfigurasi badge status unit sesuai template vertikal (VERT-1.6)
 */
export function getUnitStatusBadge(status, template = {}) {
  switch (status) {
    case 'occupied':
      return {
        label: template.occupiedUnitLabel || 'Terisi',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-600',
      };
    case 'vacant':
      return {
        label: template.emptyUnitLabel || 'Kosong',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-600',
      };
    case 'inactive':
      return {
        label: 'Nonaktif',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
      };
    case 'active':
    default:
      return {
        label: 'Aktif',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-600',
      };
  }
}

export default function TenantUnits() {
  const { tenantId: routeTenantId } = useParams();
  const { activeTenantId, tenantType: contextTenantType, activeTenant, isOwner, hasPermission } = useTenant();
  const tenantId = routeTenantId || activeTenantId;

  const template = useTenantTemplate();
  const tenantType = contextTenantType || activeTenant?.type || template?.type || 'rt_rw';
  const unitLabel = template?.unitLabel || 'Unit';
  const toast = useToast();

  const canManage = Boolean(isOwner || (hasPermission && hasPermission('manage_settings')));
  const { canTransact } = useSubscriptionGate({ actionName: `Kelola ${unitLabel.toLowerCase()}` });

  const [units, setUnits] = useState([]);
  const [members, setMembers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Tambah / Edit Unit
  const [modalUnit, setModalUnit] = useState(null); // null | { mode: 'add' } | { mode: 'edit', unit }
  const [formLabel, setFormLabel] = useState('');
  const [formOccupantName, setFormOccupantName] = useState('');
  const [formOccupantPhone, setFormOccupantPhone] = useState('');
  const [formOccupancyStatus, setFormOccupancyStatus] = useState('owner_occupied');
  const [formOccupantNote, setFormOccupantNote] = useState('');
  const [formRentPrice, setFormRentPrice] = useState('');
  const [formFacilities, setFormFacilities] = useState([]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modal Konfirmasi Hapus
  const [modalDelete, setModalDelete] = useState(null); // null | unit
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal Impor CSV
  const [modalImportOpen, setModalImportOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);

  // Load Data
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [unitsRes, membersRes, contractsRes] = await Promise.all([
        fetchTenantUnits(tenantId),
        fetchTenantMembers(tenantId),
        tenantType === 'kos' ? fetchKosContracts(tenantId).catch(() => []) : Promise.resolve([]),
      ]);
      setUnits(unitsRes || []);
      setMembers(membersRes || []);
      setContracts(contractsRes || []);
    } catch (err) {
      toast.error(err.message || `Gagal memuat data ${unitLabel.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [tenantId, tenantType, unitLabel, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mapping Anggota Tertaut per Unit ID
  const membersByUnitId = useMemo(() => {
    const map = new Map();
    members.forEach((m) => {
      if (m.unit_id !== null && m.unit_id !== undefined) {
        const key = String(m.unit_id);
        const list = map.get(key) || [];
        list.push(m);
        map.set(key, list);
      }
    });
    return map;
  }, [members]);

  // Mapping Kontrak Aktif per Unit ID (untuk kos)
  const activeContractsByUnitId = useMemo(() => {
    const map = new Map();
    contracts.forEach((c) => {
      if (c && c.status === 'active' && c.unit_id != null) {
        map.set(String(c.unit_id), c);
      }
    });
    return map;
  }, [contracts]);

  // Filter & Pencarian Unit
  const filteredUnits = useMemo(() => {
    let result = units;

    if (statusFilter === 'active') {
      result = result.filter((u) => u.status !== 'inactive');
    } else if (statusFilter === 'inactive') {
      result = result.filter((u) => u.status === 'inactive');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((u) => {
        const matchLabel = u.label && u.label.toLowerCase().includes(q);
        const occ = u.metadata?.occupant;
        const matchOccName = occ?.name && occ.name.toLowerCase().includes(q);
        const matchOccPhone = occ?.phone && occ.phone.toLowerCase().includes(q);
        const linked = membersByUnitId.get(String(u.id)) || [];
        const matchMember = linked.some(
          (m) => m.full_name && m.full_name.toLowerCase().includes(q)
        );
        return matchLabel || matchOccName || matchOccPhone || matchMember;
      });
    }

    return result;
  }, [units, statusFilter, searchQuery, membersByUnitId]);

  // Buka Modal Tambah
  const handleOpenAddModal = () => {
    setModalUnit({ mode: 'add' });
    setFormLabel('');
    setFormOccupantName('');
    setFormOccupantPhone('');
    setFormOccupancyStatus('owner_occupied');
    setFormOccupantNote('');
    setFormRentPrice('');
    setFormFacilities([]);
    setFormError('');
  };

  // Buka Modal Edit
  const handleOpenEditModal = (unit) => {
    setModalUnit({ mode: 'edit', unit });
    setFormLabel(unit.label || '');
    const occ = unit.metadata?.occupant || {};
    setFormOccupantName(occ.name || '');
    setFormOccupantPhone(occ.phone || '');
    setFormOccupancyStatus(occ.occupancy_status || 'owner_occupied');
    setFormOccupantNote(occ.note || '');
    setFormRentPrice(
      unit.metadata?.default_rent_price !== undefined && unit.metadata?.default_rent_price !== null
        ? String(unit.metadata.default_rent_price)
        : ''
    );
    setFormFacilities(
      Array.isArray(unit.metadata?.facilities) ? [...unit.metadata.facilities] : []
    );
    setFormError('');
  };

  // Simpan Unit (Tambah / Edit)
  const handleSaveUnit = async (e) => {
    e.preventDefault();
    const cleanLabel = formLabel.trim();
    if (!cleanLabel) {
      setFormError(`Label ${unitLabel.toLowerCase()} wajib diisi.`);
      return;
    }

    const rentPriceNum = formRentPrice !== '' ? Number(formRentPrice) : undefined;
    if (rentPriceNum !== undefined && (isNaN(rentPriceNum) || rentPriceNum < 0)) {
      setFormError('Harga sewa harus berupa angka yang lebih besar atau sama dengan 0.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    const occupantPayload = {
      name: formOccupantName.trim() || undefined,
      phone: formOccupantPhone.trim() || undefined,
      occupancy_status: formOccupancyStatus || undefined,
      note: formOccupantNote.trim() || undefined,
    };

    const newUnitStatus = (tenantType === 'kos' || tenantType === 'kelas') ? 'vacant' : 'active';
    const rentPricePayload = tenantType === 'kos' ? rentPriceNum : undefined;
    const facilitiesPayload = tenantType === 'kos' ? formFacilities : undefined;

    try {
      if (modalUnit.mode === 'add') {
        await createTenantUnit(tenantId, {
          label: cleanLabel,
          occupant: occupantPayload,
          status: newUnitStatus,
          rentPrice: rentPricePayload,
          facilities: facilitiesPayload,
        });
        toast.success(`${unitLabel} "${cleanLabel}" berhasil ditambahkan.`);
      } else {
        await updateTenantUnit(tenantId, modalUnit.unit.id, {
          label: cleanLabel,
          occupant: occupantPayload,
          rentPrice: rentPricePayload,
          facilities: facilitiesPayload,
        });
        toast.success(`${unitLabel} "${cleanLabel}" berhasil diperbarui.`);
      }
      setModalUnit(null);
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan unit.');
      toast.error(err.message || 'Gagal menyimpan unit.');
    } finally {
      setIsSaving(false);
    }
  };

  // Aktifkan / Nonaktifkan Unit
  const handleToggleStatus = async (unit) => {
    if (unit.status === 'occupied') {
      toast.warning('Checkout penyewa dulu sebelum menonaktifkan kamar.');
      return;
    }

    const nextStatus = getNextUnitStatus(unit, tenantType);
    if (!nextStatus) {
      toast.warning('Checkout penyewa dulu sebelum menonaktifkan kamar.');
      return;
    }

    try {
      await setTenantUnitStatus(tenantId, unit.id, nextStatus);
      toast.success(
        `${unitLabel} "${unit.label}" kini ${nextStatus === 'inactive' ? 'Nonaktif' : 'Aktif'}.`
      );
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status unit.');
    }
  };

  // Buka Modal Hapus
  const handleOpenDeleteModal = (unit) => {
    setModalDelete(unit);
    setDeleteError('');
  };

  // Eksekusi Hapus Unit
  const handleDeleteUnit = async () => {
    if (!modalDelete) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteTenantUnit(tenantId, modalDelete.id);
      toast.success(`${unitLabel} "${modalDelete.label}" berhasil dihapus.`);
      setModalDelete(null);
      await loadData();
    } catch (err) {
      const errMsg = err.message || 'Gagal menghapus unit.';
      setDeleteError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Unduh Template CSV
  const handleDownloadTemplate = () => {
    const csvContent =
      'label,nama_penghuni,hp,status_tinggal,catatan\n' +
      'Blok A - 01,Budi Santoso,081234567890,pemilik,\n' +
      'Blok A - 02,Siti Aminah,081298765432,penyewa,Kontrak s.d. Des 2026\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template-${unitLabel.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Pilih & Baca File CSV
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportSummary(null);

    // Validasi ukuran file > 1 MB
    if (file.size > 1024 * 1024) {
      const msg = 'Ukuran file terlalu besar. Maksimal 1 MB.';
      setImportError(msg);
      toast.error(msg);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      let text = '';
      if (typeof file.text === 'function') {
        text = await file.text();
      } else {
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
      }

      const rows = parseUnitsCsv(text);
      if (!rows || rows.length === 0) {
        setImportError('File CSV kosong atau format tidak sesuai.');
        setPreviewRows([]);
        return;
      }

      setPreviewRows(rows);
    } catch (err) {
      setImportError('Gagal membaca file CSV: ' + err.message);
    }
  };

  // Eksekusi Impor CSV
  const handleImportSubmit = async () => {
    if (!previewRows || previewRows.length === 0) return;
    setIsImporting(true);
    setImportError('');
    try {
      const summary = await importTenantUnitsCSV(tenantId, previewRows);
      setImportSummary(summary);
      toast.success(`Impor selesai: ${summary.created} dibuat, ${summary.updated} diperbarui.`);
      await loadData();
    } catch (err) {
      setImportError(err.message || 'Gagal mengimpor data unit.');
      toast.error(err.message || 'Gagal mengimpor data unit.');
    } finally {
      setIsImporting(false);
    }
  };

  // Reset Modal Impor
  const handleCloseImportModal = () => {
    setModalImportOpen(false);
    setPreviewRows([]);
    setImportError('');
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getOccupancyLabel = (status) => {
    if (status === 'owner_occupied') return 'Pemilik';
    if (status === 'tenant') return 'Penyewa/Kontrak';
    return status || '-';
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Kelola {unitLabel}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Daftar {unitLabel.toLowerCase()}, data penghuni, dan integrasi akun anggota komunitas.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setModalImportOpen(true);
                setImportSummary(null);
                setImportError('');
                setPreviewRows([]);
              }}
              disabled={!canTransact}
              title={!canTransact ? 'Layanan dalam mode baca saja (Read-Only)' : undefined}
              className="pv-btn-ghost text-xs shadow-xs min-h-[38px] flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <AiOutlineUpload className="text-base" />
              <span>Impor CSV</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAddModal}
              disabled={!canTransact}
              title={!canTransact ? 'Layanan dalam mode baca saja (Read-Only)' : undefined}
              className="pv-btn-primary text-xs shadow-xs min-h-[38px] flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <AiOutlinePlus className="text-base" />
              <span>Tambah {unitLabel}</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter & Pencarian */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <AiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Cari label ${unitLabel.toLowerCase()}, nama penghuni, atau anggota...`}
            className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="statusFilterSelect" className="text-xs font-medium text-slate-500 whitespace-nowrap">
            Status:
          </label>
          <select
            id="statusFilterSelect"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
          >
            <option value="all">Semua ({units.length})</option>
            <option value="active">
              Aktif ({units.filter((u) => u.status !== 'inactive').length})
            </option>
            <option value="inactive">
              Nonaktif ({units.filter((u) => u.status === 'inactive').length})
            </option>
          </select>
        </div>
      </div>

      {/* Daftar Unit */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-200 border-t-emerald-700 animate-spin" />
          <p className="text-xs text-slate-500 mt-3">Memuat data {unitLabel.toLowerCase()}...</p>
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300 p-6">
          <AiOutlineInfoCircle className="mx-auto text-3xl text-slate-400 mb-2" />
          <p className="text-sm font-semibold text-slate-800">
            {searchQuery || statusFilter !== 'all'
              ? `Tidak ada ${unitLabel.toLowerCase()} yang sesuai filter.`
              : `Belum ada data ${unitLabel.toLowerCase()}.`}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {canManage
              ? `Mulai tambahkan ${unitLabel.toLowerCase()} satu per satu atau gunakan fitur Impor CSV untuk menambahkan data massal.`
              : `Data ${unitLabel.toLowerCase()} belum ditambahkan oleh pengurus.`}
          </p>
          {canManage && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={handleOpenAddModal}
                disabled={!canTransact}
                className="pv-btn-primary text-xs px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium transition"
              >
                Tambah {unitLabel} Baru
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Tampilan Desktop: Tabel */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">{unitLabel}</th>
                    <th className="py-3 px-4">Status</th>
                    {tenantType === 'kos' && <th className="py-3 px-4">Harga & Fasilitas</th>}
                    <th className="py-3 px-4">Penghuni</th>
                    <th className="py-3 px-4">Anggota Tertaut</th>
                    {canManage && <th className="py-3 px-4 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUnits.map((u) => {
                    const occ = u.metadata?.occupant;
                    const linked = membersByUnitId.get(String(u.id)) || [];
                    const activeContract = activeContractsByUnitId.get(String(u.id));
                    const effectiveStatus = tenantType === 'kos'
                      ? (u.status === 'inactive' ? 'inactive' : (activeContract || u.status === 'occupied' ? 'occupied' : 'vacant'))
                      : u.status;
                    const statusBadge = getUnitStatusBadge(effectiveStatus, template);
                    const isInactive = u.status === 'inactive';

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {u.label}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge.badgeClass}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`}
                              />
                              {statusBadge.label}
                            </span>
                            {tenantType === 'kos' && (
                              activeContract ? (
                                <>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    Kontrak Aktif
                                  </span>
                                  {!activeContract.end_date ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      Bulanan
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                      s.d. {formatDateWIB(activeContract.end_date)}
                                    </span>
                                  )}
                                  {activeContract.billing_cycle === 'month_start_prorata' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                      Prorata
                                    </span>
                                  )}
                                </>
                              ) : (u.status === 'occupied' && !u.metadata?.contract_start) ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  Belum ada kontrak
                                </span>
                              ) : null
                            )}
                          </div>
                        </td>
                        {tenantType === 'kos' && (
                          <td className="py-3.5 px-4 text-slate-700">
                            <div className="font-semibold text-slate-900">
                              {u.metadata?.default_rent_price !== undefined && u.metadata?.default_rent_price !== null
                                ? `${formatRupiah(u.metadata.default_rent_price)} / bln`
                                : '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {Array.isArray(u.metadata?.facilities) && u.metadata.facilities.length > 0
                                ? `${u.metadata.facilities.length} fasilitas`
                                : '0 fasilitas'}
                            </div>
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-slate-700">
                          {tenantType === 'kos' && activeContract ? (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-slate-900">
                                {activeContract.member?.full_name || activeContract.tenant_name || 'Penyewa Terdaftar'}
                              </div>
                              <div className="text-[11px] text-emerald-700 font-medium">Penyewa Kontrak</div>
                            </div>
                          ) : occ && occ.name ? (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-slate-900">{occ.name}</div>
                              {occ.phone && (
                                <div className="text-[11px] text-slate-500">{occ.phone}</div>
                              )}
                              <div className="text-[11px] text-slate-500">
                                <span className="font-medium text-slate-600">
                                  {getOccupancyLabel(occ.occupancy_status)}
                                </span>
                                {occ.note && (
                                  <span className="text-slate-400"> • {occ.note}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Belum ada penghuni</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          {linked.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {linked.map((m) => (
                                <span
                                  key={m.id}
                                  className="inline-block bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded text-[11px] font-medium"
                                >
                                  {m.full_name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Belum ada akun tertaut</span>
                          )}
                        </td>
                        {canManage && (
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(u)}
                                disabled={!canTransact}
                                title="Edit data unit"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                              >
                                <AiOutlineEdit className="text-base" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                disabled={!canTransact}
                                title={
                                  u.status === 'occupied'
                                    ? 'Checkout penyewa dulu'
                                    : isInactive
                                    ? 'Aktifkan unit'
                                    : 'Nonaktifkan unit'
                                }
                                className={`p-1.5 rounded-lg transition ${
                                  isInactive
                                    ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                    : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                }`}
                              >
                                {isInactive ? (
                                  <AiOutlineCheckCircle className="text-base" />
                                ) : (
                                  <AiOutlineCloseCircle className="text-base" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(u)}
                                disabled={!canTransact}
                                title="Hapus unit"
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                              >
                                <AiOutlineDelete className="text-base" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tampilan Mobile: Kartu */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredUnits.map((u) => {
              const occ = u.metadata?.occupant;
              const linked = membersByUnitId.get(String(u.id)) || [];
              const activeContract = activeContractsByUnitId.get(String(u.id));
              const effectiveStatus = tenantType === 'kos'
                ? (u.status === 'inactive' ? 'inactive' : (activeContract || u.status === 'occupied' ? 'occupied' : 'vacant'))
                : u.status;
              const statusBadge = getUnitStatusBadge(effectiveStatus, template);
              const isInactive = u.status === 'inactive';

              return (
                <div
                  key={u.id}
                  className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{u.label}</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge.badgeClass}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`}
                        />
                        {statusBadge.label}
                      </span>
                      {tenantType === 'kos' && (
                        activeContract ? (
                          <>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Kontrak Aktif
                            </span>
                            {!activeContract.end_date ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Bulanan
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                s.d. {formatDateWIB(activeContract.end_date)}
                              </span>
                            )}
                            {activeContract.billing_cycle === 'month_start_prorata' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                Prorata
                              </span>
                            )}
                          </>
                        ) : (u.status === 'occupied' && !u.metadata?.contract_start) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Belum ada kontrak
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>

                  {tenantType === 'kos' && (
                    <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Harga Sewa:
                        </div>
                        <div className="font-bold text-slate-900">
                          {u.metadata?.default_rent_price !== undefined && u.metadata?.default_rent_price !== null
                            ? `${formatRupiah(u.metadata.default_rent_price)} / bln`
                            : '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Fasilitas:
                        </div>
                        <div className="text-slate-600 font-medium">
                          {Array.isArray(u.metadata?.facilities) && u.metadata.facilities.length > 0
                            ? `${u.metadata.facilities.length} fasilitas`
                            : '0 fasilitas'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Penghuni:
                    </div>
                    {tenantType === 'kos' && activeContract ? (
                      <div>
                        <div className="font-semibold text-slate-900">
                          {activeContract.member?.full_name || activeContract.tenant_name || 'Penyewa Terdaftar'}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-medium">Penyewa Kontrak Aktif</div>
                      </div>
                    ) : occ && occ.name ? (
                      <div>
                        <div className="font-semibold text-slate-900">{occ.name}</div>
                        {occ.phone && <div className="text-slate-500">{occ.phone}</div>}
                        <div className="text-slate-500">
                          {getOccupancyLabel(occ.occupancy_status)}
                          {occ.note && <span> • {occ.note}</span>}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Belum ada penghuni</span>
                    )}
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Anggota Tertaut:
                    </div>
                    {linked.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {linked.map((m) => (
                          <span
                            key={m.id}
                            className="inline-block bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded text-[11px] font-medium"
                          >
                            {m.full_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Belum ada akun tertaut</span>
                    )}
                  </div>

                  {canManage && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(u)}
                        disabled={!canTransact}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-700 hover:bg-slate-50 transition flex items-center gap-1"
                      >
                        <AiOutlineEdit /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        disabled={!canTransact}
                        className={`px-2.5 py-1 text-xs border rounded transition flex items-center gap-1 ${
                          isInactive
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                            : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        {isInactive ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(u)}
                        disabled={!canTransact}
                        className="px-2.5 py-1 text-xs border border-rose-200 text-rose-600 hover:bg-rose-50 rounded transition flex items-center gap-1"
                      >
                        <AiOutlineDelete /> Hapus
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Tambah / Edit Unit */}
      {modalUnit && (
        <Modal
          open={Boolean(modalUnit)}
          onClose={() => setModalUnit(null)}
          title={`${modalUnit.mode === 'add' ? 'Tambah' : 'Edit'} ${unitLabel}`}
          size="md"
        >
          <form onSubmit={handleSaveUnit} className="p-6 space-y-4">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                <AiOutlineWarning className="text-base shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label htmlFor="unitLabelInput" className="block text-xs font-bold text-slate-700 mb-1">
                Label / Nomor {unitLabel} <span className="text-rose-500">*</span>
              </label>
              <input
                id="unitLabelInput"
                type="text"
                required
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Misal: Blok A - 01"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
            </div>

            {tenantType === 'kos' && (
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Harga & Fasilitas Kamar
                </h4>

                <div>
                  <label htmlFor="rentPriceInput" className="block text-xs font-bold text-slate-700 mb-1">
                    Harga sewa per bulan (Rp)
                  </label>
                  <input
                    id="rentPriceInput"
                    type="number"
                    min="0"
                    value={formRentPrice}
                    onChange={(e) => setFormRentPrice(e.target.value)}
                    placeholder="Misal: 1500000"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Fasilitas Kamar
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {KOS_FACILITIES.map((fac) => {
                      const checked = formFacilities.includes(fac);
                      return (
                        <label
                          key={fac}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            checked
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormFacilities([...formFacilities, fac]);
                              } else {
                                setFormFacilities(formFacilities.filter((f) => f !== fac));
                              }
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{fac}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Data Penghuni (Opsional)
              </h4>

              <div className="space-y-3">
                <div>
                  <label htmlFor="occupantNameInput" className="block text-xs font-medium text-slate-600 mb-1">
                    Nama Penghuni
                  </label>
                  <input
                    id="occupantNameInput"
                    type="text"
                    value={formOccupantName}
                    onChange={(e) => setFormOccupantName(e.target.value)}
                    placeholder="Nama warga / kepala keluarga"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="occupantPhoneInput" className="block text-xs font-medium text-slate-600 mb-1">
                      No. HP / WhatsApp
                    </label>
                    <input
                      id="occupantPhoneInput"
                      type="tel"
                      value={formOccupantPhone}
                      onChange={(e) => setFormOccupantPhone(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="occupancyStatusSelect" className="block text-xs font-medium text-slate-600 mb-1">
                      Status Tinggal
                    </label>
                    <select
                      id="occupancyStatusSelect"
                      value={formOccupancyStatus}
                      onChange={(e) => setFormOccupancyStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                    >
                      <option value="owner_occupied">Pemilik</option>
                      <option value="tenant">Penyewa/Kontrak</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="occupantNoteTextarea" className="block text-xs font-medium text-slate-600 mb-1">
                    Catatan Penghuni
                  </label>
                  <textarea
                    id="occupantNoteTextarea"
                    rows={2}
                    value={formOccupantNote}
                    onChange={(e) => setFormOccupantNote(e.target.value)}
                    placeholder="Keterangan tambahan (misal: kontrak s.d. Des 2026)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalUnit(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition disabled:opacity-50"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Konfirmasi Hapus Unit */}
      {modalDelete && (
        <Modal
          open={Boolean(modalDelete)}
          onClose={() => setModalDelete(null)}
          title={`Hapus ${unitLabel}`}
          size="sm"
        >
          <div className="p-6 space-y-4">
            {deleteError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                <AiOutlineWarning className="text-base shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-slate-700">
              Apakah Anda yakin ingin menghapus {unitLabel.toLowerCase()}{' '}
              <strong className="text-slate-900 font-bold">"{modalDelete.label}"</strong>?
            </p>
            <p className="text-[11px] text-slate-500">
              Perhatian: {unitLabel} yang sudah memiliki riwayat tagihan tidak dapat dihapus dan
              harus dinonaktifkan saja.
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteUnit}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Impor CSV */}
      {modalImportOpen && (
        <Modal
          open={modalImportOpen}
          onClose={handleCloseImportModal}
          title={`Impor Data ${unitLabel} via CSV`}
          size="lg"
        >
          <div className="p-6 space-y-5">
            {/* Bagian Unduh Template */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900">1. Unduh Template CSV</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Gunakan format kolom standar: label, nama_penghuni, hp, status_tinggal, catatan.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="pv-btn-ghost text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-white transition flex items-center gap-1.5 shrink-0"
              >
                <AiOutlineDownload className="text-base" />
                <span>Unduh Template CSV</span>
              </button>
            </div>

            {/* Bagian Pilih File */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900">2. Pilih File CSV</h4>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                data-testid="csv-file-input"
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 file:cursor-pointer cursor-pointer border border-slate-300 rounded-lg p-1.5"
              />
              <p className="text-[11px] text-slate-400">
                Format .csv, ukuran maksimal 1 MB. Mode upsert berdasarkan label unit.
              </p>
            </div>

            {importError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                <AiOutlineWarning className="text-base shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            {/* Pratinjau Baris */}
            {previewRows.length > 0 && !importSummary && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">
                    3. Pratinjau Data (Total {previewRows.length} baris)
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Menampilkan maksimal 10 baris pertama
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-56">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Label</th>
                        <th className="py-2 px-3">Penghuni</th>
                        <th className="py-2 px-3">No. HP</th>
                        <th className="py-2 px-3">Status Tinggal</th>
                        <th className="py-2 px-3">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {row.label}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {row.occupant_name || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {row.occupant_phone || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {getOccupancyLabel(row.occupancy_status)}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {row.note || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={isImporting}
                    className="pv-btn-primary text-xs px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    {isImporting ? 'Mengimpor...' : `Impor ${previewRows.length} baris`}
                  </button>
                </div>
              </div>
            )}

            {/* Ringkasan Hasil Impor */}
            {importSummary && (
              <div className="space-y-3 bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <AiOutlineCheck className="text-base" />
                  <span>Ringkasan Hasil Impor:</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <div className="text-base font-bold text-emerald-700">
                      {importSummary.created}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">Dibuat</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <div className="text-base font-bold text-sky-700">
                      {importSummary.updated}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">Diperbarui</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <div className="text-base font-bold text-amber-700">
                      {importSummary.skipped?.length || 0}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">Dilewati</div>
                  </div>
                </div>

                {importSummary.skipped && importSummary.skipped.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-700">
                      Rincian baris yang dilewati:
                    </div>
                    <div className="max-h-28 overflow-y-auto text-[11px] text-slate-600 space-y-1 bg-white p-2 rounded border border-emerald-100">
                      {importSummary.skipped.map((s, idx) => (
                        <div key={idx} className="flex items-start gap-1">
                          <span className="text-amber-600 font-mono font-bold">•</span>
                          <span>
                            {s.row?.label ? `[${s.row.label}] ` : ''}
                            {s.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCloseImportModal}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
              >
                {importSummary ? 'Selesai' : 'Tutup'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
