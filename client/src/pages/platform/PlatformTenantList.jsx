import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AiOutlineSearch,
  AiOutlineFilter,
  AiOutlineReload,
  AiOutlineArrowRight,
  AiOutlineCheckCircle,
  AiOutlineClockCircle,
  AiOutlineWarning,
  AiOutlineTeam,
  AiOutlineAppstore,
} from 'react-icons/ai';
import { supabase } from '../../services/supabaseClient';
import { useTenant } from '../../hooks/useTenant';
import { getTenantTemplate } from '../../config/tenantTemplates';

const STATUS_CONFIG = {
  all: { label: 'Semua Status' },
  active: {
    label: 'Aktif',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <AiOutlineCheckCircle />,
  },
  trial: {
    label: 'Trial',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: <AiOutlineClockCircle />,
  },
  read_only: {
    label: 'Read-Only',
    style: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: <AiOutlineWarning />,
  },
};

const TYPE_CONFIG = {
  all: { label: 'Semua Tipe' },
  rt_rw: { label: 'RT/RW', icon: '🏘️' },
  kos: { label: 'Kos-kosan', icon: '🏢' },
  arisan: { label: 'Arisan', icon: '🎲' },
  kelas: { label: 'Kelas', icon: '📚' },
};

export default function PlatformTenantList() {
  const navigate = useNavigate();
  const { switchTenant, isDemo } = useTenant();

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);

    // Jika demo mode, siapkan data mock
    if (isDemo) {
      setTenants([
        {
          id: 'demo-tenant-rtrw',
          name: 'Palm Village RT 05',
          type: 'rt_rw',
          created_at: '2026-01-01T08:00:00Z',
          subscription: {
            status: 'active',
            trial_ends_at: null,
            current_period_end: '2026-12-31T23:59:59Z',
          },
          total_units: 45,
          total_members: 42,
        },
        {
          id: 'demo-tenant-kos',
          name: 'Kos Melati Harmoni',
          type: 'kos',
          created_at: '2026-09-01T10:30:00Z',
          subscription: {
            status: 'trial',
            trial_ends_at: new Date(Date.now() + 12 * 86400000).toISOString(),
            current_period_end: null,
          },
          total_units: 16,
          total_members: 14,
        },
        {
          id: 'demo-tenant-arisan',
          name: 'Arisan Mawar Berkah',
          type: 'arisan',
          created_at: '2026-09-05T14:15:00Z',
          subscription: {
            status: 'trial',
            trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            current_period_end: null,
          },
          total_units: 20,
          total_members: 20,
        },
        {
          id: 'demo-tenant-kelas',
          name: 'Kelas Belajar Mandiri',
          type: 'kelas',
          created_at: '2026-08-15T09:00:00Z',
          subscription: {
            status: 'read_only',
            trial_ends_at: '2026-08-30T09:00:00Z',
            current_period_end: null,
          },
          total_units: 10,
          total_members: 9,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      // Query langsung ke tabel Supabase (diizinkan oleh policy platform_admin_select_all_tenants)
      const { data, error: qErr } = await supabase
        .from('tenants')
        .select(`
          id,
          name,
          type,
          owner_id,
          created_at,
          tenant_subscriptions (
            status,
            trial_started_at,
            trial_ends_at,
            current_period_end
          )
        `)
        .order('created_at', { ascending: false });

      if (qErr) throw qErr;

      const formatted = (data || []).map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        owner_id: t.owner_id,
        created_at: t.created_at,
        subscription: Array.isArray(t.tenant_subscriptions)
          ? t.tenant_subscriptions[0] || { status: 'trial' }
          : t.tenant_subscriptions || { status: 'trial' },
      }));

      setTenants(formatted);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PlatformTenantList] Gagal memuat tenant:', err);
      setError(err.message || 'Gagal memuat daftar tenant dari database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // Metrik ringkasan
  const stats = useMemo(() => {
    const total = tenants.length;
    let active = 0;
    let trial = 0;
    let readOnly = 0;

    tenants.forEach((t) => {
      const st = t.subscription?.status || 'trial';
      if (st === 'active') active += 1;
      else if (st === 'trial') trial += 1;
      else if (st === 'read_only') readOnly += 1;
    });

    return { total, active, trial, readOnly };
  }, [tenants]);

  // Filter list
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchType = filterType === 'all' || t.type === filterType;
      const currentStatus = t.subscription?.status || 'trial';
      const matchStatus = filterStatus === 'all' || currentStatus === filterStatus;

      return matchSearch && matchType && matchStatus;
    });
  }, [tenants, searchQuery, filterType, filterStatus]);

  const handleOpenTenant = (tenantId) => {
    switchTenant(tenantId);
    navigate(`/t/${tenantId}/dashboard`);
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🏢</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
              Manajemen Seluruh Tenant
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Pantau semua komunitas, komplek RT/RW, kos-kosan, arisan, dan kelas yang aktif di platform RuangWarga.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchTenants}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 shadow-xs transition-colors self-start sm:self-auto"
        >
          <AiOutlineReload className={loading ? 'animate-spin' : ''} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Tenant</span>
            <span className="text-lg">🌐</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 font-display mt-2">{stats.total}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Layanan terdaftar di platform</span>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Aktif Berlangganan</span>
            <span className="text-lg">💎</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 font-display mt-2">{stats.active}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Membayar &amp; memiliki akses penuh</span>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">Masa Percobaan (Trial)</span>
            <span className="text-lg">⏳</span>
          </div>
          <p className="text-2xl font-bold text-amber-800 font-display mt-2">{stats.trial}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Masa trial 15 hari gratis</span>
        </div>

        <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Read-Only</span>
            <span className="text-lg">🔒</span>
          </div>
          <p className="text-2xl font-bold text-rose-700 font-display mt-2">{stats.readOnly}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Trial habis / belum perpanjang</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <AiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari tenant berdasarkan nama atau ID..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white shadow-xs"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tipe filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-slate-900 focus:bg-white shadow-xs"
          >
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.icon ? `${cfg.icon} ` : ''}
                {cfg.label}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-slate-900 focus:bg-white shadow-xs"
          >
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <strong>Terjadi Kesalahan:</strong> {error}
        </div>
      )}

      {/* Table / List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <AiOutlineAppstore className="text-4xl mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">Tidak ada tenant yang cocok</p>
            <p className="text-xs text-slate-500 mt-1">Coba sesuaikan kata kunci pencarian atau filter status.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-3.5 px-4">Nama Layanan / Tenant</th>
                  <th className="py-3.5 px-4">Tipe Vertikal</th>
                  <th className="py-3.5 px-4">Status Langganan</th>
                  <th className="py-3.5 px-4">Terdaftar Sejak</th>
                  <th className="py-3.5 px-4">Periode / Sisa Waktu</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.map((item) => {
                  const tmpl = getTenantTemplate(item.type);
                  const st = item.subscription?.status || 'trial';
                  const badgeCfg = STATUS_CONFIG[st] || STATUS_CONFIG.trial;

                  let timeDesc = '-';
                  if (st === 'trial' && item.subscription?.trial_ends_at) {
                    const diffDays = Math.ceil(
                      (new Date(item.subscription.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)
                    );
                    timeDesc = diffDays > 0 ? `${diffDays} hari tersisa` : 'Trial kedaluwarsa';
                  } else if (st === 'active' && item.subscription?.current_period_end) {
                    timeDesc = `Hingga ${new Date(item.subscription.current_period_end).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`;
                  } else if (st === 'read_only') {
                    timeDesc = 'Perlu perpanjangan';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm font-display">{item.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{item.id}</div>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold">
                          <span>{tmpl.icon}</span>
                          <span>{tmpl.name}</span>
                        </span>
                      </td>

                      {/* Subscription status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md border uppercase ${badgeCfg.style}`}
                        >
                          {badgeCfg.icon}
                          <span>{badgeCfg.label}</span>
                        </span>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '-'}
                      </td>

                      {/* Period description */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-medium ${
                            st === 'active'
                              ? 'text-emerald-700 font-semibold'
                              : st === 'trial'
                              ? 'text-amber-800 font-semibold'
                              : 'text-rose-700 font-semibold'
                          }`}
                        >
                          {timeDesc}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenTenant(item.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-all shadow-xs"
                          title="Buka dashboard operasional tenant ini"
                        >
                          <span>Buka</span>
                          <AiOutlineArrowRight />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
