import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  AiOutlineTrophy,
  AiOutlineGift,
  AiOutlineCalendar,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineTeam,
  AiOutlineReload,
  AiOutlineArrowLeft,
  AiOutlineUser,
  AiOutlineDollarCircle,
  AiOutlineInfoCircle,
  AiOutlineWarning,
  AiOutlineCheck,
  AiOutlineHistory,
  AiOutlineFire,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchArisanRounds,
  fetchArisanParticipants,
  fetchArisanRoundBills,
  fetchArisanCandidates,
  drawArisanWinner,
  startNewArisanCycle,
} from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';
import Modal from '../../components/Modal';

export default function ArisanDraw() {
  const { tenantId: routeTenantId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { activeTenant, activeTenantId, isTenantAdmin, isBendahara } = useTenant();
  const { isReadOnly, bannerText } = useSubscriptionGate();

  const tenantId = routeTenantId || activeTenantId;
  const initialRoundId = searchParams.get('roundId');

  // State Utama
  const [rounds, setRounds] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(initialRoundId || null);
  const [roundBills, setRoundBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingBills, setLoadingBills] = useState(false);

  // State Pengocokan & Animasi
  const [isDrawing, setIsDrawing] = useState(false);
  const [shuffledCandidate, setShuffledCandidate] = useState(null);
  const [winnerCelebration, setWinnerCelebration] = useState(null);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [isResetCycleModalOpen, setIsResetCycleModalOpen] = useState(false);
  const [resettingCycle, setResettingCycle] = useState(false);
  const [activeTab, setActiveTab] = useState('arena'); // 'arena' | 'candidates' | 'history'

  const shuffleIntervalRef = useRef(null);

  // Periksa hak pengurus/operator
  const canDraw = isTenantAdmin || isBendahara;

  // Load Data rounds, participants, candidates
  const loadData = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [roundsData, participantsData, candidatesData] = await Promise.all([
        fetchArisanRounds(tenantId),
        fetchArisanParticipants(tenantId),
        fetchArisanCandidates(tenantId),
      ]);

      const loadedRounds = roundsData || [];
      setRounds(loadedRounds);
      setParticipants(participantsData || []);
      setCandidates(candidatesData || []);

      // Tentukan selectedRoundId jika belum ada atau tidak valid
      if (!selectedRoundId || !loadedRounds.find((r) => r.id === selectedRoundId)) {
        // Prioritas 1: round yang ready_to_draw
        const readyRound = loadedRounds.find((r) => r.status === 'ready_to_draw');
        if (readyRound) {
          setSelectedRoundId(readyRound.id);
        } else {
          // Prioritas 2: round yang collecting
          const collectingRound = loadedRounds.find((r) => r.status === 'collecting');
          if (collectingRound) {
            setSelectedRoundId(collectingRound.id);
          } else if (loadedRounds.length > 0) {
            // Prioritas 3: round terbaru
            setSelectedRoundId(loadedRounds[0].id);
          }
        }
      }
    } catch (err) {
      console.error('[ArisanDraw] Gagal memuat data:', err);
      toast.error('Gagal memuat data ruang pengocokan arisan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  // Update query param bila selectedRoundId berubah
  useEffect(() => {
    if (selectedRoundId) {
      setSearchParams({ roundId: selectedRoundId }, { replace: true });
    }
  }, [selectedRoundId]);

  // Ambil objek putaran terpilih
  const selectedRound = useMemo(() => {
    return rounds.find((r) => r.id === selectedRoundId) || null;
  }, [rounds, selectedRoundId]);

  // Load bills untuk putaran terpilih
  useEffect(() => {
    const loadBills = async () => {
      if (!tenantId || !selectedRoundId) return;
      try {
        setLoadingBills(true);
        const bills = await fetchArisanRoundBills(tenantId, selectedRoundId);
        setRoundBills(bills || []);
      } catch (err) {
        console.error('[ArisanDraw] Gagal memuat tagihan putaran:', err);
      } finally {
        setLoadingBills(false);
      }
    };

    loadBills();
  }, [tenantId, selectedRoundId]);

  // Statistik Tagihan Putaran Terpilih
  const billStats = useMemo(() => {
    const total = roundBills.length;
    const paidCount = roundBills.filter((b) => b.status === 'paid').length;
    const unpaidCount = total - paidCount;
    const isFullyPaid = total > 0 && paidCount === total;
    const percentage = total > 0 ? Math.round((paidCount / total) * 100) : 0;
    return { total, paidCount, unpaidCount, isFullyPaid, percentage };
  }, [roundBills]);

  // Riwayat Pengocokan (putaran yang sudah drawn)
  const drawnRounds = useMemo(() => {
    return rounds
      .filter((r) => r.status === 'drawn')
      .sort((a, b) => (b.round_number || 0) - (a.round_number || 0));
  }, [rounds]);

  // Handler Jalankan Pengocokan dengan Animasi Shuffling
  const handleStartDraw = async () => {
    if (!selectedRound) return;

    if (isReadOnly) {
      toast.warning(bannerText || 'Fitur dinonaktifkan dalam status langganan read-only.');
      return;
    }

    if (!canDraw) {
      toast.error('Hanya Admin atau Bendahara arisan yang berwenang menjalankan pengocokan.');
      return;
    }

    if (selectedRound.status !== 'ready_to_draw') {
      if (!billStats.isFullyPaid) {
        toast.error('Pengocokan belum dapat dijalankan karena masih ada iuran peserta yang belum lunas.');
      } else {
        toast.error('Status putaran belum siap untuk dikocok.');
      }
      return;
    }

    if (candidates.length === 0) {
      toast.error('Tidak ada kandidat peserta yang tersisa untuk putaran ini.');
      return;
    }

    setIsDrawing(true);
    setWinnerCelebration(null);

    // Animasi Shuffling Peserta
    let counter = 0;
    shuffleIntervalRef.current = setInterval(() => {
      counter++;
      const randomIndex = Math.floor(Math.random() * candidates.length);
      setShuffledCandidate(candidates[randomIndex]);
    }, 75);

    try {
      // Jalankan RPC atomik di database
      const [result] = await Promise.all([
        drawArisanWinner(tenantId, selectedRound.id, user?.id),
        // Minimal delay 2.8 detik untuk sensasi ketegangan pengocokan yang seru
        new Promise((resolve) => setTimeout(resolve, 2800)),
      ]);

      // Hentikan interval shuffling
      if (shuffleIntervalRef.current) {
        clearInterval(shuffleIntervalRef.current);
        shuffleIntervalRef.current = null;
      }

      setIsDrawing(false);
      setShuffledCandidate(null);
      setWinnerCelebration(result);
      setShowCelebrationModal(true);

      toast.success(`Selamat kepada ${result.winner_name || 'pemenang'} atas kemenangannya!`);

      // Reload data untuk sinkronisasi state
      await loadData();
    } catch (err) {
      if (shuffleIntervalRef.current) {
        clearInterval(shuffleIntervalRef.current);
        shuffleIntervalRef.current = null;
      }
      setIsDrawing(false);
      setShuffledCandidate(null);
      console.error('[ArisanDraw] Gagal menjalankan pengocokan:', err);
      toast.error(err.message || 'Gagal menjalankan pengocokan arisan.');
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (shuffleIntervalRef.current) {
        clearInterval(shuffleIntervalRef.current);
      }
    };
  }, []);

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
      setShowCelebrationModal(false);
      await loadData();
    } catch (err) {
      console.error('[ArisanDraw] Gagal memulai siklus baru:', err);
      toast.error(err.message || 'Gagal memulai siklus arisan baru.');
    } finally {
      setResettingCycle(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Read-only Banner jika subscription expired */}
        {isReadOnly && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 text-sm shadow-xs">
            <div className="flex items-center gap-2">
              <AiOutlineWarning className="text-xl shrink-0 text-rose-600" />
              <span>{bannerText || 'Tenant dalam status Read-Only. Pengocokan arisan dinonaktifkan.'}</span>
            </div>
            <Link
              to="/account/subscriptions"
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs"
            >
              Perpanjang
            </Link>
          </div>
        )}

        {/* Top Header & Navigasi Balik */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/arisan/rounds`)}
              className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-xs"
              title="Kembali ke Daftar Putaran"
            >
              <AiOutlineArrowLeft className="text-lg" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎲</span>
                <h1 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900">
                  Ruang Pengocokan Arisan
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                  Transparan
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600">
                Sistem pengundian acak transparan, adil, dan terverifikasi untuk seluruh anggota arisan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              disabled={loading || isDrawing}
              className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors disabled:opacity-50 shadow-xs"
              title="Segarkan Data"
            >
              <AiOutlineReload className={loading ? 'animate-spin' : ''} />
            </button>

            {isTenantAdmin && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setIsResetCycleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
                title="Mulai Siklus Baru Arisan (Reset Peserta)"
              >
                <AiOutlineReload />
                <span className="hidden sm:inline">Siklus Baru</span>
              </button>
            )}

            {/* Dropdown Pemilih Putaran */}
            {rounds.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">Putaran:</span>
                <select
                  value={selectedRoundId || ''}
                  onChange={(e) => setSelectedRoundId(e.target.value)}
                  disabled={isDrawing}
                  className="bg-slate-50 text-purple-700 text-xs font-bold rounded-lg px-2 py-1 border border-slate-200 focus:outline-none focus:border-forest-800 cursor-pointer"
                >
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      Putaran #{r.round_number} ({r.period || 'Reguler'}) - {r.status}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigasi Halaman Pengocokan */}
        <div className="flex border-b border-slate-200 text-sm gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('arena')}
            className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'arena'
                ? 'border-forest-800 text-forest-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🎲 Arena Pengocokan</span>
            {selectedRound && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold">
                #{selectedRound.round_number}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('candidates')}
            className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'candidates'
                ? 'border-forest-800 text-forest-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AiOutlineTeam />
            <span>Kandidat Undian</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 font-bold">
              {candidates.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-forest-800 text-forest-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AiOutlineHistory />
            <span>Riwayat Pemenang</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 font-bold">
              {drawnRounds.length}
            </span>
          </button>
        </div>

        {/* Konten Utama Berdasarkan Tab */}
        {loading ? (
          <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <AiOutlineReload className="animate-spin text-3xl mx-auto mb-3 text-forest-800" />
            <p className="text-sm">Menyiapkan arena pengocokan arisan...</p>
          </div>
        ) : !selectedRound ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-4xl block mb-2">📋</span>
            <h3 className="text-base font-bold text-slate-900 mb-1">Belum Ada Putaran Arisan</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              Silakan buat putaran arisan terlebih dahulu pada halaman Kelola Putaran sebelum menjalankan undian.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/t/${tenantId}/arisan/rounds`)}
              className="px-4 py-2.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 text-xs font-bold shadow-xs"
            >
              Menuju Kelola Putaran
            </button>
          </div>
        ) : (
          <>
            {/* TAB 1: ARENA PENGOCOKAN */}
            {activeTab === 'arena' && (
              <div className="space-y-6">
                {/* Status Hero Box */}
                <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-xs relative overflow-hidden">
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

                  <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Ringkasan Putaran & Hadiah */}
                    <div className="text-center md:text-left space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-xs text-purple-800 font-bold">
                        <span>Putaran #{selectedRound.round_number}</span>
                        <span>•</span>
                        <span>{selectedRound.period || 'Periode Berjalan'}</span>
                      </div>

                      <h2 className="text-2xl sm:text-4xl font-extrabold font-display text-slate-900">
                        {formatRupiah(selectedRound.pool_amount || 0)}
                      </h2>
                      <p className="text-xs text-slate-600">
                        Total hadiah uang tunai yang akan diterima oleh pemenang putaran ini.
                      </p>

                      <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <AiOutlineTeam className="text-purple-600" />
                          <span>Kandidat Berhak Undi: </span>
                          <strong className="text-slate-900 font-bold">{candidates.length} Anggota</strong>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <AiOutlineClockCircle className="text-amber-600" />
                          <span>Status: </span>
                          <strong className="text-slate-900 capitalize">{selectedRound.status.replace('_', ' ')}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Stage Animasi Shuffling / Pemenang / Tombol Undi */}
                    <div className="w-full md:w-auto flex flex-col items-center">
                      {isDrawing ? (
                        /* Tampilan saat Shuffling Berlangsung */
                        <div className="text-center p-6 bg-purple-50 border-2 border-purple-400 rounded-2xl shadow-xs min-w-[280px] animate-pulse">
                          <span className="text-4xl animate-bounce block mb-2">🎰</span>
                          <span className="text-[11px] uppercase tracking-widest text-purple-800 font-bold block">
                            Mengacak Pemenang...
                          </span>
                          <div className="mt-3 py-2 px-4 bg-white rounded-xl border border-purple-300 shadow-xs">
                            <span className="text-lg sm:text-xl font-extrabold text-purple-900 block font-display truncate">
                              {shuffledCandidate ? shuffledCandidate.full_name : 'Memutar nama...'}
                            </span>
                            <span className="text-[10px] text-purple-700">
                              {shuffledCandidate ? (shuffledCandidate.unit?.name || 'Peserta Arisan') : 'Undian Berlangsung'}
                            </span>
                          </div>
                        </div>
                      ) : selectedRound.status === 'drawn' ? (
                        /* Tampilan jika putaran ini SUDAH selesai diundi */
                        <div className="text-center p-6 bg-purple-50/50 border border-purple-200 rounded-2xl shadow-xs min-w-[280px]">
                          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-3xl mx-auto mb-3 shadow-xs">
                            🏆
                          </div>
                          <span className="text-[11px] uppercase tracking-wider text-amber-800 font-extrabold block">
                            Pemenang Terpilih
                          </span>
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                            {selectedRound.winner?.full_name || 'Anggota Beruntung'}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {selectedRound.winner?.phone_number || 'Peserta Arisan'}
                          </p>
                          {selectedRound.drawn_at && (
                            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-white border border-slate-200 text-[10px] text-slate-600 shadow-xs">
                              Diundi: {new Date(selectedRound.drawn_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Tampilan Tombol Jalankan Undian (Status collecting atau ready_to_draw) */
                        <div className="text-center space-y-3 min-w-[260px]">
                          {candidates.length === 0 ? (
                            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-center space-y-2 shadow-xs">
                              <span className="text-3xl block">🎉</span>
                              <span className="text-xs font-bold text-purple-900 block">
                                Seluruh Peserta Telah Menang!
                              </span>
                              <p className="text-[11px] text-purple-700 leading-relaxed">
                                Siklus putaran telah lengkap. Mulai siklus baru untuk mengocok kembali seluruh peserta dari awal.
                              </p>
                              {isTenantAdmin && (
                                <button
                                  type="button"
                                  disabled={isReadOnly}
                                  onClick={() => setIsResetCycleModalOpen(true)}
                                  className="mt-1 w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
                                >
                                  🔄 Mulai Siklus Baru
                                </button>
                              )}
                            </div>
                          ) : selectedRound.status === 'ready_to_draw' ? (
                            <>
                              <button
                                type="button"
                                disabled={!canDraw || isReadOnly}
                                onClick={handleStartDraw}
                                className="w-full py-4 px-8 rounded-2xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-extrabold text-base sm:text-lg shadow-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-3"
                              >
                                <span className="text-2xl">🎲</span>
                                <span>Jalankan Kocok Sekarang</span>
                              </button>
                              <p className="text-[11px] text-emerald-700 font-semibold">
                                ✓ Seluruh iuran peserta lunas. Siap diundi!
                              </p>
                            </>
                          ) : (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center shadow-xs">
                              <span className="text-2xl block mb-1">⏳</span>
                              <span className="text-xs font-bold text-amber-800 block mb-1">
                                Belum Siap Dikocok
                              </span>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                Pengocokan hanya dapat dijalankan setelah seluruh peserta (100%) melunasi iuran putaran ini.
                              </p>
                            </div>
                          )}

                          {!canDraw && selectedRound.status === 'ready_to_draw' && (
                            <p className="text-[10px] text-slate-500">
                              * Tombol hanya dapat ditekan oleh Pengurus/Admin Arisan.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Status Pelunasan Iuran Peserta Putaran Ini */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <AiOutlineDollarCircle className="text-forest-800 text-base" />
                        <span>Status Kelunasan Iuran Putaran #{selectedRound.round_number}</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Transparansi pengumpulan dana sebelum nomor undian diputar.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {billStats.paidCount} dari {billStats.total} Peserta Lunas
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          billStats.isFullyPaid
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {billStats.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar visual */}
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        billStats.isFullyPaid
                          ? 'bg-emerald-600'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${billStats.percentage}%` }}
                    />
                  </div>

                  {/* Catatan / Aksi Cepat ke Kelola Putaran */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {billStats.unpaidCount > 0
                        ? `${billStats.unpaidCount} peserta masih memiliki tagihan belum lunas.`
                        : 'Seluruh peserta telah melunasi tagihan putaran ini.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/t/${tenantId}/arisan/rounds`)}
                      className="text-forest-800 hover:text-forest-900 font-bold underline underline-offset-2"
                    >
                      Kelola Rincian Iuran &rarr;
                    </button>
                  </div>
                </div>

                {/* Grid 2 Kolom: Kandidat Aktif & Ringkasan Pemenang Terakhir */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Kolom 1: Kandidat yang Berhak Diundi (has_won = false) */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <AiOutlineTeam className="text-purple-600" />
                          <span>Kandidat Undian ({candidates.length})</span>
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          Peserta yang belum pernah menang
                        </span>
                      </div>

                      {candidates.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-3 shadow-xs">
                          <span className="text-3xl block">🎉</span>
                          <div>
                            <p className="text-xs font-bold text-slate-900">Siklus Telah Lengkap</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Seluruh peserta dalam siklus ini telah mendapatkan giliran menang!
                            </p>
                          </div>
                          {isTenantAdmin && (
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => setIsResetCycleModalOpen(true)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
                            >
                              <AiOutlineReload />
                              <span>Mulai Siklus Baru</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {candidates.map((cand, idx) => (
                            <div
                              key={cand.id}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-xs"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center text-xs font-bold border border-purple-200">
                                  {idx + 1}
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-slate-900">{cand.full_name}</h5>
                                  <span className="text-[10px] text-slate-500">
                                    {cand.unit?.name || 'Peserta Arisan'}
                                  </span>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Berhak Diundi
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
                      * Setiap peserta hanya dapat menang satu kali per siklus arisan (Spec §5).
                    </div>
                  </div>

                  {/* Kolom 2: Transparansi Pemenang Putaran-Putaran Sebelumnya */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <AiOutlineTrophy className="text-amber-600" />
                          <span>Riwayat Pemenang Sebelumnya</span>
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          {drawnRounds.length} Pemenang
                        </span>
                      </div>

                      {drawnRounds.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                          <span className="text-3xl block mb-2">🎲</span>
                          <p className="text-xs font-bold text-slate-900">Belum Ada Pemenang</p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Putaran pertama arisan ini belum selesai dikocok.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {drawnRounds.slice(0, 5).map((r) => (
                            <div
                              key={r.id}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-xs"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-xs font-bold shadow-xs">
                                  🏆
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-slate-900">
                                    {r.winner?.full_name || 'Pemenang Arisan'}
                                  </h5>
                                  <span className="text-[10px] text-slate-500">
                                    Putaran #{r.round_number} ({r.period || 'Reguler'})
                                  </span>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-extrabold text-amber-800 block">
                                  {formatRupiah(r.pool_amount || 0)}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {r.drawn_at
                                    ? new Date(r.drawn_at).toLocaleDateString('id-ID', {
                                        day: 'numeric',
                                        month: 'short',
                                      })
                                    : '-'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Data riwayat tercatat secara permanen di ledger.</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className="text-forest-800 hover:text-forest-900 text-xs font-bold"
                      >
                        Lihat Seluruhnya &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DAFTAR KANDIDAT UNDIAN */}
            {activeTab === 'candidates' && (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <AiOutlineTeam className="text-purple-600" />
                      <span>Daftar Seluruh Peserta &amp; Status Kelayakan Undian</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Transparansi posisi slot undian bagi seluruh anggota arisan.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                      {candidates.length} Berhak Diundi
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                      {participants.length - candidates.length} Sudah Menang
                    </span>
                  </div>
                </div>

                {participants.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    Belum ada data anggota yang terdaftar di tenant arisan ini.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                    {participants.map((member, idx) => {
                      const hasWon = member.has_won;
                      return (
                        <div
                          key={member.id}
                          className={`p-4 rounded-xl border transition-colors flex items-center justify-between shadow-xs ${
                            hasWon
                              ? 'bg-slate-50 border-slate-200 opacity-75'
                              : 'bg-white border-purple-200 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                                hasWon
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {hasWon ? '🏆' : idx + 1}
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-slate-900">{member.full_name}</h5>
                              <span className="text-[10px] text-slate-500 block">
                                {member.unit?.name || 'Peserta Arisan'}
                              </span>
                            </div>
                          </div>

                          <div>
                            {hasWon ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Sudah Menang
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Siap Diundi
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: RIWAYAT TRANSPARAN SELURUH PEMENANG */}
            {activeTab === 'history' && (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <AiOutlineHistory className="text-forest-800" />
                    <span>Riwayat Lengkap Pengocokan Putaran Arisan</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Seluruh anggota arisan dapat memeriksa catatan transparansi waktu pengundian dan pemenang setiap putaran.
                  </p>
                </div>

                {drawnRounds.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-3xl block mb-2">📜</span>
                    <p className="text-sm font-semibold text-slate-900">Belum Ada Riwayat Pengocokan</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Riwayat akan terisi otomatis setiap kali putaran arisan selesai diundi.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Putaran</th>
                          <th className="py-3 px-4">Pemenang</th>
                          <th className="py-3 px-4">Total Hadiah</th>
                          <th className="py-3 px-4">Waktu Diundi</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {drawnRounds.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 text-slate-900 font-bold">
                              Putaran #{r.round_number}
                              <span className="block text-[10px] text-slate-500 font-normal">
                                {r.period || '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-900 font-bold">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-500">🏆</span>
                                <div>
                                  <span>{r.winner?.full_name || 'Anggota Arisan'}</span>
                                  <span className="block text-[10px] text-slate-500 font-normal">
                                    {r.winner?.phone_number || '-'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-amber-800 font-extrabold">
                              {formatRupiah(r.pool_amount || 0)}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {r.drawn_at
                                ? new Date(r.drawn_at).toLocaleString('id-ID', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : '-'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                Selesai Diundi
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* MODAL SELEBRASI KEMENANGAN (POPUP CELEBRATION) */}
        {showCelebrationModal && winnerCelebration && (
          <Modal
            isOpen={showCelebrationModal}
            onClose={() => setShowCelebrationModal(false)}
            title="🎉 Selamat Kepada Pemenang!"
            maxWidth="max-w-md"
          >
            <div className="text-center p-4 space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-4xl mx-auto shadow-xs animate-bounce">
                🏆
              </div>

              <div>
                <span className="text-xs uppercase tracking-widest text-amber-800 font-extrabold block">
                  Pemenang Putaran #{winnerCelebration.round_number}
                </span>
                <h2 className="text-2xl font-extrabold text-slate-900 mt-1 font-display">
                  {winnerCelebration.winner_name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {winnerCelebration.slot_label || winnerCelebration.winner_phone || 'Peserta Terpilih'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center shadow-xs">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-semibold">
                  Total Hadiah Undian
                </span>
                <span className="text-2xl font-black text-amber-800 font-display block mt-1">
                  {formatRupiah(winnerCelebration.total_prize || 0)}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Dana siap diserahkan kepada pemenang terpilih.
                </span>
              </div>

              {winnerCelebration.is_cycle_completed ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-2 shadow-xs">
                  <p>🎉 <strong>Siklus Putaran Penuh Selesai!</strong> Seluruh peserta telah menerima giliran menang. Pengurus dapat memulai siklus baru.</p>
                  {isTenantAdmin && (
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setIsResetCycleModalOpen(true)}
                      className="w-full py-2 px-3 bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold rounded-lg text-xs transition-all shadow-xs disabled:opacity-50"
                    >
                      🔄 Mulai Siklus Baru Sekarang
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Masih tersisa <strong>{winnerCelebration.remaining_candidates} peserta</strong> yang belum memenangkan undian pada siklus ini.
                </p>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowCelebrationModal(false)}
                  className="w-full py-3.5 px-4 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold text-sm shadow-xs transition-all"
                >
                  Tutup &amp; Lihat Hasil
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* MODAL KONFIRMASI MULAI SIKLUS BARU */}
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
                    Status kemenangan seluruh anggota (<strong>{participants.length} peserta</strong>) akan direset kembali menjadi <strong>Berhak Diundi</strong>.
                  </li>
                  <li>Nomor siklus arisan akan dinaikkan ke siklus berikutnya.</li>
                  <li>
                    Riwayat putaran dan pemenang siklus-siklus sebelumnya <strong>tetap aman tersimpan</strong> secara transparan di sistem.
                  </li>
                </ul>
              </div>

              {candidates.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2 shadow-xs">
                  <AiOutlineWarning className="text-lg shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Masih terdapat <strong>{candidates.length} peserta</strong> yang belum memenangkan undian pada siklus ini. Reset sebelum semua peserta menang memerlukan izin paksa (force reset).
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
                  onClick={() => handleConfirmResetCycle(candidates.length > 0)}
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
