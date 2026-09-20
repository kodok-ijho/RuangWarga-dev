import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AiOutlineDelete,
  AiOutlineDownload,
  AiOutlineEdit,
  AiOutlineEye,
  AiOutlineHome,
  AiOutlinePlus,
  AiOutlineSearch,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useTour } from '../context/TourContext';
import { useTenant } from '../hooks/useTenant';
import { useTenantTemplate } from '../hooks/useTenantTemplate';
import Modal from '../components/Modal';
import {
  EmptyState,
  SkeletonTable,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SearchInput,
  Pagination,
} from '../components/ui';
import {
  fetchUnits,
  upsertUnit,
  fetchResidents,
  fetchPayments,
  fetchIPLSchemas,
} from '../services/dataService';
import { fetchTenantUnits, fetchTenantMembers } from '../services/tenantOperationalService';
import {
  isStaffRole,
  isBendaharaOrAbove,
  formatRupiah,
  computeSchemaAmount,
  getSchemaById,
  canManageHouses,
  DEFAULT_IPL_SCHEMAS,
} from '../services/dataHelpers';

const EMPTY_FORM = {
  block: 'CB1',
  unit_number: '',
  floor: 1,
  size: 72,
  is_occupied: false,
  owner_id: '',
  ipl_schema_id: 'schema-basic',
  notes: '',
};

export default function Houses() {
  const { role, session, isReadOnly } = useAuth();
  const { activeTenantId, activeTenant } = useTenant();
  const template = useTenantTemplate();
  const isRtRw = !activeTenant?.type || activeTenant?.type === 'rt_rw';
  const sitePlanUrl = activeTenant?.settings?.site_plan_url || (activeTenant?.slug === 'palm-village' ? '/Mapsite%20Palm%20Village.png' : null);
  const sitePlanPdf = activeTenant?.settings?.site_plan_pdf || (activeTenant?.slug === 'palm-village' ? '/Site Plan Update 2.pdf' : null);
  const hasSitePlan = isRtRw && Boolean(sitePlanUrl);

  const { triggerTour } = useTour();
  const token = session?.access_token;
  const toast = useToast();
  const isStaff = isStaffRole(role);
  // Unit master data is an Admin capability. Staff can inspect it, but the
  // live /units/upsert workflow correctly rejects non-admin mutations.
  const canWrite = canManageHouses(role, isReadOnly);

  // Data states
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [iplSchemas, setIplSchemas] = useState(DEFAULT_IPL_SCHEMAS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSeqRef = useRef(0);
  const activeTenantRef = useRef(activeTenantId);
  activeTenantRef.current = activeTenantId;

  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortKey, setSortKey] = useState('unit');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedUnit, setSelectedUnit] = useState(null);
  const [formUnit, setFormUnit] = useState(null);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);

  // Tenant switch reset effect
  useEffect(() => {
    setSelectedUnit(null);
    setFormUnit(null);
    setIsMapPreviewOpen(false);
    setSearch('');
    setFilterBlock('');
    setFilterStatus('');
    setCurrentPage(1);
    setSortKey('unit');
    setSortDirection('asc');
    setUnits([]);
    setProfiles([]);
    setLoadError(null);
  }, [activeTenantId]);

  const loadData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const targetTenantId = activeTenantId;
    setIsLoading(true);
    setLoadError(null);
    try {
      if (targetTenantId && !String(targetTenantId).startsWith('demo-')) {
        const [tenantUnits, members, resSchemas] = await Promise.all([
          fetchTenantUnits(targetTenantId),
          fetchTenantMembers(targetTenantId),
          fetchIPLSchemas(token).catch((err) => {
            console.warn('Failed to fetch IPL schemas; using defaults:', err);
            return DEFAULT_IPL_SCHEMAS;
          }),
        ]);
        if (seq !== fetchSeqRef.current || activeTenantRef.current !== targetTenantId) {
          return;
        }
        setUnits(
          (tenantUnits || []).map((u) => ({
            ...u,
            block: u.metadata?.block || u.block || u.label || 'BLOK',
            unit_number: u.metadata?.unit_number || u.unit_number || '',
            size: u.metadata?.size ?? u.size ?? 0,
            floor: u.metadata?.floor ?? u.floor ?? 1,
            is_occupied: u.status === 'occupied' || u.is_occupied || false,
            owner_id: u.metadata?.owner_id || u.owner_id || null,
            ipl_schema_id: u.metadata?.ipl_schema_id || u.ipl_schema_id || 'schema-basic',
            notes: u.metadata?.notes || u.notes || '',
          }))
        );
        setProfiles(members || []);
        setIplSchemas(resSchemas && resSchemas.length > 0 ? resSchemas : DEFAULT_IPL_SCHEMAS);
      } else {
        const [resUnits, resProfiles, resSchemas] = await Promise.all([
          fetchUnits(token),
          fetchResidents(token),
          fetchIPLSchemas(token).catch((err) => {
            console.warn('Failed to fetch IPL schemas; using defaults:', err);
            return DEFAULT_IPL_SCHEMAS;
          }),
        ]);
        if (seq !== fetchSeqRef.current || activeTenantRef.current !== targetTenantId) {
          return;
        }
        setUnits(resUnits || []);
        setProfiles(resProfiles || []);
        setIplSchemas(resSchemas && resSchemas.length > 0 ? resSchemas : DEFAULT_IPL_SCHEMAS);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current || activeTenantRef.current !== targetTenantId) {
        return;
      }
      const msg = err.message || `Gagal memuat data master ${template.unitLabel.toLowerCase()}.`;
      setLoadError(msg);
      toast.error(msg);
      console.error('loadData Houses error:', err);
    } finally {
      if (seq === fetchSeqRef.current && activeTenantRef.current === targetTenantId) {
        setIsLoading(false);
      }
    }
  }, [token, toast, template.unitLabel, activeTenantId]);

  useEffect(() => {
    loadData();
    triggerTour('houses');
  }, [loadData, triggerTour]);

  const getUnitOwner = useCallback((unitId) => {
    if (!unitId) return null;
    const unit = units.find((u) => u.id === Number(unitId));
    if (!unit) return null;
    if (unit.owner_id) {
      const p = profiles.find((p) => p.id === unit.owner_id);
      if (p) return p;
    }
    return profiles.find(
      (p) => p.unit_id === Number(unitId) && p.occupancy_status && p.occupancy_status.startsWith('owner_')
    ) || null;
  }, [units, profiles]);

  const getUnitOccupant = useCallback((unitId) => {
    if (!unitId) return null;
    return profiles.find(
      (p) =>
        p.unit_id === Number(unitId) &&
        p.is_active &&
        (p.occupancy_status === 'tenant' || p.occupancy_status === 'owner_occupied')
    ) || null;
  }, [profiles]);

  const blocks = useMemo(
    () => [...new Set(units.map((unit) => unit.block))].filter(Boolean).sort(),
    [units]
  );

  const stats = useMemo(() => {
    const activeUnits = units.filter((unit) => unit.is_occupied).length;
    return {
      total: units.length,
      occupied: activeUnits,
      vacant: units.length - activeUnits,
      blocks: blocks.length,
    };
  }, [blocks.length, units]);

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((unit) => {
      const owner = getUnitOwner(unit.id);
      const occupant = getUnitOccupant(unit.id);
      const label = `${unit.block}/${unit.unit_number}`.toLowerCase();
      const matchesSearch =
        !q ||
        label.includes(q) ||
        (owner?.full_name || '').toLowerCase().includes(q) ||
        (occupant?.full_name || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (filterBlock && unit.block !== filterBlock) return false;
      if (filterStatus === 'occupied' && !unit.is_occupied) return false;
      if (filterStatus === 'vacant' && unit.is_occupied) return false;
      return true;
    });
  }, [filterBlock, filterStatus, search, units, getUnitOwner, getUnitOccupant]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedUnits = useMemo(() => {
    return [...filteredUnits].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'unit') {
        const blockComp = String(a.block || '').localeCompare(String(b.block || ''));
        if (blockComp !== 0) {
          cmp = blockComp;
        } else {
          cmp = String(a.unit_number || '').localeCompare(String(b.unit_number || ''), undefined, { numeric: true });
        }
      } else if (sortKey === 'owner') {
        const ownerA = getUnitOwner(a.id)?.full_name || '';
        const ownerB = getUnitOwner(b.id)?.full_name || '';
        cmp = ownerA.localeCompare(ownerB);
      } else if (sortKey === 'occupant') {
        const occA = getUnitOccupant(a.id)?.full_name || '';
        const occB = getUnitOccupant(b.id)?.full_name || '';
        cmp = occA.localeCompare(occB);
      } else if (sortKey === 'schema') {
        const schemaA = getSchemaById(iplSchemas, a.ipl_schema_id)?.name || '';
        const schemaB = getSchemaById(iplSchemas, b.ipl_schema_id)?.name || '';
        cmp = schemaA.localeCompare(schemaB);
      } else if (sortKey === 'floor') {
        cmp = (Number(a.floor) || 0) - (Number(b.floor) || 0);
      } else if (sortKey === 'size') {
        cmp = (Number(a.size) || 0) - (Number(b.size) || 0);
      } else if (sortKey === 'status') {
        cmp = (a.is_occupied === b.is_occupied) ? 0 : a.is_occupied ? -1 : 1;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredUnits, sortKey, sortDirection, getUnitOwner, getUnitOccupant, iplSchemas]);

  const totalPages = Math.max(1, Math.ceil(sortedUnits.length / pageSize));
  const paginatedUnits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedUnits.slice(start, start + pageSize);
  }, [sortedUnits, currentPage, pageSize]);

  const activeFilterCount = (filterBlock ? 1 : 0) + (filterStatus ? 1 : 0) + (search ? 1 : 0);

  const openAdd = () => {
    setFormUnit({ ...EMPTY_FORM });
  };

  const openMapPreview = () => {
    setIsMapPreviewOpen(true);
  };

  const closeMapPreview = () => {
    setIsMapPreviewOpen(false);
  };

  const openEdit = (unit) => {
    setFormUnit({
      ...unit,
      owner_id: unit.owner_id || '',
      ipl_schema_id: unit.ipl_schema_id || (unit.is_occupied ? 'schema-komplit' : 'schema-basic'),
      notes: unit.notes || '',
    });
  };

  const handleSave = async (data) => {
    const normalized = {
      ...data,
      block: data.block.trim().toUpperCase(),
      unit_number: data.unit_number.trim().toUpperCase(),
      floor: Number(data.floor) || 1,
      size: Number(data.size) || 0,
      owner_id: data.owner_id || null,
      ipl_schema_id: data.ipl_schema_id || 'schema-basic',
      notes: data.notes?.trim() || '',
    };

    if (!normalized.block || !normalized.unit_number) {
      toast.error(`Kategori/Blok dan nomor ${template.unitLabel.toLowerCase()} wajib diisi.`);
      return;
    }

    const duplicate = units.find(
      (unit) =>
        unit.id !== normalized.id &&
        unit.block === normalized.block &&
        unit.unit_number === normalized.unit_number
    );

    if (duplicate) {
      toast.error(`${template.unitLabel} ${normalized.block}/${normalized.unit_number} sudah ada.`);
      return;
    }

    setIsSaving(true);
    try {
      await upsertUnit(token, normalized);
      toast.success(normalized.id ? `${template.unitLabel} ${normalized.block}/${normalized.unit_number} dan skema ${template.billLabel} diperbarui.` : `${template.unitLabel} ${normalized.block}/${normalized.unit_number} ditambahkan.`);
      await loadData();
      setFormUnit(null);
    } catch (err) {
      toast.error(`Gagal menyimpan data ${template.unitLabel.toLowerCase()}.`);
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (unit) => {
    const relatedProfiles = profiles.filter((profile) => profile.unit_id === unit.id);

    if (relatedProfiles.length) {
      if (
        !confirm(
          `${template.unitLabel} ${unit.block}/${unit.unit_number} masih punya relasi ${template.memberLabel.toLowerCase()}. Nonaktifkan status aktif ${template.unitLabel.toLowerCase()} ini?`
        )
      ) {
        return;
      }
      setIsSaving(true);
      try {
        await upsertUnit(token, { ...unit, is_occupied: false });
        toast.success(`${template.unitLabel} ${unit.block}/${unit.unit_number} dinonaktifkan.`);
        await loadData();
        setSelectedUnit(null);
      } catch (err) {
        toast.error(`Gagal menonaktifkan ${template.unitLabel.toLowerCase()}.`);
        console.error(err);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!confirm(`Tandai ${template.unitLabel.toLowerCase()} ${unit.block}/${unit.unit_number} tidak aktif / kosong?`)) return;
    setIsSaving(true);
    try {
      await upsertUnit(token, { ...unit, is_occupied: false });
      toast.success(`${template.unitLabel} ${unit.block}/${unit.unit_number} ditandai kosong / nonaktif.`);
      await loadData();
      setSelectedUnit(null);
    } catch (err) {
      toast.error(`Gagal memperbarui status ${template.unitLabel.toLowerCase()}.`);
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {canWrite
              ? `Manajemen ${template.unitPluralLabel} & Skema ${template.billLabel}`
              : `Daftar ${template.unitPluralLabel} ${template.communityLabel}`}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {canWrite
              ? `Rawat master data ${template.unitLabel.toLowerCase()} dan kelola profil skema biaya ${template.billLabel.toLowerCase()}.`
              : `Informasi direktori ${template.unitLabel.toLowerCase()}, status terisi, dan detail unit.`}
          </p>
        </div>
        {canWrite && (
          <button type="button" onClick={openAdd} className="pv-btn-primary text-xs">
            <AiOutlinePlus /> Tambah {template.unitLabel}
          </button>
        )}
      </div>

      {hasSitePlan ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div data-tour="houses-mapsite" className="pv-card overflow-hidden">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Site Plan {activeTenant?.name || template.communityLabel}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Referensi visual denah tata ruang {template.unitLabel.toLowerCase()}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sitePlanPdf && (
                    <a
                      href={sitePlanPdf}
                      download={`Site Plan ${activeTenant?.name || 'RuangWarga'}.pdf`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
                      title="Unduh file Site Plan PDF"
                    >
                      <AiOutlineDownload className="text-sm text-slate-500" /> Unduh PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={openMapPreview}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
                  >
                    <AiOutlineEye /> Perbesar
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white p-3">
              <img
                src={sitePlanUrl}
                alt={`Site Plan ${activeTenant?.name || ''}`}
                className="h-auto w-full rounded-xl border border-slate-200 object-contain"
              />
            </div>
          </div>

          <div data-tour="houses-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatCard label={`Total ${template.unitLabel}`} value={stats.total} tone="forest" />
            <StatCard label={`${template.occupiedUnitLabel}`} value={stats.occupied} tone="green" />
            <StatCard label={`${template.emptyUnitLabel}`} value={stats.vacant} tone="amber" />
            <StatCard label="Blok / Kategori" value={stats.blocks} tone="gold" />
          </div>
        </section>
      ) : (
        <section data-tour="houses-stats" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={`Total ${template.unitLabel}`} value={stats.total} tone="forest" />
          <StatCard label={`${template.occupiedUnitLabel}`} value={stats.occupied} tone="green" />
          <StatCard label={`${template.emptyUnitLabel}`} value={stats.vacant} tone="amber" />
          <StatCard label="Kelompok / Kategori" value={stats.blocks} tone="gold" />
        </section>
      )}

      {hasSitePlan && (
        <Modal open={isMapPreviewOpen} onClose={closeMapPreview} title={`Site Plan ${activeTenant?.name || template.communityLabel}`} size="xl">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-slate-500">
                Preview peta tata ruang untuk referensi blok dan posisi unit.
              </p>
              {sitePlanPdf && (
                <a
                  href={sitePlanPdf}
                  download={`Site Plan ${activeTenant?.name || 'RuangWarga'}.pdf`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 shadow-xs transition-colors shrink-0"
                >
                  <AiOutlineDownload className="text-sm" /> Unduh PDF Asli
                </a>
              )}
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2">
              <img
                src={sitePlanUrl}
                alt={`Site Plan ${activeTenant?.name || ''} versi besar`}
                className="w-full h-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </Modal>
      )}

      <section className="pv-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setCurrentPage(1);
              }}
              placeholder={`Cari nomor ${template.unitLabel.toLowerCase()}, penanggung jawab, ${template.memberLabel.toLowerCase()}...`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterBlock}
              onChange={(event) => {
                setFilterBlock(event.target.value);
                setCurrentPage(1);
              }}
              className="pv-input text-xs py-2 w-auto min-w-[130px]"
              aria-label="Filter Kategori atau Blok"
            >
              <option value="">Semua Kategori / Blok</option>
              {blocks.map((block) => (
                <option key={block} value={block}>
                  {block}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(event) => {
                setFilterStatus(event.target.value);
                setCurrentPage(1);
              }}
              className="pv-input text-xs py-2 w-auto min-w-[120px]"
              aria-label="Filter Status Hunian"
            >
              <option value="">Semua Status</option>
              <option value="occupied">{template.occupiedUnitLabel}</option>
              <option value="vacant">{template.emptyUnitLabel}</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterBlock('');
                  setFilterStatus('');
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
                title="Reset semua filter dan pencarian"
              >
                Reset ({activeFilterCount})
              </button>
            )}
          </div>
        </div>
      </section>

      {isLoading ? (
        <SkeletonTable cols={7} rows={6} />
      ) : loadError ? (
        <EmptyState
          icon="⚠️"
          title={`Data ${template.unitLabel} Belum Dapat Dimuat`}
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
      ) : units.length === 0 ? (
        <EmptyState
          icon="🏡"
          title={`Belum Ada Data ${template.unitLabel}`}
          description={`Mulai kelola aset dan skema ${template.billLabel} dengan mendaftarkan nomor unit pertama Anda.`}
          action={
            canWrite ? (
              <button
                type="button"
                onClick={openAdd}
                className="pv-btn-primary text-xs shadow-xs min-h-[44px]"
              >
                <AiOutlinePlus /> Tambah {template.unitLabel}
              </button>
            ) : null
          }
        />
      ) : filteredUnits.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={`Tidak Ditemukan ${template.unitLabel}`}
          description={
            search
              ? `Tidak ada ${template.unitLabel.toLowerCase()} yang cocok dengan "${search}".`
              : `Tidak ada ${template.unitLabel.toLowerCase()} yang sesuai filter aktif.`
          }
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterBlock('');
                setFilterStatus('');
                setCurrentPage(1);
              }}
              className="pv-btn-ghost text-xs min-h-[44px]"
            >
              Reset Filter & Pencarian
            </button>
          }
        />
      ) : (
        <section className="pv-card overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell
                    sortable
                    sorted={sortKey === 'unit' ? sortDirection : null}
                    onSort={() => handleSort('unit')}
                  >
                    {template.unitLabel}
                  </TableHeaderCell>
                  <TableHeaderCell
                    sortable
                    sorted={sortKey === 'owner' ? sortDirection : null}
                    onSort={() => handleSort('owner')}
                  >
                    Penanggung Jawab / Pemilik
                  </TableHeaderCell>
                  <TableHeaderCell
                    sortable
                    sorted={sortKey === 'occupant' ? sortDirection : null}
                    onSort={() => handleSort('occupant')}
                  >
                    {template.memberLabel} Aktif
                  </TableHeaderCell>
                  <TableHeaderCell
                    sortable
                    sorted={sortKey === 'schema' ? sortDirection : null}
                    onSort={() => handleSort('schema')}
                  >
                    Skema {template.billLabel}
                  </TableHeaderCell>
                  <TableHeaderCell
                    className="hidden lg:table-cell"
                    sortable
                    sorted={sortKey === 'floor' ? sortDirection : null}
                    onSort={() => handleSort('floor')}
                  >
                    Detail
                  </TableHeaderCell>
                  <TableHeaderCell
                    sortable
                    sorted={sortKey === 'status' ? sortDirection : null}
                    onSort={() => handleSort('status')}
                  >
                    Status
                  </TableHeaderCell>
                  <TableHeaderCell align="right">Aksi</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedUnits.map((unit) => {
                  const owner = getUnitOwner(unit.id);
                  const occupant = getUnitOccupant(unit.id);
                  const schema = getSchemaById(iplSchemas, unit.ipl_schema_id);
                  return (
                    <TableRow key={unit.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs font-bold">
                            <AiOutlineHome />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900">
                              {unit.block}/{unit.unit_number}
                            </p>
                            <p className="text-[11px] text-slate-400">ID #{unit.id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-800 font-medium">
                        {owner?.full_name || <span className="text-slate-400">Belum ada</span>}
                      </TableCell>
                      <TableCell className="text-slate-800 font-medium">
                        {occupant?.full_name || <span className="text-slate-400">{template.emptyUnitLabel}</span>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-800">
                          {schema?.name || `${template.billLabel} Standar`}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-slate-500">
                        Lt. {unit.floor || '-'} / {unit.size || 0}m²
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                            unit.is_occupied
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                        >
                          {unit.is_occupied ? template.occupiedUnitLabel : template.emptyUnitLabel}
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedUnit(unit)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 pv-focus-ring transition-colors"
                            aria-label={`Lihat detail ${template.unitLabel} ${unit.block}/${unit.unit_number}`}
                            title={`Detail ${template.unitLabel}`}
                          >
                            <AiOutlineEye aria-hidden="true" />
                          </button>
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(unit)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 pv-focus-ring transition-colors"
                                aria-label={`Edit ${template.unitLabel} ${unit.block}/${unit.unit_number}`}
                                title={`Edit ${template.unitLabel}`}
                              >
                                <AiOutlineEdit aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(unit)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-700 pv-focus-ring transition-colors"
                                aria-label={`Hapus atau nonaktifkan ${template.unitLabel} ${unit.block}/${unit.unit_number}`}
                                title={`Nonaktifkan ${template.unitLabel}`}
                              >
                                <AiOutlineDelete aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-slate-100">
            {paginatedUnits.map((unit) => {
              const owner = getUnitOwner(unit.id);
              const occupant = getUnitOccupant(unit.id);
              const schema = getSchemaById(iplSchemas, unit.ipl_schema_id);
              return (
                <div key={unit.id} className="p-4 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                        <AiOutlineHome className="text-base" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">
                          {unit.block}/{unit.unit_number}
                        </p>
                        <p className="text-[11px] text-slate-400">ID #{unit.id} • Lt. {unit.floor || 1}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        unit.is_occupied
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border border-slate-200 bg-slate-100 text-slate-500'
                      }`}
                    >
                      {unit.is_occupied ? template.occupiedUnitLabel : template.emptyUnitLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Penanggung Jawab</span>
                      <span className="font-medium text-slate-800 truncate block">
                        {owner?.full_name || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">{template.memberLabel} Aktif</span>
                      <span className="font-medium text-slate-800 truncate block">
                        {occupant?.full_name || template.emptyUnitLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                      {schema?.name || `${template.billLabel} Standar`}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedUnit(unit)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 pv-focus-ring"
                        aria-label={`Detail ${template.unitLabel} ${unit.block}/${unit.unit_number}`}
                      >
                        <AiOutlineEye className="text-base" />
                      </button>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(unit)}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 pv-focus-ring"
                            aria-label={`Edit ${template.unitLabel} ${unit.block}/${unit.unit_number}`}
                          >
                            <AiOutlineEdit className="text-base" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(unit)}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl p-2 text-rose-600 hover:bg-rose-50 pv-focus-ring"
                            aria-label={`Hapus ${template.unitLabel} ${unit.block}/${unit.unit_number}`}
                          >
                            <AiOutlineDelete className="text-base" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedUnits.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </section>
      )}

      {selectedUnit && (
        <UnitDetailModal
          unit={selectedUnit}
          getUnitOwner={getUnitOwner}
          getUnitOccupant={getUnitOccupant}
          profiles={profiles}
          iplSchemas={iplSchemas}
          token={token}
          role={role}
          template={template}
          activeTenant={activeTenant}
          onClose={() => setSelectedUnit(null)}
          onEdit={() => {
            if (!canWrite) return;
            openEdit(selectedUnit);
            setSelectedUnit(null);
          }}
          onDelete={() => canWrite && handleDelete(selectedUnit)}
          canWrite={canWrite}
        />
      )}

      {formUnit && (
        <UnitFormModal
          unit={formUnit}
          owners={profiles.filter((profile) => profile.role !== 'admin')}
          canEditSchema={canWrite}
          iplSchemas={iplSchemas}
          template={template}
          activeTenant={activeTenant}
          onClose={() => setFormUnit(null)}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const tones = {
    forest: 'bg-slate-100 text-forest-800 border border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200',
    gold: 'bg-amber-50/80 text-amber-800 border border-amber-200',
  };

  return (
    <div className="pv-card p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]} shadow-xs`}>
        <AiOutlineHome className="text-base" />
      </div>
      <p className="mt-3 text-2xl font-extrabold text-slate-900 tracking-tight">{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
    </div>
  );
}

function UnitDetailModal({ unit, getUnitOwner, getUnitOccupant, profiles, iplSchemas, token, role, template, activeTenant, onClose, onEdit, onDelete, canWrite }) {
  const navigate = useNavigate();
  const owner = getUnitOwner(unit.id);
  const occupant = getUnitOccupant(unit.id);
  const relatedProfiles = profiles.filter((profile) => profile.unit_id === unit.id);
  const schema = getSchemaById(iplSchemas, unit.ipl_schema_id);
  const schemaAmount = computeSchemaAmount(schema);

  const [billsCount, setBillsCount] = useState(0);
  const [loadingBills, setLoadingBills] = useState(true);

  const hasAccess = isBendaharaOrAbove(role);

  useEffect(() => {
    if (!token || !hasAccess) {
      setLoadingBills(false);
      return;
    }

    let active = true;
    async function loadBills() {
      setLoadingBills(true);
      try {
        const res = await fetchPayments(token);
        if (!active) return;
        const filtered = res.filter((b) => b.unit_id === unit.id);
        setBillsCount(filtered.length);
      } catch (err) {
        console.warn('Failed to load payments in detail modal:', err);
        if (active) setBillsCount(0);
      } finally {
        if (active) setLoadingBills(false);
      }
    }
    loadBills();
    return () => {
      active = false;
    };
  }, [unit.id, token, role, hasAccess]);

  return (
    <Modal open onClose={onClose} title={`${template?.unitLabel || 'Unit'} ${unit.block}/${unit.unit_number}`}>
      <div className="space-y-3 text-sm">
        <InfoRow label="Penanggung Jawab / Pemilik" value={owner?.full_name || 'Belum ada'} />
        <InfoRow label={`${template?.memberLabel || 'Anggota'} Aktif`} value={occupant?.full_name || template?.emptyUnitLabel || 'Kosong'} />
        <InfoRow label="Status" value={unit.is_occupied ? (template?.occupiedUnitLabel || 'Terisi') : (template?.emptyUnitLabel || 'Kosong / Nonaktif')} />
        <InfoRow
          label={`Skema Biaya ${template?.billLabel || 'IPL'}`}
          value={`${schema?.name || `${template?.billLabel || 'IPL'} Standar`} (${formatRupiah(schemaAmount)}/bln)`}
        />
        <InfoRow label="Lantai" value={unit.floor || '-'} />
        <InfoRow label="Kapasitas / Ukuran" value={`${unit.size || 0}m2`} />
        <InfoRow label={`Relasi ${template?.memberLabel || 'Warga'}`} value={`${relatedProfiles.length} profil`} />
        <InfoRow
          label={`Relasi Tagihan ${template?.billLabel || 'IPL'}`}
          value={
            !hasAccess
              ? 'Terbatas (Akses Bendahara)'
              : loadingBills
              ? 'Memuat...'
              : `${billsCount} tagihan`
          }
        />
        {unit.notes && <InfoRow label="Catatan" value={unit.notes} />}
      </div>

      {!unit.is_occupied && activeTenant?.type === 'kos' && canWrite && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/t/${activeTenant.id}/listings/post?unitId=${unit.id}`);
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-forest-900 shadow-sm hover:bg-gold-600 transition-colors"
          >
            <HiOutlineSparkles className="text-base" /> Iklankan Kamar Ini ke Publik
          </button>
        </div>
      )}

      {canWrite && (
        <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onEdit} className="pv-btn-ghost flex-1 text-xs">
            <AiOutlineEdit /> Edit
          </button>
          <button type="button" onClick={onDelete} className="pv-btn-danger flex-1 text-xs">
            <AiOutlineDelete /> Hapus
          </button>
        </div>
      )}
    </Modal>
  );
}

function UnitFormModal({ unit, owners, canEditSchema, iplSchemas, template, activeTenant, onClose, onSave, isSaving }) {
  const isEdit = Boolean(unit.id);
  const [form, setForm] = useState(unit);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <Modal open onClose={onClose} title={`${isEdit ? 'Edit' : 'Tambah'} ${template?.unitLabel || 'Unit'}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={isSaving} className="space-y-4 border-none p-0 m-0">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Blok / Kategori" required>
              <input
                type="text"
                value={form.block}
                autoCapitalize="characters"
                onChange={(event) => updateField('block', event.target.value)}
                className="pv-input uppercase text-xs"
                placeholder="CB1 / REG / LT1"
                required
              />
            </Field>
            <Field label={`Nomor / Identitas ${template?.unitLabel || 'Unit'}`} required>
              <input
                type="text"
                value={form.unit_number}
                autoCapitalize="characters"
                onChange={(event) => updateField('unit_number', event.target.value)}
                className="pv-input uppercase text-xs"
                placeholder={template?.unitPlaceholder || '01 / 3A'}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lantai">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={form.floor}
                onChange={(event) => updateField('floor', event.target.value)}
                className="pv-input text-xs"
              />
            </Field>
            <Field label="Luas / Kapasitas (m²)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.size}
                onChange={(event) => updateField('size', event.target.value)}
                className="pv-input text-xs"
              />
            </Field>
          </div>

          <Field label="Penanggung Jawab / Pemilik">
            <select
              value={form.owner_id || ''}
              onChange={(event) => updateField('owner_id', event.target.value)}
              className="pv-input"
            >
              <option value="">Belum ada penanggung jawab</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.full_name}
                </option>
              ))}
            </select>
          </Field>

          {/* Pilihan Profil Skema Biaya */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <Field label={`Profil Skema Biaya ${template?.billLabel || 'IPL'}`}>
              <select
                value={form.ipl_schema_id || 'schema-basic'}
                onChange={(event) => updateField('ipl_schema_id', event.target.value)}
                disabled={!canEditSchema}
                className="pv-input disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
              >
                {iplSchemas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — ({formatRupiah(computeSchemaAmount(s))} / bln)
                  </option>
                ))}
              </select>
            </Field>
            {!canEditSchema ? (
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
                <span>🔒</span>
                <span>Hak akses ubah skema {template?.billLabel || 'IPL'} dibatasi khusus untuk <b>Bendahara & Admin</b>.</span>
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">
                Menentukan besaran tarif bulanan yang dibebankan kepada {template?.unitLabel?.toLowerCase() || 'unit'} ini.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-sm hover:bg-slate-50 cursor-pointer transition">
            <input
              type="checkbox"
              checked={Boolean(form.is_occupied)}
              onChange={(event) => {
                const checked = event.target.checked;
                updateField('is_occupied', checked);
                if (canEditSchema) {
                  updateField('ipl_schema_id', checked ? 'schema-komplit' : 'schema-basic');
                }
              }}
              className="mt-1 accent-gold-500"
            />
            <span>
              <span className="font-semibold text-slate-800">{template?.unitLabel || 'Unit'} sedang terisi ({template?.occupiedUnitLabel || 'Terdaftar'})</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Matikan jika {template?.unitLabel?.toLowerCase() || 'unit'} kosong atau belum ada {template?.memberLabel?.toLowerCase() || 'anggota'}. {canEditSchema ? `Otomatis menyesuaikan skema ${template?.billLabel || 'IPL'} di atas.` : ''}
              </span>
            </span>
          </label>

          <Field label="Catatan">
            <textarea
              value={form.notes || ''}
              onChange={(event) => updateField('notes', event.target.value)}
              className="pv-input min-h-24 resize-y"
              placeholder={`Contoh: posisi ${template?.unitLabel?.toLowerCase() || 'unit'}, status fasilitas, atau catatan pengelola.`}
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="pv-btn-ghost flex-1 text-sm">
              Batal
            </button>
            <button type="submit" disabled={isSaving} className="pv-btn-primary flex-1 text-sm flex items-center justify-center gap-2">
              {isSaving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : `Tambah ${template?.unitLabel || 'Unit'}`}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-500 text-xs font-medium">{label}</span>
      <span className="text-right font-semibold text-slate-900 text-xs">{value}</span>
    </div>
  );
}

