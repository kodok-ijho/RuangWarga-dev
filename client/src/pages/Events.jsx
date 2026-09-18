import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  assignEventMember,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchEventMembers,
  fetchEvents,
  fetchMyEventAccess,
  fetchUsers,
  revokeEventMember,
} from '../services/dataService';
import { formatDateTime } from '../services/dataHelpers';
import { PageHeader, MobileList } from '../components/ui';
import { EventCard } from '../components/community';

const EMPTY_FORM = {
  title: '',
  event_code: '',
  event_date: '',
  end_date: '',
  location: '',
  description: '',
  documentation_url: '',
  status: 'draft',
};

const getStatusBadge = (status) => {
  switch(status) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'completed': return 'bg-blue-100 text-blue-700';
    case 'cancelled': return 'bg-red-100 text-red-600';
    case 'archived': return 'bg-yellow-100 text-yellow-700';
    case 'draft': default: return 'bg-gray-100 text-gray-600';
  }
};

const formatRoleBadge = (role, customTitle) => {
  switch (role) {
    case 'event_leader':
      return {
        label: customTitle ? `👑 Ketua Event (${customTitle})` : '👑 Ketua Event',
        className: 'bg-amber-100 text-amber-800 border-amber-300',
      };
    case 'event_treasurer':
      return {
        label: customTitle ? `💰 Bendahara Event (${customTitle})` : '💰 Bendahara Event',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };
    case 'coordinator_member':
    default:
      return {
        label: customTitle ? `👥 ${customTitle}` : '👥 Anggota / Sie Panitia',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      };
  }
};

export default function Events() {
  const { role, profile, session, isReadOnly } = useAuth();
  const toast = useToast();
  const token = session?.access_token;
  const profileId = profile?.id;
  const isAdmin = role === 'admin' && !isReadOnly;
  const isFinanceManager = role === 'admin' || role === 'bendahara';
  const [events, setEvents] = useState([]);
  const [access, setAccess] = useState({ events: [], global: {} });
  const [members, setMembers] = useState({});
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [memberForm, setMemberForm] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingEvent, setEditingEvent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventRows, accessData] = await Promise.all([
        fetchEvents(token, { role, profileId }),
        fetchMyEventAccess(token, { role, profileId }),
      ]);
      setEvents(Array.isArray(eventRows) ? eventRows : []);
      setAccess(accessData || { events: [], global: {} });
      if (isAdmin) {
        const userRows = await fetchUsers(token);
        setUsers((userRows || []).filter((user) => user.is_active !== false && user.approval_status !== 'rejected'));
      }
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil data event.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, profileId, role, toast, token]);

  useEffect(() => { load(); }, [load]);

  const loadMembers = async (eventId) => {
    try {
      const rows = await fetchEventMembers(token, eventId);
      setMembers((current) => ({ ...current, [eventId]: rows || [] }));
    } catch (error) {
      toast.error(error.message || 'Gagal mengambil anggota event.');
    }
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.event_code.trim() || !form.event_date) {
      toast.error('Judul, kode, dan tanggal mulai wajib diisi.');
      return;
    }
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        event_code: form.event_code.trim(),
        end_date: form.end_date || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        documentation_url: form.documentation_url.trim() || null,
      };

      if (editingEvent) {
        await updateEvent(token, editingEvent.id, payload);
        toast.success('Event berhasil diupdate.');
      } else {
        await createEvent(token, payload);
        toast.success('Event berhasil dibuat. Silakan assign Ketua dan Bendahara Event.');
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingEvent(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan event.');
    }
  };

  const removeEvent = async (id) => {
    if (!window.confirm('Hapus event ini beserta seluruh datanya?')) return;
    try {
      await deleteEvent(token, id);
      toast.success('Event berhasil dihapus.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Gagal menghapus event.');
    }
  };

  const assign = async (eventId) => {
    const value = memberForm[eventId] || {};
    if (!value.profile_id || !value.assignment_role) {
      toast.error('Pilih profil dan peran panitia.');
      return;
    }
    try {
      await assignEventMember(token, {
        event_id: eventId,
        profile_id: value.profile_id,
        assignment_role: value.assignment_role,
        custom_role_title: value.custom_role_title?.trim() || null,
      });
      toast.success('Panitia berhasil ditugaskan.');
      setMemberForm((current) => ({ ...current, [eventId]: {} }));
      await loadMembers(eventId);
    } catch (error) {
      toast.error(error.message || 'Gagal menyimpan penugasan panitia.');
    }
  };

  const revoke = async (eventId, assignmentId) => {
    if (!window.confirm('Cabut penugasan panitia ini?')) return;
    try {
      await revokeEventMember(token, assignmentId);
      toast.success('Penugasan panitia dicabut.');
      await loadMembers(eventId);
    } catch (error) {
      toast.error(error.message || 'Gagal mencabut penugasan.');
    }
  };

  const assignedEventIds = useMemo(() => new Set((access.events || []).map((item) => item.event_id)), [access.events]);

  const filteredEvents = events.filter(e => filterStatus === 'all' || e.status === filterStatus);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Kegiatan & Acara Warga"
        description="Master data event, dokumentasi kegiatan, dan susunan kepanitiaan komunitas."
        action={
          <div className="flex items-center gap-2">
            <select
              className="pv-input py-1.5 text-xs font-semibold"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Semua Status</option>
              <option value="draft">Draf</option>
              <option value="active">Sedang Berlangsung</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Dibatalkan</option>
              <option value="archived">Diarsipkan</option>
            </select>

            {isAdmin && (
              <button
                type="button"
                className="pv-btn-primary whitespace-nowrap text-xs shadow-xs"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setEditingEvent(null);
                  setShowForm((value) => !value);
                }}
              >
                {showForm ? 'Tutup Form' : '+ Buat Event'}
              </button>
            )}
          </div>
        }
      />

      {/* Form Tambah/Edit Event */}
      {showForm && isAdmin && (
        <form className="pv-card grid gap-3 p-5 md:grid-cols-2 border border-slate-200 bg-white shadow-xs" onSubmit={submitEvent}>
          <div className="md:col-span-2 pb-2 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">{editingEvent ? 'Edit Data Event' : 'Buat Event Baru'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Isi data kegiatan dan tautan Google Drive dokumentasi (opsional).</p>
          </div>
          <input className="pv-input text-xs sm:text-sm" placeholder="Judul event *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className="pv-input text-xs sm:text-sm" placeholder="Kode event (contoh: HUT-PV-2026) *" value={form.event_code} onChange={(e) => setForm({ ...form, event_code: e.target.value })} required />
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tanggal Mulai *<input className="pv-input mt-1 font-normal text-xs" type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required /></label>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tanggal Selesai (Opsional)<input className="pv-input mt-1 font-normal text-xs" type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <input className="pv-input text-xs sm:text-sm" placeholder="Lokasi kegiatan" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <select className="pv-input text-xs sm:text-sm font-semibold" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="draft">Draf</option>
            <option value="active">Sedang Berlangsung</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="archived">Diarsipkan (Terkunci)</option>
          </select>
          <input className="pv-input md:col-span-2 text-xs sm:text-sm" placeholder="Link Folder Dokumentasi Kegiatan (Google Drive) - Opsional" value={form.documentation_url} onChange={(e) => setForm({ ...form, documentation_url: e.target.value })} />
          <textarea className="pv-input md:col-span-2 text-xs sm:text-sm" rows="3" placeholder="Deskripsi atau keterangan kegiatan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-2 md:col-span-2 pt-2">
            <button className="pv-btn-primary text-xs" type="submit">Simpan Event</button>
            <button className="pv-btn-ghost text-xs" type="button" onClick={() => { setShowForm(false); setEditingEvent(null); }}>Batal</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="pv-card p-12 flex flex-col items-center justify-center text-sm text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-t-transparent mb-4"></div>
          Memuat data kegiatan...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="pv-card p-10 text-center text-sm text-slate-500 border border-slate-200">
          Tidak ada kegiatan yang sesuai dengan filter.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mobile Card List (< 768px) */}
          <div className="block md:hidden">
            <MobileList
              items={filteredEvents}
              keyExtractor={(event) => event.id}
              emptyMessage="Tidak ada kegiatan."
              renderItem={(event) => {
                const eventMembers = (members[event.id] || []).filter(m => !m.revoked_at);
                const leader = eventMembers.find(m => m.assignment_role === 'event_leader');
                const treasurer = eventMembers.find(m => m.assignment_role === 'event_treasurer');
                return (
                  <div key={event.id} className="space-y-2">
                    <EventCard
                      event={event}
                      isAdmin={isAdmin}
                      leader={leader}
                      treasurer={treasurer}
                      isPanitiaOpen={Boolean(members[event.id])}
                      onTogglePanitia={() => loadMembers(event.id)}
                      onEdit={() => {
                        setEditingEvent(event);
                        const toInputDate = (dStr) => {
                          if (!dStr) return '';
                          const d = new Date(dStr);
                          if (Number.isNaN(d.getTime())) return '';
                          const pad = (n) => String(n).padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        };
                        setForm({
                          title: event.title || '',
                          event_code: event.event_code || '',
                          event_date: toInputDate(event.event_date),
                          end_date: toInputDate(event.end_date),
                          location: event.location || '',
                          description: event.description || '',
                          documentation_url: event.documentation_url || '',
                          status: event.status || 'draft',
                        });
                        setShowForm(true);
                      }}
                      onDelete={() => removeEvent(event.id)}
                    />

                    {/* Panel Panitia Mobile */}
                    {members[event.id] && (
                      <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-bold uppercase tracking-wide text-slate-800">Susunan Kepanitiaan Event</p>
                          <span className="text-slate-500">{eventMembers.length} Panitia</span>
                        </div>
                        {eventMembers.length === 0 ? (
                          <p className="text-slate-400 italic py-1">Belum ada panitia yang ditugaskan.</p>
                        ) : (
                          <div className="space-y-1.5 mb-3">
                            {eventMembers.map((member) => {
                              const badge = formatRoleBadge(member.assignment_role, member.custom_role_title);
                              return (
                                <div key={member.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-200">
                                  <div>
                                    <span className="font-semibold text-slate-900">{member.profile_name || member.profile_id}</span>
                                    <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[10px] border ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  </div>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      className="text-[11px] font-bold text-red-600 hover:text-red-700 pv-focus-ring rounded-sm px-1"
                                      aria-label={`Cabut penugasan panitia ${member.profile_name || member.profile_id}`}
                                      onClick={() => revoke(event.id, member.id)}
                                    >
                                      Cabut
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {isAdmin && (
                          <div className="pt-2 border-t border-slate-200/60 space-y-2">
                            <p className="font-semibold text-slate-700">+ Tugaskan Panitia Baru</p>
                            <select
                              className="pv-input text-xs"
                              value={memberForm[event.id]?.profile_id || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], profile_id: e.target.value } })}
                            >
                              <option value="">Pilih warga aktif *</option>
                              {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                            </select>
                            <select
                              className="pv-input text-xs"
                              value={memberForm[event.id]?.assignment_role || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], assignment_role: e.target.value } })}
                            >
                              <option value="">Pilih Peran *</option>
                              <option value="event_leader">👑 Ketua Event</option>
                              <option value="event_treasurer">💰 Bendahara Event</option>
                              <option value="coordinator_member">👥 Anggota / Sie Panitia</option>
                            </select>
                            <input
                              className="pv-input text-xs"
                              placeholder="Nama Sie (misal: Sie Konsumsi)"
                              value={memberForm[event.id]?.custom_role_title || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], custom_role_title: e.target.value } })}
                            />
                            <button
                              type="button"
                              className="pv-btn-primary py-1 text-xs w-full"
                              onClick={() => assign(event.id)}
                            >
                              Simpan Penugasan
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>

          {/* Desktop Grid Layout (>= 768px) */}
          <div className="hidden md:grid md:grid-cols-2 gap-4">
            {filteredEvents.map((event) => {
              const eventMembers = (members[event.id] || []).filter(m => !m.revoked_at);
              const leader = eventMembers.find(m => m.assignment_role === 'event_leader');
              const treasurer = eventMembers.find(m => m.assignment_role === 'event_treasurer');

              return (
                <div key={event.id} className="space-y-2">
                  <EventCard
                    event={event}
                    isAdmin={isAdmin}
                    leader={leader}
                    treasurer={treasurer}
                    isPanitiaOpen={Boolean(members[event.id])}
                    onTogglePanitia={() => loadMembers(event.id)}
                    onEdit={() => {
                      setEditingEvent(event);
                      const toInputDate = (dStr) => {
                        if (!dStr) return '';
                        const d = new Date(dStr);
                        if (Number.isNaN(d.getTime())) return '';
                        const pad = (n) => String(n).padStart(2, '0');
                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      };
                      setForm({
                        title: event.title || '',
                        event_code: event.event_code || '',
                        event_date: toInputDate(event.event_date),
                        end_date: toInputDate(event.end_date),
                        location: event.location || '',
                        description: event.description || '',
                        documentation_url: event.documentation_url || '',
                        status: event.status || 'draft',
                      });
                      setShowForm(true);
                    }}
                    onDelete={() => removeEvent(event.id)}
                  />

                  {/* Panel Pengelolaan Anggota / Panitia Desktop */}
                  {members[event.id] && (
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-bold uppercase tracking-wide text-slate-800">Susunan Kepanitiaan Event</p>
                        <span className="text-slate-500">{eventMembers.length} Panitia Aktif</span>
                      </div>

                      {eventMembers.length === 0 ? (
                        <p className="text-slate-400 italic py-2">Belum ada panitia yang ditugaskan. Ketua dan Bendahara Event wajib diisi.</p>
                      ) : (
                        <div className="space-y-2 mb-4">
                          {eventMembers.map((member) => {
                            const badge = formatRoleBadge(member.assignment_role, member.custom_role_title);
                            return (
                              <div key={member.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-200">
                                <div>
                                  <span className="font-semibold text-slate-900">{member.profile_name || member.profile_id}</span>
                                  <span className={`ml-2 inline-block px-2 py-0.5 rounded text-xs border ${badge.className}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      className="text-xs text-red-600 hover:text-red-700 hover:underline px-2 py-1 pv-focus-ring rounded-md"
                                      aria-label={`Cabut penugasan panitia ${member.profile_name || member.profile_id}`}
                                      onClick={() => revoke(event.id, member.id)}
                                    >
                                      Cabut
                                    </button>
                                  )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isAdmin && (
                        <div className="mt-3 pt-3 border-t border-slate-200/60">
                          <p className="font-semibold text-slate-700 mb-2">+ Tugaskan Panitia Baru</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select
                              className="pv-input text-xs"
                              value={memberForm[event.id]?.profile_id || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], profile_id: e.target.value } })}
                            >
                              <option value="">Pilih warga aktif *</option>
                              {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                            </select>

                            <select
                              className="pv-input text-xs"
                              value={memberForm[event.id]?.assignment_role || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], assignment_role: e.target.value } })}
                            >
                              <option value="">Pilih Peran *</option>
                              <option value="event_leader">👑 Ketua Event</option>
                              <option value="event_treasurer">💰 Bendahara Event</option>
                              <option value="coordinator_member">👥 Anggota / Sie Panitia</option>
                            </select>

                            <input
                              className="pv-input text-xs sm:col-span-2"
                              placeholder="Nama Sie / Keterangan Jabatan (Opsional, contoh: Sie Konsumsi, Sie Perlengkapan)"
                              value={memberForm[event.id]?.custom_role_title || ''}
                              onChange={(e) => setMemberForm({ ...memberForm, [event.id]: { ...memberForm[event.id], custom_role_title: e.target.value } })}
                            />

                            <button
                              type="button"
                              className="pv-btn-primary py-1.5 text-xs sm:col-span-2"
                              onClick={() => assign(event.id)}
                            >
                              Simpan Penugasan Panitia
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
