import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineCalendar,
  AiOutlineUser,
  AiOutlineEnvironment,
  AiOutlineArrowRight,
  AiOutlineReload,
} from 'react-icons/ai';
import { useTenant } from '../../context/TenantContext';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/Modal';
import { EmptyState, SkeletonCard } from '../../components/ui';
import {
  fetchPrograms,
  createProgram,
  fetchBudgetItems,
  fetchProgramTransactions,
  summarizeProgram,
  fetchTenantMembers,
  PROGRAM_STATUS_LABELS,
} from '../../services/tenantOperationalService';
import { formatRupiah, formatDate } from '../../services/dataHelpers';

export const STATUS_BADGE_CLASSES = {
  planning: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  running: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  completed: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  done: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  archived: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
};

export default function Programs() {
  const { tenantId: routeTenantId } = useParams();
  const { activeTenant } = useTenant();
  const tenantId = routeTenantId || activeTenant?.id;
  const navigate = useNavigate();

  const tenantAccess = useTenantAccess();
  const { canTransact } = useSubscriptionGate();
  const toast = useToast();

  const canManage = Boolean(tenantAccess.canManagePrograms && canTransact);

  const [programs, setPrograms] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [members, setMembers] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed' | 'archived'
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Modal Create Program
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    startsOn: '',
    endsOn: '',
    leadMemberId: '',
    status: 'planning',
  });

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [programsData, membersData] = await Promise.all([
        fetchPrograms(tenantId),
        fetchTenantMembers(tenantId).catch(() => []),
      ]);

      setPrograms(programsData || []);
      setMembers(membersData || []);

      // Ambil ringkasan keuangan untuk tiap acara
      const sumMap = {};
      if (Array.isArray(programsData) && programsData.length > 0) {
        await Promise.all(
          programsData.map(async (p) => {
            try {
              const [budgetItems, trans] = await Promise.all([
                fetchBudgetItems(tenantId, p.id).catch(() => []),
                fetchProgramTransactions(tenantId, p.id).catch(() => ({ incomes: [], expenses: [] })),
              ]);
              sumMap[p.id] = summarizeProgram(budgetItems, trans.incomes, trans.expenses);
            } catch (_err) {
              sumMap[p.id] = summarizeProgram([], [], []);
            }
          })
        );
      }
      setSummaries(sumMap);
    } catch (err) {
      console.error('Gagal memuat acara:', err);
      setLoadError('Gagal memuat acara.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tab grouping
  const { activePrograms, completedPrograms, archivedPrograms } = useMemo(() => {
    const active = [];
    const completed = [];
    const archived = [];

    programs.forEach((p) => {
      const st = p.status;
      if (st === 'planning' || st === 'running') {
        active.push(p);
      } else if (st === 'completed' || st === 'done') {
        completed.push(p);
      } else if (st === 'archived') {
        archived.push(p);
      } else {
        active.push(p);
      }
    });

    return {
      activePrograms: active,
      completedPrograms: completed,
      archivedPrograms: archived,
    };
  }, [programs]);

  const displayedPrograms = useMemo(() => {
    if (activeTab === 'completed') return completedPrograms;
    if (activeTab === 'archived') return archivedPrograms;
    return activePrograms;
  }, [activeTab, activePrograms, completedPrograms, archivedPrograms]);

  // Filter approved members for lead member selection
  const approvedMembers = useMemo(() => {
    if (!Array.isArray(members)) return [];
    return members.filter((m) => !m.status || m.status === 'approved');
  }, [members]);

  const handleOpenCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      location: '',
      startsOn: '',
      endsOn: '',
      leadMemberId: '',
      status: 'planning',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
  };

  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nama acara wajib diisi.');
      return;
    }
    if (formData.startsOn && formData.endsOn && formData.endsOn < formData.startsOn) {
      toast.error('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createProgram(tenantId, {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        location: formData.location.trim() || null,
        startsOn: formData.startsOn || null,
        endsOn: formData.endsOn || null,
        leadMemberId: formData.leadMemberId || null,
        status: formData.status || 'planning',
      });
      toast.success('Acara berhasil dibuat.');
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Gagal membuat acara.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Daftar Acara & Kegiatan</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kelola perencanaan, anggaran (RAB), dan realisasi pengeluaran kepanitiaan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Muat ulang"
          >
            <AiOutlineReload className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="pv-button-primary flex items-center gap-2"
            >
              <AiOutlinePlus className="w-4 h-4" />
              <span>Buat Acara</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`py-2.5 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'active'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Aktif</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {activePrograms.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`py-2.5 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'completed'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Selesai</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {completedPrograms.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          className={`py-2.5 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'archived'
              ? 'border-forest-600 text-forest-700 dark:text-forest-400 dark:border-forest-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <span>Arsip</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {archivedPrograms.length}
          </span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : loadError ? (
        <div className="p-8 rounded-2xl bg-white border border-rose-200 text-center space-y-3">
          <p className="font-bold text-sm text-rose-700">Gagal memuat acara.</p>
          <div>
            <button
              type="button"
              onClick={loadData}
              className="pv-button-secondary text-xs inline-flex items-center gap-1.5"
            >
              <AiOutlineReload className="w-3.5 h-3.5" />
              <span>Coba lagi</span>
            </button>
          </div>
        </div>
      ) : displayedPrograms.length === 0 ? (
        <EmptyState
          title={`Tidak ada acara ${activeTab === 'active' ? 'aktif' : activeTab === 'completed' ? 'selesai' : 'diarsipkan'}`}
          description={
            canManage
              ? 'Mulai rencanakan kegiatan atau acara baru untuk organisasi Anda.'
              : 'Belum ada data acara pada kategori ini.'
          }
          actionLabel={canManage && activeTab === 'active' ? 'Buat Acara Baru' : undefined}
          onAction={canManage && activeTab === 'active' ? handleOpenCreateModal : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedPrograms.map((prog) => {
            const summary = summaries[prog.id] || {
              planned: { expense: 0, income: 0, balance: 0 },
              actual: { expense: 0, income: 0, balance: 0 },
            };

            const plannedExp = summary.planned.expense || 0;
            const actualExp = summary.actual.expense || 0;
            const balance = summary.actual.balance || 0;

            const percent = plannedExp > 0
              ? Math.round((actualExp / plannedExp) * 100)
              : actualExp > 0 ? 100 : 0;
            const isOverBudget = plannedExp > 0 && actualExp > plannedExp;

            const leadName = prog.lead_member?.name || prog.lead_member?.full_name || '-';

            return (
              <div
                key={prog.id}
                onClick={() => navigate(`/t/${tenantId}/programs/${prog.id}`)}
                className="pv-card hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group border border-slate-200 dark:border-slate-800 hover:border-forest-500 dark:hover:border-forest-500"
              >
                <div>
                  {/* Top Bar: Title & Status */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white group-hover:text-forest-700 dark:group-hover:text-forest-400 transition-colors line-clamp-1">
                      {prog.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${
                        STATUS_BADGE_CLASSES[prog.status] || STATUS_BADGE_CLASSES.planning
                      }`}
                    >
                      {PROGRAM_STATUS_LABELS[prog.status] || prog.status}
                    </span>
                  </div>

                  {prog.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                      {prog.description}
                    </p>
                  )}

                  {/* Info Meta */}
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 mb-4">
                    <div className="flex items-center gap-2">
                      <AiOutlineCalendar className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        {prog.starts_on
                          ? `${formatDate(prog.starts_on)}${prog.ends_on ? ` - ${formatDate(prog.ends_on)}` : ''}`
                          : 'Jadwal belum ditentukan'}
                      </span>
                    </div>
                    {prog.location && (
                      <div className="flex items-center gap-2">
                        <AiOutlineEnvironment className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="line-clamp-1">{prog.location}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <AiOutlineUser className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Ketua: {leadName}</span>
                    </div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Pengeluaran:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {formatRupiah(actualExp)} / {formatRupiah(plannedExp)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        isOverBudget
                          ? 'bg-rose-500'
                          : percent > 80
                          ? 'bg-amber-500'
                          : 'bg-forest-600'
                      }`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Saldo ({percent}% RAB):
                    </span>
                    <span
                      className={`font-semibold ${
                        balance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatRupiah(balance)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-end text-xs font-medium text-forest-700 dark:text-forest-400 group-hover:translate-x-1 transition-transform">
                    <span>Detail Acara</span>
                    <AiOutlineArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Buat Acara */}
      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title="Buat Acara Baru"
        size="md"
      >
        <form onSubmit={handleSubmitCreate} className="space-y-4">
          <div>
            <label htmlFor="program-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Acara <span className="text-rose-500">*</span>
            </label>
            <input
              id="program-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: Pentas Seni 2026 / Perayaan 17-an"
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="program-description" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Deskripsi
            </label>
            <textarea
              id="program-description"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Keterangan singkat tentang kegiatan acara..."
              className="pv-input w-full"
            />
          </div>

          <div>
            <label htmlFor="program-location" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lokasi Acara
            </label>
            <input
              id="program-location"
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Contoh: Aula Serbaguna, Lapangan Utama"
              className="pv-input w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="program-starts-on" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Mulai
              </label>
              <input
                id="program-starts-on"
                type="date"
                value={formData.startsOn}
                onChange={(e) => setFormData({ ...formData, startsOn: e.target.value })}
                className="pv-input w-full"
              />
            </div>
            <div>
              <label htmlFor="program-ends-on" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Selesai
              </label>
              <input
                id="program-ends-on"
                type="date"
                value={formData.endsOn}
                onChange={(e) => setFormData({ ...formData, endsOn: e.target.value })}
                className="pv-input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="program-lead-member" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ketua Acara
              </label>
              <select
                id="program-lead-member"
                value={formData.leadMemberId}
                onChange={(e) => setFormData({ ...formData, leadMemberId: e.target.value })}
                className="pv-select w-full"
              >
                <option value="">-- Pilih Ketua Acara --</option>
                {approvedMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.name || `Anggota (${m.id.slice(0, 6)})`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="program-status" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                id="program-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="pv-select w-full"
              >
                <option value="planning">Perencanaan</option>
                <option value="running">Berjalan</option>
                <option value="done">Selesai</option>
                <option value="archived">Arsip</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={isSubmitting}
              className="pv-button-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="pv-button-primary"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Acara'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
