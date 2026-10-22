import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineCalendar,
  AiOutlineArrowRight,
  AiOutlineReload,
  AiOutlineWallet,
  AiOutlineInbox,
} from 'react-icons/ai';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchPrograms,
  fetchBudgetItems,
  fetchProgramTransactions,
  summarizeProgram,
  PROGRAM_STATUS_LABELS,
} from '../../services/tenantOperationalService';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import { STATUS_BADGE_CLASSES } from '../../pages/tenant/Programs';

export function PanitiaDashboard({
  tenantId,
  activeTenant,
  template,
}) {
  const navigate = useNavigate();
  const tenantAccess = useTenantAccess();
  const { canTransact } = useSubscriptionGate();

  const tid = activeTenant?.id || tenantId;

  const canManagePrograms = Boolean(tenantAccess.canManagePrograms && canTransact);
  const canRecordIncome = Boolean(tenantAccess.canRecordIncome && canTransact);
  const canRecordExpense = Boolean(tenantAccess.canManageExpenses && canTransact);

  const [programs, setPrograms] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadData = useCallback(async () => {
    if (!tid) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const allPrograms = await fetchPrograms(tid);
      setPrograms(allPrograms || []);

      const activeList = (allPrograms || []).filter(
        (p) => p && (p.status === 'planning' || p.status === 'running')
      );

      const sumMap = {};
      await Promise.all(
        activeList.map(async (p) => {
          try {
            const [budgetItems, trans] = await Promise.all([
              fetchBudgetItems(tid, p.id).catch(() => []),
              fetchProgramTransactions(tid, p.id).catch(() => ({ incomes: [], expenses: [] })),
            ]);
            sumMap[p.id] = summarizeProgram(budgetItems, trans.incomes, trans.expenses);
          } catch (_err) {
            sumMap[p.id] = summarizeProgram([], [], []);
          }
        })
      );
      setSummaries(sumMap);
    } catch (err) {
      console.error('Gagal memuat acara:', err);
      setLoadError('Gagal memuat acara.');
    } finally {
      setIsLoading(false);
    }
  }, [tid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activePrograms = useMemo(() => {
    return programs.filter(
      (p) => p && (p.status === 'planning' || p.status === 'running')
    );
  }, [programs]);

  return (
    <div className="space-y-6">
      {/* ── Quick Actions ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Aksi Cepat Kepanitiaan</h2>
          <p className="text-xs text-slate-500">
            Akses langsung untuk mengelola kegiatan dan keuangan organisasi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManagePrograms && (
            <button
              type="button"
              onClick={() => navigate(`/t/${tid}/programs`)}
              className="pv-button-primary flex items-center gap-1.5 text-xs"
            >
              <AiOutlinePlus className="w-3.5 h-3.5" />
              <span>Buat Acara</span>
            </button>
          )}
          {canRecordIncome && (
            <button
              type="button"
              onClick={() => navigate(`/t/${tid}/incomes?new=1`)}
              className="pv-button-secondary flex items-center gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            >
              <AiOutlineWallet className="w-3.5 h-3.5" />
              <span>Catat Pemasukan</span>
            </button>
          )}
          {canRecordExpense && (
            <button
              type="button"
              onClick={() => navigate(`/t/${tid}/expenses?new=1`)}
              className="pv-button-secondary flex items-center gap-1.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              <AiOutlineWallet className="w-3.5 h-3.5" />
              <span>Catat Pengeluaran</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Active Programs Section ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎪</span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Acara &amp; Kegiatan Aktif
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-600">
              {activePrograms.length}
            </span>
          </div>
          <Link
            to={`/t/${tid}/programs`}
            className="text-xs font-semibold text-forest-700 hover:text-forest-800 transition flex items-center gap-1"
          >
            <span>Semua Acara</span>
            <AiOutlineArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-white rounded-2xl border border-slate-200 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="h-8 bg-slate-50 rounded" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-200 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="h-8 bg-slate-50 rounded" />
            </div>
          </div>
        ) : loadError ? (
          <div className="p-8 bg-white rounded-2xl border border-rose-200 text-center space-y-3">
            <p className="text-sm font-bold text-rose-700">Gagal memuat acara.</p>
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
        ) : activePrograms.length === 0 ? (
          /* Empty state */
          <div className="p-8 bg-white rounded-2xl border border-slate-200/80 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl">
              <AiOutlineInbox />
            </div>
            {canManagePrograms ? (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">Buat Acara Pertama</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Belum ada acara aktif. Rencanakan kegiatan pentas seni, lomba, atau perayaan untuk organisasi Anda sekarang.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/t/${tid}/programs`)}
                    className="pv-button-primary inline-flex items-center gap-1.5 text-xs"
                  >
                    <AiOutlinePlus className="w-3.5 h-3.5" />
                    <span>Buat Acara Baru</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Belum ada acara</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Saat ini belum ada acara atau kegiatan yang sedang berlangsung di organisasi ini.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePrograms.map((prog) => {
              const summary = summaries[prog.id] || {
                planned: { expense: 0, income: 0, balance: 0 },
                actual: { expense: 0, income: 0, balance: 0 },
              };

              const plannedExp = summary.planned?.expense || 0;
              const actualExp = summary.actual?.expense || 0;
              const balance = summary.actual?.balance || 0;

              const percent = plannedExp > 0
                ? Math.round((actualExp / plannedExp) * 100)
                : actualExp > 0 ? 100 : 0;
              const isOver = plannedExp > 0 && actualExp > plannedExp;

              return (
                <div
                  key={prog.id}
                  onClick={() => navigate(`/t/${tid}/programs/${prog.id}`)}
                  className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-forest-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-2 mb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-forest-700 transition-colors line-clamp-1">
                        {prog.name}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${
                          STATUS_BADGE_CLASSES[prog.status] || STATUS_BADGE_CLASSES.planning
                        }`}
                      >
                        {PROGRAM_STATUS_LABELS[prog.status] || prog.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <AiOutlineCalendar className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {prog.starts_on
                          ? `${formatDate(prog.starts_on)}${prog.ends_on ? ` - ${formatDate(prog.ends_on)}` : ''}`
                          : 'Jadwal belum ditentukan'}
                      </span>
                    </div>
                  </div>

                  {/* Summary Keuangan */}
                  <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Pengeluaran:</span>
                      <span className="font-semibold text-slate-900">
                        {formatRupiah(actualExp)} / {formatRupiah(plannedExp)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOver ? 'bg-rose-500' : 'bg-forest-600'
                        }`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Saldo ({percent}% RAB):</span>
                      <span
                        className={`font-bold ${
                          balance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatRupiah(balance)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default PanitiaDashboard;
