import React from 'react';
import { Card, Badge, StatusBadge } from '../ui';
import { roleLabel, roleColor, occupancyStatusLabel, occupancyStatusColor } from '../../services/dataHelpers';
import { AiOutlinePhone, AiOutlineWhatsApp, AiOutlineRight } from 'react-icons/ai';

/**
 * ResidentCard (TASK-014 & TASK-015)
 * Kartu kontak penghuni yang dioptimasi untuk mobile touch target (>= 44px).
 * Memprioritaskan:
 * 1. Identitas Unit & Nama Penghuni
 * 2. Status Akun & Status Tinggal
 * 3. Aksi Kontak Cepat (WhatsApp / Telepon)
 */
export function ResidentCard({
  profile,
  unit,
  template = {},
  activeTenant = {},
  onClick,
  className = '',
}) {
  const unitLabel = template?.unitLabel || 'Unit';
  const unitIdentifier = unit ? (unit.label || `${unit.block}/${unit.unit_number}`) : null;
  const initial = profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : '?';

  // Format nomor WhatsApp (buang spasi/strip, ganti 08xx jadi 628xx)
  const cleanPhone = profile?.phone ? String(profile.phone).replace(/[^0-9]/g, '') : '';
  const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;

  const handleActionClick = (e) => {
    // Mencegah trigger onClick kartu saat tombol kontak ditekan
    e.stopPropagation();
  };

  return (
    <Card
      padding="none"
      onClick={onClick}
      className={`border-slate-200/90 shadow-card hover:border-slate-300 hover:shadow-subtle transition-all cursor-pointer overflow-hidden p-3.5 sm:p-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Kolom Kiri: Avatar & Info Pokok */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="relative shrink-0 mt-0.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-50 text-forest-900 border border-forest-100 font-black text-sm shadow-2xs">
              {initial}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                profile.is_active ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
              title={profile.is_active ? 'Aktif' : 'Non-aktif'}
            />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {unitIdentifier && (
                <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  {unitLabel} {unitIdentifier}
                </span>
              )}
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${roleColor(profile.role)}`}>
                {roleLabel(profile.role, activeTenant?.type)}
              </span>
            </div>

            <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">
              {profile.full_name}
            </h4>

            {profile.occupancy_status && (
              <span className="text-[11px] text-slate-500 block">
                {occupancyStatusLabel(profile.occupancy_status, activeTenant?.type)}
              </span>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Tombol Cepat Kontak & Chevron */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={handleActionClick}>
          {cleanPhone && (
            <>
              {/* WhatsApp Shortcut */}
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`WhatsApp ${profile.full_name}`}
                className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 flex items-center justify-center text-base transition-colors min-h-[36px]"
              >
                <AiOutlineWhatsApp />
              </a>

              {/* Call Shortcut */}
              <a
                href={`tel:${cleanPhone}`}
                title={`Telepon ${profile.full_name}`}
                className="w-9 h-9 rounded-xl bg-slate-50 text-slate-700 hover:bg-forest-800 hover:text-white border border-slate-200 flex items-center justify-center text-base transition-colors min-h-[36px]"
              >
                <AiOutlinePhone />
              </a>
            </>
          )}

          <span className="text-slate-300 ml-1 text-sm">
            <AiOutlineRight />
          </span>
        </div>
      </div>
    </Card>
  );
}

export default ResidentCard;
