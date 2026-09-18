import React from 'react';
import { Dialog, Button, StatusBadge } from '../ui';
import {
  roleLabel,
  roleColor,
  occupancyStatusLabel,
  occupancyStatusColor,
} from '../../services/dataHelpers';
import {
  AiOutlinePhone,
  AiOutlineWhatsApp,
  AiOutlineMail,
  AiOutlineHome,
  AiOutlineUser,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineCheck,
} from 'react-icons/ai';

/**
 * ResidentDetailDrawer (TASK-014 & TASK-015)
 * Modal/Drawer detail penghuni lengkap dengan informasi kontak, kepemilikan unit,
 * dan aksi manajemen administratif (Edit / Hapus).
 */
export function ResidentDetailDrawer({
  open = true,
  profile,
  unit,
  owner,
  canManage = false,
  template = {},
  activeTenant = {},
  onClose,
  onEdit,
  onDelete,
}) {
  if (!profile) return null;

  const unitLabel = template?.unitLabel || 'Unit';
  const memberLabel = template?.memberLabel || 'Warga';
  const unitIdentifier = unit ? (unit.label || `${unit.block}/${unit.unit_number}`) : null;
  const initial = profile.full_name ? profile.full_name.charAt(0).toUpperCase() : '?';

  const cleanPhone = profile.phone ? String(profile.phone).replace(/[^0-9]/g, '') : '';
  const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
  const isTemporaryEmail = profile.email && profile.email.includes('@warga.palmvillage.local');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Detail ${memberLabel}`}
      description={unitIdentifier ? `${unitLabel} ${unitIdentifier}` : undefined}
      size="md"
    >
      <div className="space-y-5">
        {/* Header Profil */}
        <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-forest-50 text-forest-900 border border-forest-100 font-black text-2xl shadow-xs">
            {initial}
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-bold text-slate-900 leading-tight truncate">
              {profile.full_name}
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${roleColor(profile.role)}`}>
                {roleLabel(profile.role, activeTenant?.type)}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  profile.is_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {profile.is_active ? '✓ Aktif' : '• Non-aktif'}
              </span>
            </div>
            {profile.occupancy_status && (
              <span className="text-xs text-slate-500 block">
                {occupancyStatusLabel(profile.occupancy_status, activeTenant?.type)}
              </span>
            )}
          </div>
        </div>

        {/* Shortcut Aksi Komunikasi */}
        {cleanPhone && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <AiOutlineWhatsApp className="text-base text-emerald-600" />
              <span>Kirim WhatsApp</span>
            </a>

            <a
              href={`tel:${cleanPhone}`}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <AiOutlinePhone className="text-base text-slate-600" />
              <span>Telepon</span>
            </a>
          </div>
        )}

        {/* Rincian Informasi */}
        <div className="space-y-3 text-xs">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 flex items-center gap-1.5">
              <AiOutlineHome className="text-slate-400" />
              <span>{unitLabel}:</span>
            </span>
            <span className="font-semibold text-slate-800">
              {unitIdentifier || '— Belum Ditentukan —'}
            </span>
          </div>

          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 flex items-center gap-1.5">
              <AiOutlinePhone className="text-slate-400" />
              <span>Nomor Telepon:</span>
            </span>
            <span className="font-semibold text-slate-800">
              {profile.phone || '—'}
            </span>
          </div>

          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 flex items-center gap-1.5">
              <AiOutlineMail className="text-slate-400" />
              <span>Email:</span>
            </span>
            <div className="text-right">
              {isTemporaryEmail ? (
                <span className="text-amber-700 font-medium italic">
                  Akun Sementara (Belum Login)
                </span>
              ) : (
                <span className="font-semibold text-slate-800">
                  {profile.email || '—'}
                </span>
              )}
            </div>
          </div>

          {owner && (
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <AiOutlineUser className="text-slate-400" />
                <span>Pemilik Unit:</span>
              </span>
              <span className="font-semibold text-slate-800">
                {owner.full_name}
              </span>
            </div>
          )}
        </div>

        {/* Tombol Aksi Administratif untuk Pengurus */}
        <div className="pt-2 flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 text-xs"
          >
            Tutup
          </Button>

          {canManage && (
            <>
              <Button
                variant="outline"
                onClick={onEdit}
                icon={AiOutlineEdit}
                className="text-xs"
              >
                Edit
              </Button>

              <Button
                variant="danger"
                onClick={onDelete}
                icon={AiOutlineDelete}
                className="text-xs"
              >
                Hapus
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default ResidentDetailDrawer;
