import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AiOutlineWhatsApp,
  AiOutlineReload,
  AiOutlineExclamationCircle,
  AiOutlineFileText,
  AiOutlineCalendar,
  AiOutlineHome,
  AiOutlineBell,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useToast } from '../../context/ToastContext';
import { fetchKosArrears } from '../../services/tenant/collections';
import { formatRupiah, formatDate } from '../../services/dataHelpers';
import { getTenantBankAccount } from '../../services/tenant/settings';
import { buildBillReminderMessage, buildWaLink } from '../../utils/waReminder';

export default function KosArrears() {
  const { tenantId } = useParams();
  const toast = useToast();
  const { activeTenant, isOwner, hasPermission } = useTenant();
  const { canGenerateBilling } = useTenantAccess();

  const isAuthorized = Boolean(isOwner || activeTenant?.is_owner || hasPermission?.('generate_billing') || canGenerateBilling);

  const [activeBucketFilter, setActiveBucketFilter] = useState('all');

  const {
    data: arrears = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['kosArrears', tenantId],
    queryFn: () => fetchKosArrears(tenantId),
    enabled: Boolean(tenantId && isAuthorized),
  });

  // Kalkulasi agregat total dan per bucket umur tunggakan (0-7, 8-30, >30)
  const summary = useMemo(() => {
    let grandTotal = 0;
    let totalBills = 0;

    const buckets = {
      '0-7': { total: 0, count: 0, members: 0 },
      '8-30': { total: 0, count: 0, members: 0 },
      '>30': { total: 0, count: 0, members: 0 },
    };

    arrears.forEach((row) => {
      const amount = Number(row.total_due || 0);
      const bills = Number(row.bills_count ?? row.bill_count ?? 1);
      grandTotal += amount;
      totalBills += bills;

      const bKey = row.bucket === '0-7' ? '0-7' : row.bucket === '8-30' ? '8-30' : '>30';
      if (buckets[bKey]) {
        buckets[bKey].total += amount;
        buckets[bKey].count += bills;
        buckets[bKey].members += 1;
      }
    });

    return {
      grandTotal,
      totalBills,
      totalMembers: arrears.length,
      buckets,
    };
  }, [arrears]);

  // Filter daftar tunggakan berdasarkan bucket pilihan
  const filteredArrears = useMemo(() => {
    if (activeBucketFilter === 'all') return arrears;
    return arrears.filter((row) => row.bucket === activeBucketFilter);
  }, [arrears, activeBucketFilter]);

  const handleSendWa = (row) => {
    if (!row.phone) {
      toast.warning('Nomor WhatsApp penyewa belum tersedia.');
      return;
    }

    const bankAccount = getTenantBankAccount(activeTenant);
    const appUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/t/${tenantId}`
        : `/t/${tenantId}`;

    const text = buildBillReminderMessage({
      residentName: row.nama,
      billLabel: 'Sewa Kamar (Tunggakan)',
      unitLabel: 'Kamar',
      unitName: row.unit || '',
      bills: [
        {
          period: row.oldest_due_date ? String(row.oldest_due_date).slice(0, 7) : '',
          amount: Number(row.total_due || 0),
          late_fee: 0,
          due_date: row.oldest_due_date,
        },
      ],
      bankAccount,
      appUrl,
      tenantName: activeTenant?.name || '',
    });

    const waUrl = buildWaLink(row.phone, text);

    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <AiOutlineExclamationCircle className="mx-auto text-4xl text-amber-600" />
          <h2 className="text-lg font-bold text-amber-900">Akses Terbatas</h2>
          <p className="text-sm text-amber-800 max-w-md mx-auto">
            Halaman Laporan Tunggakan hanya dapat diakses oleh Pemilik Kos atau pengurus dengan izin penagihan (generate_billing).
          </p>
          <div className="pt-2">
            <Link to={`/t/${tenantId}/dashboard`} className="pv-btn-primary text-xs py-2 px-4">
              Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <Link to={`/t/${tenantId}/dashboard`} className="hover:text-slate-800 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-slate-800">Tunggakan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-forest-950 font-display flex items-center gap-2">
            <span>📑</span> Laporan Tunggakan Sewa
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Monitoring umur piutang sewa kos per kelompok hari (0–7 hari, 8–30 hari, dan &gt;30 hari).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/t/${tenantId}/reminders`}
            className="pv-btn-ghost text-xs font-semibold py-2 px-3 border border-slate-200 flex items-center gap-1.5"
            title="Buka Pengingat Hari Ini"
          >
            <AiOutlineBell className="text-sm text-slate-600" />
            <span>Pengingat Hari Ini</span>
          </Link>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="pv-btn-ghost text-xs font-semibold py-2 px-3 border border-slate-200 flex items-center gap-1.5 disabled:opacity-50"
            title="Muat ulang laporan tunggakan"
          >
            <AiOutlineReload className={`text-sm ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Total per Bucket Umur Tunggakan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="arrears-summary-cards">
        {/* Card 1: Total Keseluruhan */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Tunggakan
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
              {summary.totalMembers} Penyewa
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-forest-950">
            {formatRupiah(summary.grandTotal)}
          </div>
          <p className="text-[11px] text-slate-500">
            {summary.totalBills} tagihan belum lunas
          </p>
        </div>

        {/* Card 2: 0-7 Hari */}
        <div
          onClick={() => setActiveBucketFilter(activeBucketFilter === '0-7' ? 'all' : '0-7')}
          className={`rounded-2xl border p-4 shadow-xs space-y-1 cursor-pointer transition-all ${
            activeBucketFilter === '0-7'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              0–7 Hari
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
              {summary.buckets['0-7'].members} Org
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-amber-950">
            {formatRupiah(summary.buckets['0-7'].total)}
          </div>
          <p className="text-[11px] text-amber-700">
            {summary.buckets['0-7'].count} tagihan toleransi/awal
          </p>
        </div>

        {/* Card 3: 8-30 Hari */}
        <div
          onClick={() => setActiveBucketFilter(activeBucketFilter === '8-30' ? 'all' : '8-30')}
          className={`rounded-2xl border p-4 shadow-xs space-y-1 cursor-pointer transition-all ${
            activeBucketFilter === '8-30'
              ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-300'
              : 'bg-white border-slate-200 hover:border-orange-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-800">
              8–30 Hari
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 font-semibold">
              {summary.buckets['8-30'].members} Org
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-orange-950">
            {formatRupiah(summary.buckets['8-30'].total)}
          </div>
          <p className="text-[11px] text-orange-700">
            {summary.buckets['8-30'].count} tagihan terlambat menengah
          </p>
        </div>

        {/* Card 4: >30 Hari */}
        <div
          onClick={() => setActiveBucketFilter(activeBucketFilter === '>30' ? 'all' : '>30')}
          className={`rounded-2xl border p-4 shadow-xs space-y-1 cursor-pointer transition-all ${
            activeBucketFilter === '>30'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
              &gt; 30 Hari
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 font-semibold">
              {summary.buckets['>30'].members} Org
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-rose-950">
            {formatRupiah(summary.buckets['>30'].total)}
          </div>
          <p className="text-[11px] text-rose-700">
            {summary.buckets['>30'].count} tagihan jatuh tempo kritis
          </p>
        </div>
      </div>

      {/* State Loading */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat laporan tunggakan">
          <div className="h-64 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
        </div>
      )}

      {/* State Error */}
      {isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center space-y-3">
          <AiOutlineExclamationCircle className="mx-auto text-3xl text-rose-600" />
          <h3 className="text-sm sm:text-base font-bold text-rose-900">Gagal Memuat Laporan Tunggakan</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error?.message || 'Terjadi kesalahan sistem.'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="pv-btn-primary text-xs py-2 px-4 shadow-xs"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* State Tidak Ada Tunggakan */}
      {!isLoading && !isError && arrears.length === 0 && (
        <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/30 p-10 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">
            ✓
          </div>
          <h3 className="text-base font-bold text-slate-900">Tidak Ada Tunggakan Sewa</h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Luar biasa! Seluruh tagihan sewa kos yang telah melewati jatuh tempo telah diselesaikan.
          </p>
        </div>
      )}

      {/* Tabel Per Penyewa */}
      {!isLoading && !isError && arrears.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          {/* Header Bar Tabel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-200 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Daftar Penyewa Menunggak ({filteredArrears.length})
              </span>
              {activeBucketFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveBucketFilter('all')}
                  className="text-[11px] font-semibold text-rose-700 hover:underline"
                >
                  Reset Filter ({activeBucketFilter} hari)
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium">Filter Kelompok:</span>
              <button
                type="button"
                onClick={() => setActiveBucketFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  activeBucketFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setActiveBucketFilter('0-7')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  activeBucketFilter === '0-7'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                0–7 Hari
              </button>
              <button
                type="button"
                onClick={() => setActiveBucketFilter('8-30')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  activeBucketFilter === '8-30'
                    ? 'bg-orange-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                8–30 Hari
              </button>
              <button
                type="button"
                onClick={() => setActiveBucketFilter('>30')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  activeBucketFilter === '>30'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                &gt;30 Hari
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" data-testid="arrears-table">
              <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Penyewa</th>
                  <th className="px-3 py-3">Kamar</th>
                  <th className="px-3 py-3 text-right">Total Tunggakan</th>
                  <th className="px-3 py-3 text-center">Jumlah Tagihan</th>
                  <th className="px-3 py-3">Keterlambatan</th>
                  <th className="px-3 py-3 text-center">Kelompok</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredArrears.map((row, idx) => {
                  const bucketBadge =
                    row.bucket === '0-7'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : row.bucket === '8-30'
                      ? 'bg-orange-100 text-orange-800 border-orange-300'
                      : 'bg-rose-100 text-rose-900 border-rose-300 font-bold';

                  const hasPhone = Boolean(row.phone && String(row.phone).trim());

                  return (
                    <tr
                      key={row.member_id || `${row.nama}-${idx}`}
                      data-testid={`arrear-row-${idx}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Nama Penyewa */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-sm">{row.nama}</div>
                        {hasPhone ? (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {row.phone}
                          </div>
                        ) : (
                          <div className="text-[10px] text-rose-600 italic mt-0.5">
                            Nomor HP belum ada
                          </div>
                        )}
                      </td>

                      {/* Kamar */}
                      <td className="px-3 py-3">
                        <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                          <AiOutlineHome className="text-slate-500" />
                          <span>{row.unit || '-'}</span>
                        </span>
                      </td>

                      {/* Total Tunggakan */}
                      <td className="px-3 py-3 text-right">
                        <span className="font-black font-mono text-sm text-forest-950">
                          {formatRupiah(row.total_due)}
                        </span>
                      </td>

                      {/* Jumlah Tagihan */}
                      <td className="px-3 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                          {row.bills_count ?? row.bill_count ?? 1}
                        </span>
                      </td>

                      {/* Keterlambatan */}
                      <td className="px-3 py-3">
                        <div className="font-semibold text-rose-700 text-xs">
                          Terlambat {row.days_late} hari
                        </div>
                        {row.oldest_due_date && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <AiOutlineCalendar className="text-slate-400" />
                            <span>Jatuh tempo: {formatDate(row.oldest_due_date)}</span>
                          </div>
                        )}
                      </td>

                      {/* Kelompok Umur */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] border ${bucketBadge}`}
                        >
                          {row.bucket} hari
                        </span>
                      </td>

                      {/* Aksi Tombol WA */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          data-testid={`wa-btn-arrear-${idx}`}
                          onClick={() => handleSendWa(row)}
                          disabled={!hasPhone}
                          className="pv-btn-primary text-xs py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={hasPhone ? 'Kirim pengingat tunggakan via WhatsApp' : 'Nomor WhatsApp belum ada'}
                        >
                          <AiOutlineWhatsApp className="text-sm" />
                          <span>Kirim WA</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
