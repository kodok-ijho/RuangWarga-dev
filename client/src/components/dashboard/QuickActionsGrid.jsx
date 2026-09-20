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
  const communityLabel = template?.communityLabel || 'Komunitas';

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
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineTable aria-hidden="true" />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-slate-900 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-slate-900 leading-tight">
              Matriks {billLabel}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Status bayar per unit
            </p>
          </div>
        </Link>

        {/* 2. Direktori Anggota */}
        <Link
          to="/residents"
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineTeam aria-hidden="true" />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-slate-900 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-slate-900 leading-tight">
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
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineWallet aria-hidden="true" />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-slate-900 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-slate-900 leading-tight">
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
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineBarChart aria-hidden="true" />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-slate-900 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-slate-900 leading-tight">
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
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 transition-all flex flex-col justify-between group min-h-[104px]"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-base transition-colors">
              <AiOutlineNotification aria-hidden="true" />
            </div>
            <AiOutlineArrowRight className="text-slate-300 group-hover:text-slate-900 transition-colors text-xs" />
          </div>
          <div className="mt-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-slate-900 leading-tight">
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
              className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/80 transition-all flex flex-col justify-between group min-h-[104px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📋</span>
                <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-900 transition-colors text-xs" />
              </div>
              <div className="mt-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                  Putaran Arisan
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  Kelola siklus putaran
                </p>
              </div>
            </Link>

            <Link
              to={`/t/${tenantId}/arisan/draw`}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/80 transition-all flex flex-col justify-between group min-h-[104px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">🎲</span>
                <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-900 transition-colors text-xs" />
              </div>
              <div className="mt-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                  Kocok Undian
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
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
            className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/80 transition-all flex flex-col justify-between group min-h-[104px]"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-base">
                <HiOutlineSparkles aria-hidden="true" />
              </div>
              <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-900 transition-colors text-xs" />
            </div>
            <div className="mt-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
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
            className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/80 transition-all flex flex-col justify-between group min-h-[104px]"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center text-base">
                <AiOutlineSetting aria-hidden="true" />
              </div>
              <AiOutlineArrowRight className="text-slate-400 group-hover:text-slate-900 transition-colors text-xs" />
            </div>
            <div className="mt-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                Pengaturan {communityLabel}
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
