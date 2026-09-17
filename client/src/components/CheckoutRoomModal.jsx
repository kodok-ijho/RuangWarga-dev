import { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { useToast } from '../hooks/useToast';
import { fetchTenantUnits, checkoutKosRoom } from '../services/tenantOperationalService';
import { formatDate } from '../services/dataHelpers';

export default function CheckoutRoomModal({
  isOpen,
  onClose,
  tenantId,
  onSuccess,
  initialUnitId = null,
}) {
  const toast = useToast();
  const [units, setUnits] = useState([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId ? String(initialUnitId) : '');
  const [checkoutDate, setCheckoutDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [cancelFutureBills, setCancelFutureBills] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !tenantId) return;

    let isMounted = true;
    setIsLoadingUnits(true);

    fetchTenantUnits(tenantId)
      .then((data) => {
        if (!isMounted) return;
        setUnits(data || []);
        if (initialUnitId) {
          setSelectedUnitId(String(initialUnitId));
        } else {
          const firstOccupied = (data || []).find((u) => u.status === 'occupied');
          if (firstOccupied) {
            setSelectedUnitId(String(firstOccupied.id));
          }
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Gagal memuat unit kos:', err);
        toast.error('Gagal memuat data kamar.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingUnits(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tenantId, initialUnitId, toast]);

  const occupiedUnits = useMemo(() => {
    return units.filter((u) => u.status === 'occupied');
  }, [units]);

  const selectedUnit = useMemo(() => {
    return units.find((u) => String(u.id) === String(selectedUnitId)) || null;
  }, [units, selectedUnitId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUnitId) {
      toast.warning('Silakan pilih kamar yang akan di-checkout.');
      return;
    }
    if (!checkoutDate) {
      toast.warning('Tanggal checkout wajib diisi.');
      return;
    }

    const roomLabel = selectedUnit?.label || `Kamar #${selectedUnitId}`;
    const confirmMsg = `Konfirmasi checkout untuk ${roomLabel}?\n\nStatus kamar akan diubah menjadi Kosong (Vacant) dan auto-generate tagihan sewa bulanan untuk kamar ini akan dihentikan.`;
    if (!window.confirm(confirmMsg)) return;

    setIsSubmitting(true);
    try {
      const res = await checkoutKosRoom(tenantId, {
        unitId: Number(selectedUnitId),
        checkoutDate,
        reason: reason.trim() || 'Checkout penyewa',
        cancelFutureBills,
      });

      toast.success(
        `Checkout ${res.unit_label || roomLabel} berhasil. Status kamar kini Kosong (Vacant).`
      );
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Gagal memproses checkout kamar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🚪 Checkout Kamar &amp; Selesai Sewa">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {isLoadingUnits ? (
          <div className="py-8 text-center text-forest-400">
            <div className="h-6 w-6 border-2 border-forest-300 border-t-gold-500 rounded-full animate-spin mx-auto mb-2" />
            Memuat daftar kamar...
          </div>
        ) : occupiedUnits.length === 0 ? (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-center space-y-2">
            <p className="font-semibold text-sm">Tidak Ada Kamar Terisi</p>
            <p className="text-[11px] text-amber-700">
              Seluruh kamar saat ini berstatus Kosong (Vacant) atau belum memiliki penyewa aktif.
            </p>
          </div>
        ) : (
          <>
            {/* Pilihan Kamar Terisi */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pilih Kamar yang Ingin Dicheckout <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="pv-input w-full"
                required
              >
                {occupiedUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} — Terisi (Occupied)
                  </option>
                ))}
              </select>
            </div>

            {/* Info Kontrak Kamar Terpilih */}
            {selectedUnit && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>Nama Kamar:</span>
                  <strong className="text-forest-900 font-bold">{selectedUnit.label}</strong>
                </div>
                {selectedUnit.metadata?.contract_start && (
                  <div className="flex justify-between text-slate-600">
                    <span>Masa Kontrak:</span>
                    <span className="text-slate-900 font-medium">
                      {formatDate(selectedUnit.metadata.contract_start)} s/d{' '}
                      {formatDate(selectedUnit.metadata.contract_end)}
                    </span>
                  </div>
                )}
                {selectedUnit.metadata?.rent_price && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tarif Sewa:</span>
                    <span className="text-emerald-700 font-semibold">
                      Rp {Number(selectedUnit.metadata.rent_price).toLocaleString('id-ID')} / bulan
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Tanggal Checkout */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Checkout <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={checkoutDate}
                onChange={(e) => setCheckoutDate(e.target.value)}
                className="pv-input w-full"
                required
              />
            </div>

            {/* Alasan Checkout */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alasan Checkout / Catatan (Opsional)
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Selesai kontrak sewa, pindah kota, pengembalian kunci & deposit..."
                className="pv-input w-full"
              />
            </div>

            {/* Opsi Batalkan Tagihan Masa Depan */}
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="cancelFutureBills"
                checked={cancelFutureBills}
                onChange={(e) => setCancelFutureBills(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-forest-800 focus:ring-forest-700"
              />
              <label htmlFor="cancelFutureBills" className="text-[11px] text-slate-600 cursor-pointer">
                Batalkan otomatis tagihan sewa belum bayar untuk periode setelah tanggal checkout.
              </label>
            </div>

            {/* Peringatan Dampak Checkout */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-[11px] leading-relaxed">
              ⚠️ <strong>Dampak Checkout:</strong> Status kamar akan langsung kembali menjadi <strong>Kosong (Vacant)</strong>. Otomatisasi generate tagihan sewa bulanan untuk kamar ini akan dihentikan sampai ada kontrak baru.
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="pv-btn-secondary px-4 py-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="pv-btn bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
              >
                <span>🚪</span>
                <span>{isSubmitting ? 'Memproses...' : 'Konfirmasi Checkout'}</span>
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
