import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { fetchAuditLogs, IS_DEMO } from '../services/dataService';
import { formatDateTime, formatRupiah, hasMinRole } from '../services/dataHelpers';
import {
  AiOutlineSearch,
  AiOutlineFilter,
  AiOutlineClockCircle,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { EmptyState, SkeletonTable } from '../components/ui';

const ACTION_OPTIONS = [
  { value: '', label: 'Semua Aksi' },
  { value: 'login.success', label: 'Login Berhasil' },
  { value: 'login.failed', label: 'Login Gagal' },
  { value: 'profile.update', label: 'Update Profil' },
  { value: 'payment.submit', label: 'Kirim Bukti Bayar' },
  { value: 'payment.approve', label: 'Verifikasi Pembayaran' },
  { value: 'payment.reject', label: 'Tolak Pembayaran' },
  { value: 'expense.create', label: 'Catat Pengeluaran' },
  { value: 'expense.update', label: 'Update Pengeluaran' },
  { value: 'expense.delete', label: 'Hapus Pengeluaran' },
  { value: 'settings.update', label: 'Ubah Pengaturan' },
  { value: 'page.view', label: 'Akses Halaman' },
];

export default function Logs() {
  const { role, session } = useAuth();
  const token = session?.access_token;
  const toast = useToast();

  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Guard: Admin-only
  if (!hasMinRole(role, 'admin')) {
    return <Navigate to="/" replace />;
  }

  const loadLogs = useCallback(
    async (currentOffset, reset = false) => {
      if (!token && !IS_DEMO) return;
      try {
        if (reset) {
          setIsLoading(true);
        } else {
          setIsMoreLoading(true);
        }

        const filters = {
          action: filterAction || undefined,
          search: search.trim() || undefined,
          limit,
          offset: currentOffset,
        };

        const result = await fetchAuditLogs(token, filters);
        const newLogs = result?.logs || [];
        const count = result?.total_count || 0;

        if (reset) {
          setLogs(newLogs);
        } else {
          setLogs((prev) => [...prev, ...newLogs]);
        }
        setTotalCount(count);
      } catch (err) {
        toast.error('Gagal mengambil data sistem log.');
      } finally {
        setIsLoading(false);
        setIsMoreLoading(false);
      }
    },
    [token, filterAction, search, toast]
  );

  // Load logs on filter change
  useEffect(() => {
    setOffset(0);
    loadLogs(0, true);
  }, [filterAction, search, loadLogs]);

  const handleLoadMore = () => {
    const nextOffset = offset + limit;
    setOffset(nextOffset);
    loadLogs(nextOffset, false);
  };

  const getActionBadgeColor = (action) => {
    if (action.startsWith('login.success')) {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
    if (action.startsWith('login.failed') || action.includes('delete') || action.includes('reject')) {
      return 'bg-red-50 text-red-700 border border-red-200';
    }
    if (action.includes('payment') || action.includes('expense')) {
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    }
    if (action.includes('settings') || action.includes('update')) {
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    }
    return 'bg-forest-50 text-forest-700 border border-forest-200';
  };

  const formatMetadataSummary = (log) => {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : (log.metadata || {});
    
    if (log.action === 'page.view') {
      return `Membuka halaman "${meta.page || log.entity_id || ''}"`;
    }
    if (log.action.startsWith('login')) {
      return `Login ${meta.status === 'success' ? 'Berhasil' : 'Gagal'} (IP: ${log.ip_address || meta.ip || '—'})`;
    }
    if (log.action.includes('expense')) {
      const parts = [];
      const prefix = log.action === 'expense.create' ? 'Catat Baru' : (log.action === 'expense.delete' ? 'Hapus' : 'Update');
      parts.push(prefix);
      if (meta.category) parts.push(`Kategori: ${meta.category}`);
      if (meta.amount) parts.push(formatRupiah(meta.amount));
      if (meta.details || meta.description) parts.push(meta.details || meta.description);
      if (meta.has_file === true || meta.has_file === 'true' || meta.receipt_file_url) {
        parts.push('📎 Bukti Kwitansi Baru');
      }
      return parts.join(' · ');
    }
    if (log.action.includes('payment')) {
      const parts = [];
      const prefix = log.action === 'payment.submit' ? 'Kirim Pembayaran' : (log.action === 'payment.approve' ? 'Verifikasi Lunas' : 'Tolak Bukti');
      parts.push(prefix);
      if (meta.amount) parts.push(formatRupiah(meta.amount));
      if (meta.details || meta.description) parts.push(meta.details || meta.description);
      if (meta.note) parts.push(`Catatan: "${meta.note}"`);
      return parts.join(' · ');
    }
    if (log.action.includes('settings')) {
      return `Ubah Pengaturan · ${meta.details || 'Parameter diperbarui'}`;
    }

    // Fallback
    const keys = Object.keys(meta);
    if (keys.length > 0) {
      return keys.map(k => `${k}: ${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : meta[k]}`).join(', ');
    }
    return '—';
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-forest-900">Sistem Log Keamanan &amp; Akses</h2>
        <p className="text-sm text-forest-500">
          Pantau seluruh aktivitas administratif, log keamanan login, dan audit transaksi komplek.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="pv-card p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3 no-print">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400">
              <AiOutlineSearch size={18} />
            </span>
            <input
              type="text"
              placeholder="Cari email aktor atau aksi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pv-input pl-9 text-sm w-full"
            />
          </div>

          {/* Action Filter */}
          <div className="relative min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400">
              <AiOutlineFilter size={18} />
            </span>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="pv-input pl-9 text-sm w-full"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Counter Badge */}
        <div className="text-xs text-forest-500 font-medium text-right shrink-0">
          Menampilkan <span className="font-semibold text-forest-800">{logs.length}</span> dari{' '}
          <span className="font-semibold text-forest-800">{totalCount}</span> log
        </div>
      </div>

      {/* Unified Table Card */}
      {isLoading ? (
        <SkeletonTable cols={6} rows={6} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="📜"
          title={
            search || filterAction
              ? 'Tidak Ditemukan Log Aktivitas'
              : 'Belum Ada Log Aktivitas'
          }
          description={
            search || filterAction
              ? 'Tidak ada rekaman log audit yang sesuai dengan kata kunci pencarian atau tipe aksi yang dipilih.'
              : 'Semua rekaman aktivitas login, audit data keuangan, dan perubahan sistem akan tercatat otomatis di sini.'
          }
          action={
            search || filterAction ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterAction('');
                }}
                className="pv-btn-ghost text-xs shadow-2xs"
              >
                Reset Filter & Pencarian
              </button>
            ) : null
          }
        />
      ) : (
        <div className="pv-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[160px]">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[220px]">Aktor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[150px]">Aksi</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[120px]">Entitas</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Rincian</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[120px]">Alamat IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Waktu */}
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDateTime(log.created_at || log.timestamp)}
                    </td>

                    {/* Aktor */}
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="font-semibold text-slate-900 leading-tight">
                        {log.actor_name || 'Sistem'}
                      </div>
                      {log.actor_email && (
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 select-all">
                          {log.actor_email}
                        </div>
                      )}
                    </td>

                    {/* Aksi Badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                        log.action?.includes('delete') || log.action?.includes('reject') || log.action?.includes('failed')
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : log.action?.includes('approve') || log.action?.includes('success')
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Entitas */}
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                      {log.entity || log.target || '—'}
                    </td>

                    {/* Rincian */}
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={log.details || log.description}>
                      {log.details || log.description || '—'}
                    </td>

                    {/* IP */}
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load More Button */}
      {!isLoading && logs.length < totalCount && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={isMoreLoading}
            className="pv-btn-ghost text-xs border-forest-200 hover:border-forest-300 text-forest-700 px-6 py-2.5 flex items-center gap-2"
          >
            {isMoreLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-forest-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Memuat...
              </>
            ) : (
              'Muat Lebih Banyak Log'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
