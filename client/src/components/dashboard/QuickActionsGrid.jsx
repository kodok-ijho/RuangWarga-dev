import React from 'react';
import { Link } from 'react-router-dom';
import {
  AiOutlineTable,
  AiOutlineTeam,
  AiOutlineWallet,
  AiOutlineBarChart,
  AiOutlineSetting,
  AiOutlineArrowRight,
  AiOutlineNotification,
} from 'react-icons/ai';
import { HiOutlineSparkles } from 'react-icons/hi';

export function QuickActionsGrid({
  tenantId,
  template,
  isStaff = false,
  isTenantAdmin = false,
  className = '',
}) {
  const billLabel = template?.billLabel || 'Iuran';
  const memberLabel = template?.memberLabel || 'Warga';

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Akses Cepat &amp; Fitur Operasional
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Matriks Tagihan */}
        <Link
          to={`/t/${tenantId}/payment-matrix`}
          className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-card hover:border-slate-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-forest-50 text-forest-800 group-hover:bg-forest-800 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineTable />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-forest-800 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-forest-900 leading-tight">
              Matriks {billLabel}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Status bayar per unit
            </p>
          </div>
        </Link>

        {/* 2. Direktori Warga */}
        <Link
          to="/residents"
          className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-card hover:border-slate-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-forest-800 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineTeam />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-forest-800 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-forest-900 leading-tight">
              Daftar {memberLabel}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Direktori &amp; kontak
            </p>
          </div>
        </Link>

        {/* 3. Pengeluaran Kas */}
        <Link
          to={isStaff ? `/t/${tenantId}/expenses` : '/expenses'}
          className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-card hover:border-slate-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-forest-800 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineWallet />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-forest-800 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-forest-900 leading-tight">
              Pengeluaran Kas
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Catatan biaya &amp; nota
            </p>
          </div>
        </Link>

        {/* 4. Laporan Keuangan */}
        <Link
          to={isStaff ? `/t/${tenantId}/reports` : '/reports'}
          className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-card hover:border-slate-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-forest-800 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineBarChart />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-forest-800 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-forest-900 leading-tight">
              Laporan Keuangan
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Arus kas &amp; saldo kas
            </p>
          </div>
        </Link>

        {/* 5. Pengumuman Komunitas */}
        <Link
          to={`/t/${tenantId}/announcements`}
          className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-card hover:border-slate-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-forest-800 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineNotification />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-forest-800 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-forest-900 leading-tight">
              Pengumuman
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Papan info warga
            </p>
          </div>
        </Link>

        {/* Khusus Arisan */}
        {template?.features?.hasArisanDraw && (
          <>
            <Link
              to={`/t/${tenantId}/arisan/rounds`}
              className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/80 shadow-xs hover:border-purple-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📋</span>
                <AiOutlineArrowRight className="text-purple-400 group-hover:text-purple-800 transition-colors text-xs" />
              </div>
              <div className="mt-2">
                <h4 className="text-xs sm:text-sm font-bold text-purple-950 leading-tight">
                  Putaran Arisan
                </h4>
                <p className="text-[11px] text-purple-700 mt-0.5 truncate">
                  Kelola siklus putaran
                </p>
              </div>
            </Link>

            <Link
              to={`/t/${tenantId}/arisan/draw`}
              className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 shadow-xs hover:border-amber-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">🎲</span>
                <AiOutlineArrowRight className="text-amber-500 group-hover:text-amber-800 transition-colors text-xs" />
              </div>
              <div className="mt-2">
                <h4 className="text-xs sm:text-sm font-bold text-amber-950 leading-tight">
                  Kocok Undian
                </h4>
                <p className="text-[11px] text-amber-700 mt-0.5 truncate">
                  Ruang undi digital
                </p>
              </div>
            </Link>
          </>
        )}

        {/* Khusus Listing Publik (Kos & RT) */}
        {(template?.type === 'kos' || template?.type === 'rt_rw') && (
          <Link
            to={`/t/${tenantId}/listings/post`}
            className="p-4 rounded-xl bg-amber-50/40 border border-amber-200/70 shadow-xs hover:border-amber-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-base">
                <HiOutlineSparkles />
              </div>
              <AiOutlineArrowRight className="text-amber-400 group-hover:text-amber-800 transition-colors text-xs" />
            </div>
            <div className="mt-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-amber-900 leading-tight">
                {template?.type === 'kos' ? 'Iklan Kamar' : 'Pasang Iklan UMKM'}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Direktori publik
              </p>
            </div>
          </Link>
        )}

        {/* Pengaturan Komunitas (Admin) */}
        {isTenantAdmin && (
          <Link
            to={`/t/${tenantId}/setup`}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-subtle transition-all flex flex-col justify-between group min-h-[104px]"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center text-base">
                <AiOutlineSetting />
              </div>
              <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-800 transition-colors text-xs" />
            </div>
            <div className="mt-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-slate-900 leading-tight">
                Pengaturan Komplek
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Unit, tarif &amp; denda
              </p>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

export default QuickActionsGrid;
