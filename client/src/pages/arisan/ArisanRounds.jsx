import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineTrophy,
  AiOutlineCalendar,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineUser,
  AiOutlineArrowRight,
  AiOutlineDollarCircle,
  AiOutlineTeam,
  AiOutlineReload,
  AiOutlineFilter,
  AiOutlineInfoCircle,
  AiOutlineWarning,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchArisanRounds,
  createArisanRound,
  fetchArisanParticipants,
  generateArisanRoundBills,
  fetchArisanRoundBills,
  payArisanBillManual,
  startNewArisanCycle,
} from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';
import Modal from '../../components/Modal';

const STATUS_BADGES = {
  collecting: {
    label: 'Pengumpulan Iuran',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon: AiOutlineClockCircle,
  },
  ready_to_draw: {
    label: 'Siap Dikocok',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: AiOutlineCheckCircle,
  },
  drawn: {
    label: 'Pemenang Terpilih',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    icon: AiOutlineTrophy,
  },
  cancelled: {
    label: 'Dibatalkan',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    icon: AiOutlineWarning,
  },
};

export default function ArisanRounds() {
  const { tenantId: routeTenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { activeTenant, activeTenantId, isTenantAdmin } = useTenant();
  const { isReadOnly, bannerText } = useSubscriptionGate();

  const tenantId = routeTenantId || activeTenantId;

  const [rounds, setRounds] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal Tambah Putaran
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoundPeriod, setNewRoundPeriod] = useState('');
  const [newRoundPool, setNewRoundPool] = useState('');
  const [newRoundNotes, setNewRoundNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal Rincian Iuran Peserta Putaran
  const [selectedRoundForBills, setSelectedRoundForBills] = useState(null);
  const [roundBills, setRoundBills] = useState([]);
  const [loadingRoundBills, setLoadingRoundBills] = useState(false);
  const [generatingBills, setGeneratingBills] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [isResetCycleModalOpen, setIsResetCycleModalOpen] = useState(false);
  const [resettingCycle, setResettingCycle] = useState(false);

  // Load Data Putaran & Peserta
  const loadData = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [roundsData, participantsData] = await Promise.all([
        fetchArisanRounds(tenantId),
        fetchArisanParticipants(tenantId),
      ]);
      setRounds(roundsData || []);
      setParticipants(participantsData || []);
    } catch (err) {
      console.error('[ArisanRounds] Gagal memuat data arisan:', err);
      toast.error('Gagal memuat daftar putaran arisan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  // Nomor putaran berikutnya
  const nextRoundNumber = useMemo(() => {
    if (!rounds.length) return 1;
    const maxNumber = Math.max(...rounds.map((r) => r.round_number || 0));
    return maxNumber + 1;
  }, [rounds]);

  // Default target pool dari settings arisan
  const defaultPrizeAmount = useMemo(() => {
    return (
      activeTenant?.settings?.total_prize_per_round ||
      (activeTenant?.settings?.slot_count || 10) *
        (activeTenant?.settings?.contribution_amount || 300000)
    );
  }, [activeTenant]);

  // Statistik Cepat
  const stats = useMemo(() => {
    const totalRounds = rounds.length;
    const drawnCount = rounds.filter((r) => r.status === 'drawn').length;
    const activeRound = rounds.find(
      (r) => r.status === 'collecting' || r.status === 'ready_to_draw'
    );
    const totalWinners = participants.filter((p) => p.has_won).length;
    const totalParticipants = participants.length;

    return {
      totalRounds,
      drawnCount,
      activeRound,
      totalWinners,
      totalParticipants,
    };
  }, [rounds, participants]);

  // Filter putaran
  const filteredRounds = useMemo(() => {
    if (filterStatus === 'all') return rounds;
    return rounds.filter((r) => r.status === filterStatus);
  }, [rounds, filterStatus]);

  // Buka Modal Buat Putaran
  const handleOpenCreateModal = () => {
    if (isReadOnly) {
      toast.error('Layanan dalam status Read-Only. Perpanjang langganan untuk menambah putaran.');
      return;
    }
    const defaultPeriodName = `Putaran #${nextRoundNumber}`;
    setNewRoundPeriod(defaultPeriodName);
    setNewRoundPool(defaultPrizeAmount);
    setNewRoundNotes('');
    setIsCreateModalOpen(true);
  };

  // Submit Buat Putaran
  const handleCreateRound = async (e) => {
    e.preventDefault();
    if (!newRoundPeriod.trim()) {
      toast.error('Nama periode putaran wajib diisi.');
      return;
    }

    try {
      setSubmitting(true);
      await createArisanRound(tenantId, {
        round_number: nextRoundNumber,
        period: newRoundPeriod.trim(),
        total_pool_amount: parseFloat(newRoundPool) || defaultPrizeAmount,
        notes: newRoundNotes.trim(),
        status: 'collecting',
      });

      toast.success(`Putaran #${nextRoundNumber} berhasil dibuat!`);
      setIsCreateModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('[ArisanRounds] Gagal membuat putaran:', err);
      toast.error(err.message || 'Gagal membuat putaran baru.');
    } finally {
      setSubmitting(false);
    }
  };

  // Buka rincian iuran peserta
  const handleOpenRoundBills = async (round) => {
    setSelectedRoundForBills(round);
    setLoadingRoundBills(true);
    try {
      const bills = await fetchArisanRoundBills(tenantId, round.id, round.period);
      setRoundBills(bills || []);
    } catch (err) {
      console.error('[ArisanRounds] Gagal memuat tagihan peserta:', err);
      toast.error('Gagal memuat rincian iuran peserta.');
    } finally {
      setLoadingRoundBills(false);
    }
  };

  // Terbitkan tagihan iuran serentak untuk putaran
  const handleGenerateBills = async (round) => {
    if (isReadOnly) {
      toast.error('Layanan dalam status Read-Only.');
      return;
    }
    setGeneratingBills(true);
    try {
      const res = await generateArisanRoundBills(tenantId, round.id);
      toast.success(
        `Iuran diterbitkan untuk ${res.total_generated} peserta (${res.total_skipped} sudah memiliki tagihan).`
      );
      await loadData();
      if (selectedRoundForBills?.id === round.id) {
        await handleOpenRoundBills(round);
      }
    } catch (err) {
      console.error('[ArisanRounds] Gagal menerbitkan tagihan:', err);
      toast.error(err.message || 'Gagal menerbitkan tagihan iuran.');
    } finally {
      setGeneratingBills(false);
    }
  };

  // Tandai iuran lunas secara manual oleh admin
  const handleMarkPaid = async (billId) => {
    if (isReadOnly) {
      toast.error('Layanan dalam status Read-Only.');
      return;
    }
    setMarkingPaidId(billId);
    try {
      await payArisanBillManual(tenantId, billId);
      toast.success('Iuran peserta berhasil ditandai lunas!');
      if (selectedRoundForBills) {
        await handleOpenRoundBills(selectedRoundForBills);
      }
      await loadData();
    } catch (err) {
      console.error('[ArisanRounds] Gagal verifikasi pembayaran:', err);
      toast.error(err.message || 'Gagal memperbarui status pembayaran.');
    } finally {
      setMarkingPaidId(null);
    }
  };

  // Handler Mulai Siklus Baru
  const handleConfirmResetCycle = async (force = false) => {
    if (isReadOnly) {
      toast.warning(bannerText || 'Fitur dinonaktifkan dalam status langganan read-only.');
      return;
    }
    if (!isTenantAdmin) {
      toast.error('Hanya Admin Arisan yang berwenang memulai siklus baru.');
      return;
    }

    try {
      setResettingCycle(true);
      const res = await startNewArisanCycle(tenantId, user?.id, force);
      toast.success(`Siklus baru #${res.new_cycle || ''} berhasil dimulai! Status seluruh peserta telah direset.`);
      setIsResetCycleModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('[ArisanRounds] Gagal memulai siklus baru:', err);
      toast.error(err.message || 'Gagal memulai siklus arisan baru.');
    } finally {
      setResettingCycle(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Banner Langganan Read-Only jika aktif */}
        {isReadOnly && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-800 shadow-xs">
            <div className="flex items-center gap-2">
              <AiOutlineWarning className="text-base text-rose-600 flex-shrink-0" />
              <span>{bannerText || 'Layanan dalam mode Read-Only. Fitur pembuatan putaran dan pengocokan dibatasi.'}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/account/subscription')}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-[11px] whitespace-nowrap shadow-xs"
            >
              Perpanjang
            </button>
          </div>
        )}

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🎲</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                Putaran &amp; Pengocokan Arisan
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              Pantau jadwal putaran, progres pengumpulan iuran peserta, dan riwayat pemenang secara transparan.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-xs"
              title="Segarkan Data"
            >
              <AiOutlineReload className={loading ? 'animate-spin' : ''} />
            </button>

            {isTenantAdmin && (
              <>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setIsResetCycleModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold text-xs transition-colors disabled:opacity-50 shadow-xs"
                  title="Mulai Siklus Baru Arisan (Reset Peserta)"
                >
                  <AiOutlineReload />
                  <span className="hidden sm:inline">Siklus Baru</span>
                </button>

                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  <AiOutlinePlus />
                  <span>+ Buat Putaran Baru</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Banner Siklus Arisan Lengkap */}
        {participants.length > 0 && stats.totalWinners >= stats.totalParticipants && (
          <div className="p-4 sm:p-5 rounded-2xl bg-purple-50 border border-purple-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 border border-purple-200 flex items-center justify-center text-xl shrink-0">
                🏆
              </div>
              <div>
                <h4 className="text-sm font-bold text-purple-900">
                  Siklus Putaran Arisan Telah Selesai 100%!
                </h4>
                <p className="text-xs text-purple-700">
                  Seluruh peserta ({stats.totalParticipants} slot) telah memenangkan undian. Pengurus dapat memulai siklus baru.
                </p>
              </div>
            </div>

            {isTenantAdmin && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setIsResetCycleModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 transition-all disabled:opacity-50"
              >
                <AiOutlineReload />
                <span>Mulai Siklus Baru</span>
              </button>
            )}
          </div>
        )}

        {/* 4 Kartu Metrik Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Putaran Aktif */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center text-xl shadow-xs">
              <AiOutlineCalendar />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                Putaran Berjalan
              </span>
              <span className="text-base sm:text-lg font-extrabold text-slate-900 font-display">
                {stats.activeRound ? `Putaran #${stats.activeRound.round_number}` : 'Semua Selesai'}
              </span>
            </div>
          </div>

          {/* Card 2: Status Pengocokan */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center text-xl shadow-xs">
              <AiOutlineTrophy />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                Pemenang Terpilih
              </span>
              <span className="text-base sm:text-lg font-extrabold text-slate-900 font-display">
                {stats.drawnCount} Putaran
              </span>
            </div>
          </div>

          {/* Card 3: Progres Siklus Peserta */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-xl shadow-xs">
              <AiOutlineTeam />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                Giliran Pemenang
              </span>
              <span className="text-base sm:text-lg font-extrabold text-slate-900 font-display">
                {stats.totalWinners} / {stats.totalParticipants || activeTenant?.settings?.slot_count || 0} Slot
              </span>
            </div>
          </div>

          {/* Card 4: Total Hadiah per Putaran */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center text-xl shadow-xs">
              <AiOutlineDollarCircle />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                Total Hadiah / Putaran
              </span>
              <span className="text-base sm:text-lg font-extrabold text-amber-800 font-display">
                {formatRupiah(defaultPrizeAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Filter Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { id: 'all', label: 'Semua Putaran' },
            { id: 'collecting', label: 'Pengumpulan Iuran' },
            { id: 'ready_to_draw', label: 'Siap Dikocok' },
            { id: 'drawn', label: 'Sudah Dikocok' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shadow-xs ${
                filterStatus === tab.id
                  ? 'bg-purple-50 border-purple-300 text-purple-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-purple-700 animate-spin mx-auto mb-3" />
            <span className="text-xs text-slate-500">Memuat putaran arisan...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredRounds.length === 0 && (
          <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center max-w-md mx-auto space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center text-3xl mx-auto shadow-xs">
              🎲
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Belum Ada Putaran Arisan</h3>
              <p className="text-xs text-slate-500 mt-1">
                {filterStatus === 'all'
                  ? 'Grup arisan belum memiliki putaran aktif. Buat putaran pertama untuk memulai pengumpulan iuran.'
                  : `Tidak ada putaran dengan status "${filterStatus}".`}
              </p>
            </div>
            {isTenantAdmin && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs transition-colors"
              >
                <AiOutlinePlus />
                <span>Buat Putaran Pertama</span>
              </button>
            )}
          </div>
        )}

        {/* Grid Daftar Putaran */}
        {!loading && filteredRounds.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRounds.map((round) => {
              const badge = STATUS_BADGES[round.status] || STATUS_BADGES.collecting;
              const StatusIcon = badge.icon;
              const isDrawn = round.status === 'drawn';
              const isReadyToDraw = round.status === 'ready_to_draw';

              return (
                <div
                  key={round.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-xs ${
                    isDrawn
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : isReadyToDraw
                      ? 'bg-emerald-50/40 border-emerald-300 ring-2 ring-emerald-500/10'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Top Row: Round Number, Status Badge */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-purple-700 font-mono text-xs font-bold">
                          Putaran #{round.round_number}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 truncate">{round.period}</h3>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}
                      >
                        <StatusIcon className="text-xs" />
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    {/* Total Hadiah / Kas */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">
                          Total Hadiah Putaran
                        </span>
                        <span className="text-sm sm:text-base font-extrabold text-amber-800">
                          {formatRupiah(round.total_pool_amount)}
                        </span>
                      </div>

                      {round.notes && (
                        <div className="text-right max-w-[50%]">
                          <span className="text-[10px] text-slate-500 block uppercase font-semibold">
                            Catatan
                          </span>
                          <span className="text-xs text-slate-700 truncate block font-medium">
                            {round.notes}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Rincian Pemenang jika status Drawn */}
                    {isDrawn && (
                      <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-sm shadow-xs">
                            🏆
                          </div>
                          <div>
                            <span className="text-[10px] text-purple-800 block font-bold uppercase">
                              Pemenang Terpilih
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {round.winner?.full_name || 'Anggota Arisan'}
                            </span>
                          </div>
                        </div>

                        {round.drawn_at && (
                          <div className="text-right text-[11px] text-slate-500">
                            <span>Dikocok pada: </span>
                            <span className="font-semibold text-slate-800">
                              {new Date(round.drawn_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tombol Aksi Bawah */}
                  <div className="pt-4 mt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenRoundBills(round)}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-purple-700 hover:text-purple-800 text-xs font-semibold border border-slate-200 transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <AiOutlineTeam />
                        <span>Iuran Peserta</span>
                      </button>

                      {isTenantAdmin && round.status === 'collecting' && (
                        <button
                          type="button"
                          disabled={generatingBills || isReadOnly}
                          onClick={() => handleGenerateBills(round)}
                          className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                          title="Terbitkan tagihan iuran untuk seluruh peserta yang belum memiliki tagihan pada putaran ini"
                        >
                          <span>⚡ Terbitkan Iuran</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isReadyToDraw && isTenantAdmin && (
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-4 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <span>🎲 Kocok Sekarang</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}

                      {isReadyToDraw && !isTenantAdmin && (
                        <button
                          type="button"
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <span>🎲 Ruang Kocok</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}

                      {round.status === 'collecting' && (
                        <button
                          type="button"
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <span>Ruang Kocok</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}

                      {isDrawn && (
                        <button
                          type="button"
                          onClick={() => navigate(`/t/${tenantId}/arisan/draw?roundId=${round.id}`)}
                          className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <span>🏆 Hasil Undian</span>
                          <AiOutlineArrowRight />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Buat Putaran Baru */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title={`Buat Putaran #${nextRoundNumber}`}
        >
          <form onSubmit={handleCreateRound} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 block">Nama / Periode Putaran</label>
              <input
                type="text"
                required
                value={newRoundPeriod}
                onChange={(e) => setNewRoundPeriod(e.target.value)}
                placeholder="Contoh: Putaran 2 - November 2026"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-forest-800 shadow-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 block">Total Hadiah Putaran (Target Kas)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold">
                  Rp
                </span>
                <input
                  type="number"
                  required
                  min={10000}
                  step={50000}
                  value={newRoundPool}
                  onChange={(e) => setNewRoundPool(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-forest-800 shadow-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 block">Catatan Tambahan (Opsional)</label>
              <textarea
                rows={2}
                value={newRoundNotes}
                onChange={(e) => setNewRoundNotes(e.target.value)}
                placeholder="Catatan jadwal kumpul arisan atau lokasi pertemuan..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-forest-800 shadow-xs"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 shadow-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Putaran'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal Rincian Iuran Peserta Putaran */}
        <Modal
          isOpen={!!selectedRoundForBills}
          onClose={() => setSelectedRoundForBills(null)}
          title={`Rincian Iuran — ${selectedRoundForBills?.period || ''}`}
        >
          <div className="space-y-4 text-xs">
            {/* Header Summary */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">
                  Status Pengumpulan Iuran
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {roundBills.filter((b) => b.status === 'paid').length} / {roundBills.length} Peserta Lunas
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">
                  Target Kas Putaran
                </span>
                <span className="text-sm font-extrabold text-amber-800">
                  {formatRupiah(selectedRoundForBills?.total_pool_amount)}
                </span>
              </div>
            </div>

            {/* Loading */}
            {loadingRoundBills && (
              <div className="py-8 text-center text-slate-500">
                <div className="h-6 w-6 border-2 border-purple-700 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
                <span>Memuat data iuran peserta...</span>
              </div>
            )}

            {/* Empty Bills (Belum diterbitkan) */}
            {!loadingRoundBills && roundBills.length === 0 && (
              <div className="py-6 text-center space-y-3">
                <p className="text-slate-600">
                  Tagihan iuran untuk putaran ini belum diterbitkan kepada peserta.
                </p>
                {isTenantAdmin && (
                  <button
                    type="button"
                    disabled={generatingBills || isReadOnly}
                    onClick={() => handleGenerateBills(selectedRoundForBills)}
                    className="px-4 py-2 bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold rounded-xl shadow-xs text-xs inline-flex items-center gap-1.5"
                  >
                    <span>⚡ Terbitkan Tagihan Iuran Sekarang</span>
                  </button>
                )}
              </div>
            )}

            {/* List Tagihan Peserta */}
            {!loadingRoundBills && roundBills.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {roundBills.map((bill, index) => {
                  const isPaid = bill.status === 'paid';
                  const memberName = bill.tenant_members?.full_name || `Peserta #${index + 1}`;
                  const slotLabel = bill.tenant_units?.label;

                  return (
                    <div
                      key={bill.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">{memberName}</span>
                          {slotLabel && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200 font-medium">
                              {slotLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Nominal: {formatRupiah(bill.amount)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {isPaid ? 'Lunas' : 'Belum Bayar'}
                        </span>

                        {!isPaid && isTenantAdmin && (
                          <button
                            type="button"
                            disabled={markingPaidId === bill.id || isReadOnly}
                            onClick={() => handleMarkPaid(bill.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition-colors shadow-xs disabled:opacity-50"
                            title="Tandai pembayaran tunai/transfer telah diterima"
                          >
                            {markingPaidId === bill.id ? 'Memproses...' : 'Tandai Lunas'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer Modal */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Pengocokan siap dilakukan jika seluruh peserta telah lunas.
              </span>
              <button
                type="button"
                onClick={() => setSelectedRoundForBills(null)}
                className="px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200 shadow-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal Konfirmasi Mulai Siklus Baru */}
        {isResetCycleModalOpen && (
          <Modal
            isOpen={isResetCycleModalOpen}
            onClose={() => !resettingCycle && setIsResetCycleModalOpen(false)}
            title="🔄 Konfirmasi Mulai Siklus Baru"
            maxWidth="max-w-md"
          >
            <div className="p-4 space-y-4 text-left">
              <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 leading-relaxed shadow-xs">
                <p className="font-bold text-purple-950 mb-1.5">Penjelasan &amp; Dampak Tindakan:</p>
                <ul className="list-disc list-inside space-y-1 text-purple-800">
                  <li>
                    Status kemenangan seluruh peserta (<strong>{participants.length} anggota</strong>) akan direset kembali menjadi <strong>Belum Menang</strong>.
                  </li>
                  <li>Nomor siklus grup arisan akan dinaikkan ke siklus berikutnya.</li>
                  <li>
                    Riwayat putaran dan catatan pemenang sebelumnya <strong>tetap aman tersimpan</strong> untuk arsip dan transparansi.
                  </li>
                </ul>
              </div>

              {stats.totalWinners < stats.totalParticipants && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2 shadow-xs">
                  <AiOutlineWarning className="text-lg shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Masih terdapat <strong>{stats.totalParticipants - stats.totalWinners} peserta</strong> yang belum memenangkan undian pada siklus ini. Reset sekarang akan menjalankan force-reset.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={resettingCycle}
                  onClick={() => setIsResetCycleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={resettingCycle || isReadOnly}
                  onClick={() => handleConfirmResetCycle(stats.totalWinners < stats.totalParticipants)}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {resettingCycle ? (
                    <>
                      <AiOutlineReload className="animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span>🔄 Ya, Mulai Siklus Baru</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
