import { useMemo, useState, useEffect, useCallback } from 'react';
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
import { EmptyState, SkeletonTable } from '../components/ui';
import {
  fetchUnits,
  upsertUnit,
  fetchResidents,
  fetchPayments,
  fetchIPLSchemas,
} from '../services/dataService';
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
  const { activeTenant } = useTenant();
  const template = useTenantTemplate();
  const isRtRw = !activeTenant?.type || activeTenant?.type === 'rt_rw';
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
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [formUnit, setFormUnit] = useState(null);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resUnits, resProfiles, resSchemas] = await Promise.all([
        fetchUnits(token).catch((err) => {
          console.error('Failed to fetch units:', err);
          return [];
        }),
        fetchResidents(token).catch((err) => {
          console.error('Failed to fetch residents:', err);
          return [];
        }),
        fetchIPLSchemas(token).catch((err) => {
          console.warn('Failed to fetch IPL schemas; using defaults:', err);
          return DEFAULT_IPL_SCHEMAS;
        }),
      ]);
      setUnits(resUnits || []);
      setProfiles(resProfiles || []);
      setIplSchemas(resSchemas && resSchemas.length > 0 ? resSchemas : DEFAULT_IPL_SCHEMAS);
    } catch (err) {
      toast.error(`Gagal memuat data master ${template.unitLabel.toLowerCase()}.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [token, toast, template.unitLabel]);

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
    () => [...new Set(units.map((unit) => unit.block))].sort(),
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

      {isRtRw ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div data-tour="houses-mapsite" className="pv-card overflow-hidden">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Mapsite Palm Village</h3>
                  <p className="text-[11px] text-slate-500">
                    Referensi visual blok CB1, CB2, CB3, CB4.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="/Site Plan Update 2.pdf"
                    download="Site Plan Palm Village.pdf"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
                    title="Unduh file Site Plan PDF"
                  >
                    <AiOutlineDownload className="text-sm text-slate-500" /> Unduh PDF
                  </a>
                  <button
                    type="button"
                    onClick={openMapPreview}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-forest-800 hover:bg-slate-50 shadow-xs transition-colors"
                  >
                    <AiOutlineEye /> Perbesar
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white p-3">
              <img
                src="/Mapsite%20Palm%20Village.png"
                alt="Mapsite Palm Village"
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

      {isRtRw && (
        <Modal open={isMapPreviewOpen} onClose={closeMapPreview} title="Mapsite Palm Village" size="xl">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-slate-500">
                Preview peta perumahan untuk referensi blok dan posisi rumah.
              </p>
              <a
                href="/Site Plan Update 2.pdf"
                download="Site Plan Palm Village.pdf"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-forest-800 px-3 py-1.5 text-xs font-semibold text-gold-400 hover:bg-forest-900 shadow-xs transition-colors shrink-0"
              >
                <AiOutlineDownload className="text-sm" /> Unduh PDF Asli
              </a>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2">
              <img
                src="/Mapsite%20Palm%20Village.png"
                alt="Mapsite Palm Village versi besar"
                className="w-full h-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </Modal>
      )}

      <section className="pv-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <AiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pv-input pl-9"
              placeholder={`Cari ${template.unitLabel.toLowerCase()}, penanggung jawab, ${template.memberLabel.toLowerCase()}...`}
            />
          </div>
          <select
            value={filterBlock}
            onChange={(event) => setFilterBlock(event.target.value)}
            className="pv-input"
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
            onChange={(event) => setFilterStatus(event.target.value)}
            className="pv-input"
          >
            <option value="">Semua Status</option>
            <option value="occupied">{template.occupiedUnitLabel}</option>
            <option value="vacant">{template.emptyUnitLabel}</option>
          </select>
        </div>
      </section>

      {isLoading ? (
        <SkeletonTable cols={7} rows={6} />
      ) : filteredUnits.length === 0 ? (
        <EmptyState
          icon="🏡"
          title={
            search || filterStatus !== 'all'
              ? `Tidak Ditemukan ${template.unitLabel}`
              : `Belum Ada Data ${template.unitLabel}`
          }
          description={
            search || filterStatus !== 'all'
              ? `Tidak ada data ${template.unitLabel.toLowerCase()} yang sesuai dengan filter pencarian blok atau status hunian.`
              : `Mulai kelola aset dan skema ${template.billLabel} dengan mendaftarkan nomor unit pertama Anda.`
          }
          action={
            search || filterStatus !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterStatus('all');
                }}
                className="pv-btn-ghost text-xs shadow-2xs"
              >
                Reset Filter & Pencarian
              </button>
            ) : canWrite ? (
              <button
                type="button"
                onClick={openAdd}
                className="pv-btn-primary text-xs shadow-xs"
              >
                <AiOutlinePlus /> Tambah {template.unitLabel}
              </button>
            ) : null
          }
        />
      ) : (
        <section className="pv-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-left">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">{template.unitLabel}</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Penanggung Jawab / Pemilik</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">{template.memberLabel} Aktif</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Skema {template.billLabel}</th>
                  <th className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 md:table-cell">Detail</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-700">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUnits.map((unit) => {
                  const owner = getUnitOwner(unit.id);
                  const occupant = getUnitOccupant(unit.id);
                  const schema = getSchemaById(iplSchemas, unit.ipl_schema_id);
                  return (
                    <tr key={unit.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-forest-800 border border-slate-200 shadow-xs font-bold">
                            <AiOutlineHome />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900">
                              {unit.block}/{unit.unit_number}
                            </p>
                            <p className="text-[11px] text-slate-400">ID #{unit.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {owner?.full_name || <span className="text-slate-400">Belum ada</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {occupant?.full_name || <span className="text-slate-400">{template.emptyUnitLabel}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-800">
                          {schema?.name || `${template.billLabel} Standar`}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                        Lt. {unit.floor || '-'} / {unit.size || 0}m2
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`pv-badge ${
                            unit.is_occupied
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                        >
                          {unit.is_occupied ? template.occupiedUnitLabel : template.emptyUnitLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedUnit(unit)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            aria-label={`Lihat detail ${template.unitLabel.toLowerCase()}`}
                            title={`Detail ${template.unitLabel}`}
                          >
                            <AiOutlineEye />
                          </button>
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(unit)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                aria-label={`Edit ${template.unitLabel.toLowerCase()}`}
                                title={`Edit ${template.unitLabel}`}
                              >
                                <AiOutlineEdit />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(unit)}
                                className="rounded-lg p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                aria-label={`Hapus atau nonaktifkan ${template.unitLabel.toLowerCase()}`}
                                title={`Nonaktifkan ${template.unitLabel}`}
                              >
                                <AiOutlineDelete />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

