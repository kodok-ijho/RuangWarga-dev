import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Komponen aksi / status iklan publik untuk kamar kos kosong (KOS-2.5, KOS-2.6b).
 * Dipakai bersama di PaymentMatrix dan kartu/detail kamar di Houses.
 */
export default function RoomListingAction({
  unitId,
  tenantId,
  listing = null,
  canPostListing = true,
  compact = true,
  className = '',
}) {
  const navigate = useNavigate();

  if (!canPostListing || !unitId || !tenantId) return null;

  if (listing?.status === 'active') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/t/${tenantId}/listings`);
        }}
        className={`inline-flex items-center gap-1 rounded font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 transition-colors ${
          compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-xs'
        } ${className}`}
        title="Kamar ini sedang diiklankan. Klik untuk melihat di Iklan Saya."
      >
        Diiklankan
      </button>
    );
  }

  if (listing?.status === 'pending_payment') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/t/${tenantId}/listings`);
        }}
        className={`inline-flex items-center gap-1 rounded font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 transition-colors ${
          compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-xs'
        } ${className}`}
        title="Menunggu pembayaran aktivasi iklan. Klik untuk menyelesaikan di Iklan Saya."
      >
        Menunggu bayar iklan
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/t/${tenantId}/listings/post?unitId=${unitId}`);
      }}
      className={`inline-flex items-center gap-1 rounded font-bold bg-gold-400 hover:bg-gold-500 text-forest-950 transition-colors shadow-2xs ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-xs'
      } ${className}`}
      title="Iklankan Kamar ini ke Publik"
    >
      Iklankan
    </button>
  );
}
