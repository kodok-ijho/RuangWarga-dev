import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge, StatusBadge } from '../ui';
import {
  roleLabel,
  roleColor,
  occupancyStatusLabel,
  occupancyStatusColor,
  getMemberStatusBadge,
  formatUnitName,
} from '../../services/dataHelpers';
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
  activeTenantId,
  canManageRoles = false,
  roleLabelText,
  onClick,
  className = '',
}) {
  const unitLabel = template?.unitLabel || 'Unit';
  const unitIdentifier = unit ? (unit.label || `${unit.block}/${unit.unit_number}`) : null;
  const initial = profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : '?';
  const statusBadge = getMemberStatusBadge(profile);

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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 border border-slate-200 font-black text-sm shadow-2xs">
              {initial}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${statusBadge.dotColor}`}
              title={statusBadge.label}
            />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {unitIdentifier && (
                <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  {formatUnitName(unitLabel, unitIdentifier)}
                </span>
              )}
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                  profile.is_owner && activeTenantId
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : roleColor(profile.role)
                }`}
              >
                {roleLabelText || (profile.is_owner && activeTenantId ? 'Admin' : roleLabel(profile.role, activeTenant?.type))}
              </span>
            </div>

            <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">
              {profile.full_name}
            </h4>

            {profile.status === 'pending' ? (
              <span className="text-[11px] font-semibold text-amber-700 block">
                Calon {template?.memberLabel || 'Anggota'}
              </span>
            ) : profile.occupancy_status ? (
              <span className="text-[11px] text-slate-500 block">
                {occupancyStatusLabel(profile.occupancy_status, activeTenant?.type)}
              </span>
            ) : null}

            {canManageRoles && activeTenantId && !profile.is_owner && (
              <div onClick={handleActionClick}>
                {profile.status === 'pending' ? (
                  <Link
                    to={`/t/${activeTenantId}/approval`}
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 underline inline-block mt-0.5"
                  >
                    Tinjau & Setujui
                  </Link>
                ) : (
                  <Link
                    to={`/t/${activeTenantId}/members/${profile.id}/role`}
                    className="text-[11px] font-semibold text-forest-800 hover:text-forest-900 underline inline-block mt-0.5"
                  >
                    Atur Jabatan
                  </Link>
                )}
              </div>
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
                aria-label={`Hubungi WhatsApp ${profile.full_name}`}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 flex items-center justify-center text-base pv-focus-ring transition-colors"
              >
                <AiOutlineWhatsApp aria-hidden="true" />
              </a>

              {/* Call Shortcut */}
              <a
                href={`tel:${cleanPhone}`}
                title={`Telepon ${profile.full_name}`}
                aria-label={`Telepon ${profile.full_name}`}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white border border-slate-200 flex items-center justify-center text-base pv-focus-ring transition-colors"
              >
                <AiOutlinePhone aria-hidden="true" />
              </a>
            </>
          )}

          <span className="text-slate-300 ml-1 text-sm" aria-hidden="true">
            <AiOutlineRight />
          </span>
        </div>
      </div>
    </Card>
  );
}

export default ResidentCard;
