import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AiOutlineCreditCard,
  AiOutlineFileText,
  AiOutlineTeam,
  AiOutlineArrowRight,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
} from 'react-icons/ai';
import { ResidentBillingHero } from './ResidentBillingHero';
import { StatusBadge } from '../ui';
import { formatRupiah } from '../../services/dataHelpers';
import { TenantContext } from '../../context/TenantContext';
import { isLegacyQrisEnabled } from '../../services/tenantOperationalService';

export function CitizenDashboard({
  tenantId,
  template,
  dashData,
  periodLabel,
  isReadOnly = false,
  userProfile,
  activeTenant: propActiveTenant,
}) {
  const navigate = useNavigate();
  const tenantCtx = useContext(TenantContext);
  const activeTenant = propActiveTenant || tenantCtx?.activeTenant;

  // Resolve obligation and unit strictly from real individual data
  const myObligation = dashData?.myObligation || null;
  const myUnit = dashData?.myUnit || null;

  // Recent activity: derive from recent payments
  // Catatan: getAnnouncementsByTenant disembunyikan sampai RTRW-3
  const recentPayments = dashData?.recentPayments || [];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── 1. CURRENT OBLIGATION (Level 1 - Priority Hub) ──────────────────── */}
      <section aria-labelledby="obligation-heading">
        <h2 id="obligation-heading" className="sr-only">
          Kewajiban Tagihan Saat Ini
        </h2>
        <ResidentBillingHero
          myBill={myObligation}
          myUnit={myUnit}
          periodLabel={periodLabel}
          template={template}
          isReadOnly={isReadOnly}
          onPayClick={() => navigate(`/t/${tenantId}/payment-matrix`)}
        />
      </section>

      {/* ── 2. QUICK ACTIONS (Level 2 - Max 4 Actions on Mobile) ───────────── */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <h2
          id="quick-actions-heading"
          className="text-xs font-bold text-slate-500 uppercase tracking-wider"
        >
          Menu Cepat
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {/* Action 1: Bayar Tagihan */}
          <Link
            to={`/t/${tenantId}/payment-matrix`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineCreditCard aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Bayar {template?.billLabel || 'Tagihan'}
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                {isLegacyQrisEnabled(activeTenant) ? 'Rincian & QRIS' : 'Rincian & cara bayar'}
              </span>
            </div>
          </Link>

          {/* Action 2: Riwayat Pembayaran */}
          <Link
            to={`/t/${tenantId}/payment-matrix`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineFileText aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Riwayat Bayar
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                Kuitansi digital
              </span>
            </div>
          </Link>

          {/* Action 3: Pengumuman — Disembunyikan sampai RTRW-3 */}

          {/* Action 4: Direktori Anggota/Warga */}
          <Link
            to={`/t/${tenantId}/residents`}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 transition group min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-base shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
              <AiOutlineTeam aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Daftar {template?.memberLabel || 'Anggota'}
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                Kontak komunitas
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── 3. RECENT ACTIVITY (Level 3 - Progressive Disclosure) ── */}
      <div className="grid grid-cols-1 gap-6 items-start">
        {/* Recent Activity Timeline */}
        <section aria-labelledby="activity-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="activity-heading"
              className="text-xs font-bold text-slate-500 uppercase tracking-wider"
            >
              Aktivitas Terbaru
            </h2>
            <Link
              to={`/t/${tenantId}/payment-matrix`}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition inline-flex items-center gap-1"
            >
              <span>Semua Riwayat</span>
              <AiOutlineArrowRight className="text-[10px]" />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white divide-y divide-slate-100">
            {recentPayments.length > 0 ? (
              recentPayments.map((item, idx) => (
                <div key={item.id || idx} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm shrink-0">
                      {item.status === 'verified' || item.status === 'approved' ? (
                        <AiOutlineCheckCircle className="text-emerald-600" />
                      ) : (
                        <AiOutlineClockCircle className="text-amber-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        Pembayaran {template?.billLabel || 'Iuran'} Periode {item.period || periodLabel}
                      </p>
                      <span className="text-[11px] text-slate-500 block truncate">
                        {item.amount ? formatRupiah(item.amount) : 'Nominal belum tersedia'}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={item.status || 'pending'} size="sm" />
                </div>
              ))
            ) : (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500">
                  Belum ada aktivitas pembayaran yang tercatat pada periode {periodLabel}.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Kolom Kanan: Community Information (Pengumuman) — Disembunyikan sampai RTRW-3 */}
      </div>
    </div>
  );
}

export default CitizenDashboard;
