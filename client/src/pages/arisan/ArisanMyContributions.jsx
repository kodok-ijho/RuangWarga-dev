import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AiOutlineWallet,
  AiOutlineTrophy,
  AiOutlineCalendar,
  AiOutlineCreditCard,
  AiOutlineReload,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineCloseCircle,
  AiOutlineArrowRight,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchMyArisanBills,
  fetchArisanRounds,
} from '../../services/tenantOperationalService';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import MemberBillPayModal from '../../components/payments/MemberBillPayModal';

export default function ArisanMyContributions() {
  const { tenantId: routeTenantId } = useParams();
  const toast = useToast();
  const { activeTenant, activeTenantId, activeMember } = useTenant();
  const { isReadOnly } = useSubscriptionGate();

  const tenantId = routeTenantId || activeTenantId;
  const memberId = activeMember?.id;

  const [bills, setBills] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBillToPay, setSelectedBillToPay] = useState(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!tenantId || !memberId) {
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [billsData, roundsData] = await Promise.all([
        fetchMyArisanBills(tenantId, memberId),
        fetchArisanRounds(tenantId),
      ]);

      setBills(billsData || []);
      setRounds(roundsData || []);
    } catch (err) {
      console.error('[ArisanMyContributions] Gagal memuat data:', err);
      toast.error('Gagal memuat daftar setoran arisan.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, memberId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cari putaran terakhir yang berstatus drawn
  const lastDrawnRound = useMemo(() => {
    return (rounds || [])
      .filter((r) => r.status === 'drawn')
      .sort((a, b) => (b.round_number || 0) - (a.round_number || 0))[0] || null;
  }, [rounds]);

  // Status badge config
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <AiOutlineCheckCircle className="text-emerald-600" />
            <span>Lunas</span>
          </span>
        );
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AiOutlineClockCircle className="text-amber-600" />
            <span>Menunggu verifikasi</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <AiOutlineCloseCircle />
            <span>Dibatalkan</span>
          </span>
        );
      case 'unpaid':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AiOutlineCloseCircle className="text-rose-600" />
            <span>Belum bayar</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── 1. HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-purple-100 text-purple-700 text-lg">
              <AiOutlineWallet />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-display">
              Setoran Saya
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Riwayat dan pembayaran iuran setoran arisan Anda di {activeTenant?.name || 'Komunitas'}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <AiOutlineReload className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Menyegarkan...' : 'Segarkan'}</span>
        </button>
      </div>

      {/* ── 2. HASIL KOCOK TERAKHIR ── */}
      {lastDrawnRound && (
        <div className="p-4 sm:p-5 rounded-2xl bg-linear-to-r from-amber-50 to-orange-50 border border-amber-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                <AiOutlineTrophy className="text-base" />
              </span>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Hasil Kocok Terakhir
                </span>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Putaran #{lastDrawnRound.round_number} ({lastDrawnRound.period || 'Reguler'})
                </h3>
              </div>
            </div>

            <Link
              to={`/t/${tenantId}/arisan/draw?roundId=${lastDrawnRound.id}&tab=history`}
              className="text-xs font-bold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 transition-colors"
            >
              <span>Riwayat Transparan</span>
              <AiOutlineArrowRight className="text-[10px]" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-amber-200/60 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Pemenang</span>
              <span className="font-bold text-slate-900 truncate block">
                {lastDrawnRound.winner?.full_name || lastDrawnRound.winner_name || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Slot</span>
              <span className="font-semibold text-slate-800 truncate block">
                {Array.isArray(lastDrawnRound.eligible_snapshot)
                  ? lastDrawnRound.eligible_snapshot.find(
                      (p) => p && (p.member_id === lastDrawnRound.winner_member_id || p.id === lastDrawnRound.winner_member_id)
                    )?.slot_label || '-'
                  : '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Total Hadiah</span>
              <span className="font-extrabold text-amber-700 block">
                {formatRupiah(lastDrawnRound.total_pool_amount || 0)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Waktu Pengundian</span>
              <span className="font-medium text-slate-700 block truncate">
                {lastDrawnRound.drawn_at ? formatDate(lastDrawnRound.drawn_at) : '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. DAFTAR SETORAN SAYA ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800 flex items-center justify-between">
          <span>Daftar Setoran Iuran Putaran</span>
          <span className="text-xs text-slate-500 font-normal">
            {bills.length} Tagihan
          </span>
        </h2>

        {loading ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Memuat riwayat setoran...</p>
          </div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
              <AiOutlineInfoCircle />
            </div>
            <p className="text-xs font-semibold text-slate-700">Belum Ada Tagihan Setoran</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Pengurus belum menerbitkan tagihan setoran arisan untuk akun Anda.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bills.map((bill) => {
              const roundTitle =
                bill.round_label ||
                (bill.round_number ? `Putaran #${bill.round_number}` : bill.period) ||
                'Iuran Arisan';

              return (
                <div
                  key={bill.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-300"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {roundTitle}
                      </span>
                      {renderStatusBadge(bill.status)}
                    </div>

                    <div className="text-lg font-extrabold text-slate-900">
                      {formatRupiah(bill.amount || 0)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {bill.due_date && (
                        <span className="flex items-center gap-1">
                          <AiOutlineCalendar className="text-slate-400" />
                          <span>Jatuh tempo: {formatDate(bill.due_date)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {bill.status === 'unpaid' ? (
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setSelectedBillToPay(bill)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                      >
                        <AiOutlineCreditCard className="text-sm" />
                        <span>Bayar</span>
                      </button>
                    ) : bill.status === 'pending_verification' ? (
                      <span className="text-xs text-amber-700 font-semibold px-2 py-1 bg-amber-50 rounded-lg">
                        Sedang diverifikasi pengurus
                      </span>
                    ) : bill.status === 'paid' ? (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 px-2 py-1 bg-emerald-50 rounded-lg">
                        <AiOutlineCheckCircle />
                        <span>Telah lunas</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. MODAL PEMBAYARAN VIA TRANSFER BANK ── */}
      {selectedBillToPay && (
        <MemberBillPayModal
          tenantId={tenantId}
          bill={selectedBillToPay}
          title={`Bayar Setoran: ${selectedBillToPay.round_label || selectedBillToPay.period || 'Putaran Arisan'}`}
          onClose={() => setSelectedBillToPay(null)}
          onPaid={() => loadData(true)}
        />
      )}
    </div>
  );
}
