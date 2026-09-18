import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AiOutlineSearch, AiOutlineFilter, AiOutlineNotification } from 'react-icons/ai';
import { useTenant } from '../context/TenantContext';
import { PageHeader, MobileList, Input, EmptyState } from '../components/ui';
import { AnnouncementCard, AnnouncementDetailDrawer } from '../components/community';
import { getAnnouncementsByTenant } from '../services/communityData';

export default function Announcements() {
  const { tenantId: routeTenantId } = useParams();
  const { currentTenant, activeTenantId } = useTenant();
  const tenantId = routeTenantId || activeTenantId || currentTenant?.id;

  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const announcements = useMemo(() => {
    return getAnnouncementsByTenant(tenantId, {
      search,
      urgency: urgencyFilter,
    });
  }, [tenantId, search, urgencyFilter]);

  const urgentCount = useMemo(() => {
    return getAnnouncementsByTenant(tenantId).filter((a) => a.urgency === 'urgent').length;
  }, [tenantId]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Pengumuman Warga"
        description={`Papan informasi resmi dan pengumuman terkini ${currentTenant?.name || 'Komunitas'}`}
        action={
          urgentCount > 0 && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 flex items-center gap-1.5 shadow-2xs">
              <span>🔥</span>
              <span>{urgentCount} Pengumuman Mendesak</span>
            </div>
          )
        }
      />

      {/* Filter & Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <AiOutlineSearch className="text-base" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pengumuman (misal: kerja bakti, fogging, lampu)..."
              className="pv-input pl-9 text-xs sm:text-sm py-2"
            />
          </div>

          {/* Urgency Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'urgent', label: '🔥 Mendesak' },
              { id: 'important', label: '⚠️ Penting' },
              { id: 'info', label: 'ℹ️ Info' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setUrgencyFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  urgencyFilter === tab.id
                    ? 'bg-forest-800 text-gold-400 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List / Grid Pengumuman */}
      {announcements.length === 0 ? (
        <EmptyState
          icon={AiOutlineNotification}
          title="Tidak Ada Pengumuman"
          description={
            search || urgencyFilter !== 'all'
              ? 'Tidak ditemukan pengumuman yang sesuai dengan kata kunci pencarian atau filter yang dipilih.'
              : 'Belum ada pengumuman yang diterbitkan untuk saat ini.'
          }
          action={
            search || urgencyFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setUrgencyFilter('all');
                }}
                className="pv-btn-ghost text-xs shadow-2xs"
              >
                Reset Pencarian & Filter
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Mobile Card List (< 768px) */}
          <div className="block md:hidden">
            <MobileList
              items={announcements}
              keyExtractor={(item) => item.id}
              emptyMessage="Tidak ada pengumuman."
              renderItem={(item) => (
                <AnnouncementCard
                  announcement={item}
                  onSelect={(ann) => setSelectedAnnouncement(ann)}
                />
              )}
            />
          </div>

          {/* Desktop Grid Layout (>= 768px) */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {announcements.map((item) => (
              <AnnouncementCard
                key={item.id}
                announcement={item}
                onSelect={(ann) => setSelectedAnnouncement(ann)}
              />
            ))}
          </div>
        </>
      )}

      {/* Detail Drawer */}
      <AnnouncementDetailDrawer
        isOpen={!!selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        announcement={selectedAnnouncement}
      />
    </div>
  );
}
