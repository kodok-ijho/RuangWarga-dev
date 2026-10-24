import { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { useToast } from '../hooks/useToast';
import {
  fetchTenantUnits,
  checkoutKosRoom,
  fetchActiveContractByUnit,
  fetchTenantBillingItems,
} from '../services/tenantOperationalService';
import { formatDate, formatRupiah } from '../services/dataHelpers';

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
  const [contract, setContract] = useState(null);
  const [isLoadingContract, setIsLoadingContract] = useState(false);
  const [unpaidBills, setUnpaidBills] = useState([]);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
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

  // Muat kontrak aktif dan daftar tagihan belum lunas saat kamar dipilih
  useEffect(() => {
    if (!isOpen || !tenantId || !selectedUnitId) {
      setContract(null);
      setUnpaidBills([]);
      return;
    }

    let isMounted = true;
    setIsLoadingContract(true);
    setIsLoadingBills(true);

    fetchActiveContractByUnit(tenantId, selectedUnitId)
      .then((data) => {
        if (isMounted) setContract(data || null);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Gagal memuat kontrak aktif kamar:', err);
        if (isMounted) setContract(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingContract(false);
      });

    fetchTenantBillingItems(tenantId, { unitId: Number(selectedUnitId) })
      .then((items) => {
        if (!isMounted) return;
        const unpaid = (items || []).filter(
          (b) =>
            b.status === 'unpaid' ||
            b.status === 'pending' ||
            b.status === 'overdue' ||
            (b.status !== 'paid' && b.status !== 'cancelled')
        );
        setUnpaidBills(unpaid);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Gagal memuat tagihan kamar:', err);
        if (isMounted) setUnpaidBills([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingBills(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tenantId, selectedUnitId]);

  const occupiedUnits = useMemo(() => {
    return units.filter((u) => u.status === 'occupied');
  }, [units]);

  const selectedUnit = useMemo(() => {
    return units.find((u) => String(u.id) === String(selectedUnitId)) || null;
  }, [units, selectedUnitId]);

  const totalUnpaidAmount = useMemo(() => {
    return unpaidBills.reduce((acc, b) => acc + Number(b.amount || 0), 0);
  }, [unpaidBills]);

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
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>📋</span> Kontrak yang Akan Diakhiri
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                    {isLoadingContract ? 'Memuat...' : contract?.status ? `Kontrak ${contract.status}` : 'Kontrak Terisi'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-600 pt-0.5">
                  <div>
                    <span className="block text-[10px] text-slate-400">Penyewa</span>
                    <strong className="text-forest-900 font-semibold">
                      {contract?.tenant_name ||
                        contract?.member?.full_name ||
                        selectedUnit.metadata?.tenant_member_id ||
                        selectedUnit.label}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Tarif Sewa</span>
                    <span className="text-emerald-700 font-bold">
                      {contract?.rent_price
                        ? `${formatRupiah(contract.rent_price)} / bulan`
                        : selectedUnit.metadata?.rent_price
                        ? `${formatRupiah(selectedUnit.metadata.rent_price)} / bulan`
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Mulai Masuk / Sewa</span>
                    <span className="text-slate-900 font-medium">
                      {contract?.start_date
                        ? formatDate(contract.start_date)
                        : selectedUnit.metadata?.contract_start
                        ? formatDate(selectedUnit.metadata.contract_start)
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Durasi Kontrak</span>
                    <span className="text-slate-900 font-medium">
                      {contract?.end_date
                        ? formatDate(contract.end_date)
                        : selectedUnit.metadata?.contract_end
                        ? formatDate(selectedUnit.metadata.contract_end)
                        : 'Bulanan (berjalan terus)'}
                    </span>
                  </div>
                </div>

                {contract?.notes && (
                  <div className="pt-1.5 border-t border-slate-200/60 text-slate-500 text-[10px]">
                    <span className="font-semibold text-slate-600">Catatan:</span> {contract.notes}
                  </div>
                )}
              </div>
            )}

            {/* Peringatan Tunggakan Belum Lunas (Non-blocking) */}
            {isLoadingBills ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-500 text-center">
                Memeriksa riwayat tagihan kamar...
              </div>
            ) : unpaidBills.length > 0 ? (
              <div
                data-testid="unpaid-bills-warning"
                className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-[11px] space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-amber-900">
                    <span>⚠️</span> Peringatan: Terdapat {unpaidBills.length} Tagihan Belum Lunas
                  </span>
                  <span className="font-bold text-amber-950">
                    Total: {formatRupiah(totalUnpaidAmount)}
                  </span>
                </div>
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  Penyewa kamar ini masih memiliki tagihan yang belum diselesaikan. Peringatan ini bersifat informatif untuk pengelola dan <strong>tidak membatalkan atau memblokir proses checkout</strong>.
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                  {unpaidBills.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-white/90 border border-amber-200/80 text-[11px]"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">
                          {b.period ? `Periode ${b.period}` : 'Tagihan Sewa'}
                        </span>
                        {b.due_date && (
                          <span className="text-[10px] text-slate-500 block">
                            Jatuh tempo: {formatDate(b.due_date)}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 block">
                          {formatRupiah(b.amount)}
                        </span>
                        <span className="inline-block text-[9px] px-1.5 py-0.5 rounded font-semibold bg-rose-100 text-rose-700">
                          {b.status === 'unpaid' ? 'Belum Bayar' : b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-[11px] flex items-center gap-2">
                <span>✓</span>
                <span>Tidak ada tunggakan tagihan sewa yang belum lunas untuk kamar ini.</span>
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
                placeholder="Contoh: Selesai masa sewa, pindah kota, pengembalian kunci & deposit..."
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
              ⚠️ <strong>Dampak Checkout:</strong> Status kamar akan langsung kembali menjadi <strong>Kosong (Vacant)</strong>. Otomatisasi penagihan bulanan untuk kamar ini akan dihentikan sampai ada kontrak baru.
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
