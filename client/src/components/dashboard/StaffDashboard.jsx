import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AiOutlineTable,
  AiOutlineTeam,
  AiOutlineWallet,
  AiOutlineBarChart,
  AiOutlineArrowRight,
  AiOutlineCheckCircle,
  AiOutlineExclamationCircle,
  AiOutlineHome,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineClockCircle,
} from 'react-icons/ai';
import { StaffCollectionHero } from './StaffCollectionHero';
import { Button, StatusBadge } from '../ui';
import { formatRupiah } from '../../services/dataHelpers';
import AnimatedCounter from '../AnimatedCounter';

export function StaffDashboard({
  tenantId,
  template,
  dashData,
  periodLabel,
  activeTenant,
}) {
  const navigate = useNavigate();
  const [copiedLink, setCopiedLink] = useState(false);

  const pendingPay = dashData?.pendingPaymentCount || 0;
  const pendingReg = dashData?.pendingRegistrationCount || 0;
  const billing = dashData?.billing || {
    totalBilled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    billCount: 0,
    collectionRate: 0,
  };
  const finance = dashData?.finance || { totalIncome: 0, totalExpense: 0, netCashflow: 0 };
  const units = dashData?.units || { total: 0, occupied: 0, vacant: 0 };
  const members = dashData?.members || { total: 0 };
  const recentPayments = dashData?.recentPayments || [];

  const handleCopyInviteLink = () => {
    const inviteCode = activeTenant?.settings?.invite_code;
    if (!inviteCode) return;
    const fullUrl = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── 1. CRITICAL ACTIONS (Level 1 - Urgent Attention) ───────────────── */}
      <section aria-labelledby="critical-actions-heading" className="space-y-2.5">
        <h2 id="critical-actions-heading" className="sr-only">
          Tindakan Kritis Operasional
        </h2>

        {pendingPay > 0 || pendingReg > 0 ? (
          <div className="space-y-2.5">
            {pendingPay > 0 && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center text-base shrink-0">
                    <AiOutlineClockCircle />
                  </div>
                  <div>
                    <strong className="block text-amber-950 font-bold">
                      {pendingPay} pembayaran perlu diverifikasi
                    </strong>
                    <span className="text-amber-800">
                      Tinjau bukti transfer yang dikirim oleh {template?.memberLabel?.toLowerCase() || 'anggota'}.
                    </span>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/t/${tenantId}/payment-verification`)}
                  className="shrink-0 self-start sm:self-center font-bold text-xs min-h-[38px]"
                >
                  <span>Review Pembayaran</span>
                  <AiOutlineArrowRight />
                </Button>
              </div>
            )}

            {pendingReg > 0 && (
              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-900 flex items-center justify-center text-base shrink-0">
                    <AiOutlineTeam />
                  </div>
                  <div>
                    <strong className="block text-sky-950 font-bold">
                      {pendingReg} pendaftaran {template?.memberLabel?.toLowerCase() || 'anggota'} baru
                    </strong>
                    <span className="text-sky-800">
                      Permohonan bergabung komunitas menunggu persetujuan pengurus.
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/t/${tenantId}/approval`)}
                  className="shrink-0 self-start sm:self-center font-bold text-xs min-h-[38px] border-sky-300 text-sky-900 hover:bg-sky-100"
                >
                  <span>Tinjau Anggota</span>
                  <AiOutlineArrowRight />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/80 flex items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <AiOutlineCheckCircle className="text-emerald-600 text-base" />
              <span>Semua pembayaran dan pendaftaran operasional telah terverifikasi bersih.</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              Status Operasional Optimal
            </span>
          </div>
        )}
      </section>

      {/* ── 2. OPERATIONAL SUMMARY (Level 2 - Collection & Cashflow) ───────── */}
      <section aria-labelledby="operational-summary-heading" className="space-y-4">
        <h2 id="operational-summary-heading" className="sr-only">
          Ringkasan Operasional &amp; Keuangan
        </h2>

        {/* Hero Kolektibilitas Tagihan */}
        <StaffCollectionHero
          billing={billing}
          pendingPayCount={pendingPay}
          pendingRegCount={pendingReg}
          periodLabel={periodLabel}
          template={template}
          onOpenMatrix={() => navigate(`/t/${tenantId}/payment-matrix`)}
        />

        {/* Arus Kas Bersih (Net Cashflow) Baris Ringkas */}
        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Arus Kas Bersih Komunitas ({periodLabel})
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-xl sm:text-2xl font-mono font-black ${
                  finance.netCashflow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                <AnimatedCounter value={finance.netCashflow} formatter={formatRupiah} />
              </span>
              <span className="text-xs text-slate-500">Arus Kas Bersih</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Kas Masuk</span>
              <span className="font-mono font-bold text-slate-900">
                {formatRupiah(finance.totalIncome)}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Kas Keluar</span>
              <span className="font-mono font-bold text-slate-900">
                {formatRupiah(finance.totalExpense)}
              </span>
            </div>
            <Link
              to={`/t/${tenantId}/reports`}
              className="ml-2 text-xs font-semibold text-slate-800 hover:text-slate-900 underline shrink-0"
            >
              Laporan Kas →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 3. PENDING WORK & NAVIGATION (Level 3 - Quick Access) ─────────── */}
      <section aria-labelledby="staff-navigation-heading" className="space-y-3">
        <h2
          id="staff-navigation-heading"
          className="text-xs font-bold text-slate-500 uppercase tracking-wider"
        >
          Menu Operasional Pengurus
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <Link
            to={`/t/${tenantId}/payment-matrix`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineTable aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Matriks {template?.billLabel || 'Tagihan'}
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                Status per unit
              </span>
            </div>
          </Link>

          <Link
            to={`/t/${tenantId}/payment-verification`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineCheckCircle aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Verifikasi Bayar
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                {pendingPay > 0 ? `${pendingPay} pending` : 'Selesai'}
              </span>
            </div>
          </Link>

          <Link
            to={`/t/${tenantId}/residents`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineTeam aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Data {template?.memberLabel || 'Warga'}
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                {members.total} anggota
              </span>
            </div>
          </Link>

          <Link
            to={`/t/${tenantId}/expenses`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineWallet aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Pengeluaran Kas
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                Catat pengeluaran
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── 4. RECENT ACTIVITY & UNIT HEALTH (Level 4 - Analytics & Feed) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Kolom Kiri: Feed Aktivitas Pembayaran & Verifikasi */}
        <section aria-labelledby="staff-activity-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="staff-activity-heading"
              className="text-xs font-bold text-slate-500 uppercase tracking-wider"
            >
              Aktivitas Pembayaran Masuk
            </h2>
            <Link
              to={`/t/${tenantId}/payment-verification`}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition inline-flex items-center gap-1"
            >
              <span>Verifikasi Lengkap</span>
              <AiOutlineArrowRight className="text-[10px]" />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white divide-y divide-slate-100">
            {recentPayments.length > 0 ? (
              recentPayments.map((p, idx) => (
                <div key={p.id || idx} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {p.tenant_members?.full_name || p.userName || `Unit ${p.unit_id || '-'}`}
                    </p>
                    <span className="text-[11px] text-slate-500 block truncate">
                      Tagihan {template?.billLabel || 'Iuran'} · {formatRupiah(p.amount || 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={p.status || 'pending'} size="sm" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/t/${tenantId}/payment-verification`)}
                      className="text-[11px] px-2.5 py-1 min-h-[32px]"
                    >
                      Tinjau
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500">
                  Tidak ada transaksi pembayaran yang tertunda saat ini.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Kolom Kanan: Kesehatan Hunian / Slot & Kode Undangan */}
        <section aria-labelledby="health-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="health-heading"
              className="text-xs font-bold text-slate-500 uppercase tracking-wider"
            >
              Kesehatan Unit &amp; Anggota
            </h2>
            <Link
              to="/houses"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition inline-flex items-center gap-1"
            >
              <span>Kelola {template?.unitLabel || 'Unit'}</span>
              <AiOutlineArrowRight className="text-[10px]" />
            </Link>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200/80 bg-white space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] text-slate-500 font-medium block">
                  Hunian {template?.unitLabel || 'Unit'}
                </span>
                <div className="text-xl font-mono font-bold text-slate-900 mt-1">
                  <AnimatedCounter value={units.occupied} />{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    / {units.total} {template?.unitLabel?.toLowerCase() || 'unit'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {units.vacant} kosong / tersedia
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 font-medium block">
                  Total {template?.memberLabel || 'Anggota'}
                </span>
                <div className="text-xl font-mono font-bold text-slate-900 mt-1">
                  <AnimatedCounter value={members.total} />{' '}
                  <span className="text-xs text-slate-500 font-normal">terdaftar</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {pendingReg > 0 ? `${pendingReg} menunggu verifikasi` : 'Data lengkap'}
                </span>
              </div>
            </div>

            {/* Kode Undangan Kompak */}
            {activeTenant?.settings?.invite_code && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 truncate">
                  Kode Gabung:{' '}
                  <strong className="font-mono text-slate-900 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                    {activeTenant.settings.invite_code}
                  </strong>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyInviteLink}
                  icon={copiedLink ? AiOutlineCheck : AiOutlineCopy}
                  className="text-xs min-h-[34px] px-2.5"
                >
                  <span>{copiedLink ? 'Tersalin' : 'Salin Tautan'}</span>
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default StaffDashboard;
