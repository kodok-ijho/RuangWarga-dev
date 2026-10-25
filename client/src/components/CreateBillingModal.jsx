import { useState, useEffect, useMemo } from 'react';
import {
  AiOutlineCalendar,
  AiOutlineDollarCircle,
  AiOutlineHome,
  AiOutlineUser,
  AiOutlineFileText,
  AiOutlineCheckCircle,
  AiOutlineInfoCircle,
  AiOutlineClockCircle,
} from 'react-icons/ai';
import Modal from './Modal';
import { useToast } from '../hooks/useToast';
import { formatRupiah } from '../services/dataHelpers';
import { getLocalDateString, formatDateWIB } from '../utils/date';
import { calculateKosProrata, formatProrataPreview } from '../utils/prorata';
import {
  fetchTenantUnits,
  fetchTenantMembers,
  fetchTenantDetails,
  createTenantBillingItem,
  createKosContract,
  fetchActiveContractByUnit,
  computeRentPeriods,
} from '../services/tenantOperationalService';

export default function CreateBillingModal({
  open,
  onClose,
  tenantId,
  tenantType = 'rt_rw',
  initialUnitId = '',
  initialMemberId = '',
  initialTenantName = '',
  lockUnitAndMember = false,
  onSaveContract = null,
  onSuccess,
}) {
  const toast = useToast();
  const isKos = tenantType === 'kos';

  const [units, setUnits] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states umum
  const [unitId, setUnitId] = useState(initialUnitId);
  const [memberId, setMemberId] = useState(initialMemberId);
  const [tenantName, setTenantName] = useState(initialTenantName);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // States khusus non-kos (manual billing)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('unpaid');

  // States khusus kos (kontrak master)
  const [isRoomOccupied, setIsRoomOccupied] = useState(false);
  const [memberSelectMode, setMemberSelectMode] = useState('member'); // 'member' | 'manual'
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [durationType, setDurationType] = useState('monthly'); // 'monthly' | 'fixed'
  const [durationMonths, setDurationMonths] = useState('12');
  const [graceDays, setGraceDays] = useState(10);
  const [billingCycle, setBillingCycle] = useState('start_date'); // 'start_date' | 'month_start_prorata'

  // Muat opsi kamar, anggota, dan pengaturan tenant saat modal dibuka
  useEffect(() => {
    if (!open || !tenantId) return;

    let mounted = true;
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const [unitData, memberData, tenantData] = await Promise.all([
          fetchTenantUnits(tenantId),
          fetchTenantMembers(tenantId),
          fetchTenantDetails(tenantId).catch(() => null),
        ]);
        if (!mounted) return;

        const defaultGrace = Number(tenantData?.settings?.rent_grace_days || 10);
        setGraceDays(defaultGrace);

        setUnits(unitData || []);
        setMembers(memberData || []);

        const targetUnitId = initialUnitId || (unitData.length > 0 ? unitData[0].id : '');
        if (targetUnitId) {
          applyUnitSelection(targetUnitId, unitData, memberData, tenantData);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Gagal memuat opsi unit/anggota:', err);
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => {
      mounted = false;
    };
  }, [open, tenantId, initialUnitId]);

  // Terapkan pemilihan unit (kamar) dan isi otomatis field penyewa serta harga
  const applyUnitSelection = async (selectedId, unitList = units, memberList = members, tenantData = null) => {
    setUnitId(selectedId);
    const found = unitList.find((u) => String(u.id) === String(selectedId));
    if (!found) return;

    // Set default harga
    const defaultPrice = found.metadata?.rent_price
      || found.metadata?.default_rent_price
      || tenantData?.settings?.default_rent_price
      || '';
    if (defaultPrice) {
      setAmount(String(defaultPrice));
    }

    if (!isKos) {
      // Non-kos: coba cari anggota yang menempati unit ini
      const assigned = memberList.find((m) => String(m.unit_id) === String(selectedId));
      if (assigned) setMemberId(assigned.id);
      return;
    }

    // Untuk Kos: Deteksi apakah kamar occupied atau memiliki penyewa
    const hasTenantMember = Boolean(found.metadata?.tenant_member_id);
    const isOccupied = found.status === 'occupied' || hasTenantMember;

    if (isOccupied) {
      setIsRoomOccupied(true);
      let matchedMemberId = found.metadata?.tenant_member_id || '';
      let matchedName = found.metadata?.tenant_name || '';

      // Cek apakah ada kontrak aktif via service
      try {
        const activeContract = await fetchActiveContractByUnit(tenantId, selectedId);
        if (activeContract) {
          matchedMemberId = activeContract.member_id || matchedMemberId;
          matchedName = activeContract.member?.full_name || activeContract.tenant_name || matchedName;
        }
      } catch {
        // fallback ke metadata
      }

      if (!matchedName && matchedMemberId) {
        const m = memberList.find((x) => String(x.id) === String(matchedMemberId));
        if (m) matchedName = m.full_name;
      }

      setMemberId(matchedMemberId);
      setTenantName(matchedName || 'Penyewa Terdaftar');
    } else {
      setIsRoomOccupied(false);
      if (lockUnitAndMember) {
        setMemberId(initialMemberId || '');
        setTenantName(initialTenantName || '');
      } else {
        const prevMemberId = initialMemberId || found.metadata?.previous_tenant_member_id || '';
        if (prevMemberId) {
          setMemberId(prevMemberId);
          const m = memberList.find((x) => String(x.id) === String(prevMemberId));
          setTenantName(m?.full_name || initialTenantName || '');
        } else {
          setMemberId('');
          setTenantName('');
        }
      }
      setMemberSelectMode('member');
    }
  };

  const handleUnitChange = (selectedId) => {
    applyUnitSelection(selectedId);
  };

  // Anggota approved yang belum memiliki kamar (tersedia untuk kos)
  const availableMembers = useMemo(() => {
    return members.filter((m) => m.status === 'approved' && (!m.unit_id || String(m.unit_id) === String(unitId)));
  }, [members, unitId]);

  // Kalkulasi tagihan prorata untuk kos (KOS-3.2)
  const prorataInfo = useMemo(() => {
    if (!isKos || !startDate || !amount) return null;
    return calculateKosProrata(startDate, Number(amount), billingCycle);
  }, [isKos, startDate, amount, billingCycle]);

  // Pratinjau teks nominal prorata jika opsi prorata dipilih dan tanggal bukan tgl 1
  const prorataPreview = useMemo(() => {
    if (!isKos || billingCycle !== 'month_start_prorata') return null;
    if (!prorataInfo || !prorataInfo.isProrata) return null;
    return formatProrataPreview(startDate, prorataInfo.amount);
  }, [isKos, billingCycle, prorataInfo, startDate]);

  // Pratinjau 3 periode pertama untuk sewa kos
  const previewPeriods = useMemo(() => {
    if (!isKos || !startDate) return [];
    const maxEnd = (durationType === 'fixed' && Number(durationMonths) > 0)
      ? computeRentPeriods(startDate, graceDays, Number(durationMonths), null, billingCycle)[Number(durationMonths) - 1]?.service_end || null
      : null;
    return computeRentPeriods(startDate, graceDays, 3, maxEnd, billingCycle);
  }, [isKos, startDate, graceDays, durationType, durationMonths, billingCycle]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!unitId) {
      toast.error(isKos ? 'Silakan pilih kamar terlebih dahulu.' : 'Silakan pilih unit terlebih dahulu.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      toast.error(isKos ? 'Harga sewa harus berupa angka positif atau nol.' : 'Nominal tagihan harus berupa angka positif atau nol.');
      return;
    }

    // ==========================================
    // ALUR KOS: BUAT KONTRAK SEWA MASTER (KOS-2.4)
    // ==========================================
    if (isKos) {
      if (!startDate) {
        toast.error('Tanggal masuk sewa wajib diisi.');
        return;
      }

      if (!memberId && (!tenantName || !tenantName.trim())) {
        toast.error('Nama penyewa wajib ditentukan.');
        return;
      }

      const monthsVal = durationType === 'fixed' ? Number(durationMonths) : null;
      if (durationType === 'fixed' && (!monthsVal || monthsVal <= 0)) {
        toast.error('Durasi sewa tetap minimal 1 bulan.');
        return;
      }

      setIsSubmitting(true);
      try {
        const contractRes = await createKosContract(tenantId, {
          unitId: Number(unitId),
          memberId: memberId || null,
          tenantName: tenantName?.trim() || null,
          rentPrice: numAmount,
          startDate,
          months: monthsVal,
          graceDays: Number(graceDays || 10),
          notes: notes?.trim() || null,
          billingCycle,
        });

        if (onSaveContract) {
          await onSaveContract(contractRes);
        }

        toast.success('Kontrak sewa berhasil dibuat dan tagihan periode pertama telah terbit!');
        if (onSuccess) onSuccess(contractRes);
        onClose();
      } catch (err) {
        toast.error(err.message || 'Gagal menyimpan kontrak sewa.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ==========================================
    // ALUR REGULER: TAGIHAN MANUAL NON-KOS
    // ==========================================
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      toast.error('Format periode tagihan harus YYYY-MM.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createTenantBillingItem(tenantId, {
        unit_id: unitId,
        member_id: memberId || null,
        period,
        amount: numAmount,
        due_date: dueDate || null,
        status,
        metadata: {
          notes,
          billing_type: 'regular',
        },
      });

      toast.success('Tagihan berhasil dibuat!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan tagihan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isKos ? 'Buat Kontrak Sewa' : 'Buat Tagihan Manual'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-forest-900">
        {loadingOptions ? (
          <div className="py-8 text-center text-forest-500 text-sm">
            Memuat data kamar &amp; penghuni...
          </div>
        ) : (
          <>
            {/* Pilihan Kamar / Unit */}
            <div>
              <label htmlFor="billing-unit-select" className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                <AiOutlineHome className="text-sm text-forest-600" />
                <span>Pilih {isKos ? 'Kamar' : 'Rumah / Kavling'} <span className="text-rose-500">*</span></span>
              </label>
              {lockUnitAndMember ? (
                <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    {units.find((u) => String(u.id) === String(unitId))?.label || `Kamar #${unitId}`}
                  </span>
                  <span className="text-[10px] font-bold text-forest-800 bg-forest-50 border border-forest-200 px-2 py-0.5 rounded-md">
                    Kamar Pendaftar (Terkunci)
                  </span>
                </div>
              ) : (
                <select
                  id="billing-unit-select"
                  value={unitId}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  required
                  className="pv-input text-xs w-full bg-white border border-forest-300 rounded-xl px-3 py-2"
                >
                  <option value="">-- Pilih {isKos ? 'Kamar' : 'Unit'} --</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label} {u.status === 'vacant' ? '(Kosong / Siap Huni)' : u.status === 'occupied' ? '(Terisi)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Form Khusus Kos: Penyewa & Kontrak */}
            {isKos ? (
              <>
                {/* Field Penyewa */}
                <div>
                  <label className="block text-xs font-bold text-forest-800 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AiOutlineUser className="text-sm text-forest-600" />
                      <span>Penyewa Kamar <span className="text-rose-500">*</span></span>
                    </span>
                    {(isRoomOccupied || lockUnitAndMember) && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {lockUnitAndMember ? 'Pendaftar (Terkunci)' : 'Kamar Terisi (Terkunci)'}
                      </span>
                    )}
                  </label>

                  {lockUnitAndMember ? (
                    <div>
                      <input
                        type="text"
                        readOnly
                        aria-label="Nama Penyewa Terdaftar"
                        value={tenantName || initialTenantName || 'Pendaftar Kos'}
                        className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold cursor-not-allowed"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Penyewa terkunci pada nama pendaftar yang sedang diproses.
                      </p>
                    </div>
                  ) : isRoomOccupied ? (
                    <div>
                      <input
                        type="text"
                        readOnly
                        aria-label="Nama Penyewa Terdaftar"
                        value={tenantName || 'Penyewa Terdaftar'}
                        className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold cursor-not-allowed"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Penyewa terkunci pada data kontrak/kamar terisi saat ini.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="memberSelectMode"
                            value="member"
                            checked={memberSelectMode === 'member'}
                            onChange={() => setMemberSelectMode('member')}
                            className="text-forest-600 focus:ring-forest-500"
                          />
                          <span>Pilih Anggota Terdaftar</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="memberSelectMode"
                            value="manual"
                            checked={memberSelectMode === 'manual'}
                            onChange={() => {
                              setMemberSelectMode('manual');
                              setMemberId('');
                            }}
                            className="text-forest-600 focus:ring-forest-500"
                          />
                          <span>Input Nama Manual</span>
                        </label>
                      </div>

                      {memberSelectMode === 'member' ? (
                        <select
                          id="kos-member-select"
                          data-testid="kos-member-select"
                          aria-label="Pilih dari daftar anggota"
                          value={memberId}
                          onChange={(e) => {
                            const mid = e.target.value;
                            setMemberId(mid);
                            const matched = members.find((x) => String(x.id) === String(mid));
                            setTenantName(matched?.full_name || '');
                          }}
                          required={memberSelectMode === 'member'}
                          className="pv-input text-xs w-full bg-white border border-forest-300 rounded-xl px-3 py-2"
                        >
                          <option value="">-- Pilih Anggota Terdaftar --</option>
                          {availableMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name} {m.phone ? `(${m.phone})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          aria-label="Nama Penyewa Manual"
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          placeholder="Masukkan nama lengkap penyewa..."
                          required={memberSelectMode === 'manual'}
                          className="pv-input text-xs w-full bg-white border border-forest-300 rounded-xl px-3 py-2"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Harga Sewa */}
                <div>
                  <label htmlFor="kos-rent-price-input" className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                    <AiOutlineDollarCircle className="text-sm text-forest-600" />
                    <span>Harga Sewa Per Bulan (Rp) <span className="text-rose-500">*</span></span>
                  </label>
                  <input
                    id="kos-rent-price-input"
                    type="number"
                    min="0"
                    step="1000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900 font-semibold"
                  />
                  {amount && (
                    <span className="text-[11px] text-emerald-600 font-bold block mt-0.5">
                      {formatRupiah(Number(amount))} / bulan
                    </span>
                  )}
                </div>

                {/* Tanggal Masuk & Durasi Kontrak */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                  <div>
                    <label htmlFor="kos-start-date-input" className="block text-[11px] font-bold text-emerald-900 mb-1 flex items-center gap-1">
                      <AiOutlineCalendar />
                      <span>Tanggal Masuk (Mulai Sewa) <span className="text-rose-500">*</span></span>
                    </label>
                    <input
                      id="kos-start-date-input"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="kos-duration-type-select" className="block text-[11px] font-bold text-emerald-900 mb-1 flex items-center gap-1">
                      <AiOutlineClockCircle />
                      <span>Durasi Kontrak</span>
                    </label>
                    <select
                      id="kos-duration-type-select"
                      value={durationType}
                      onChange={(e) => setDurationType(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-forest-900 font-medium"
                    >
                      <option value="monthly">Bulanan (berjalan terus)</option>
                      <option value="fixed">Tetap N bulan</option>
                    </select>
                  </div>

                  {durationType === 'fixed' && (
                    <div className="sm:col-span-2 pt-1 border-t border-emerald-200/60">
                      <label htmlFor="kos-duration-months-input" className="block text-[11px] font-semibold text-emerald-800 mb-1">
                        Jumlah Bulan Sewa
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="kos-duration-months-input"
                          type="number"
                          min="1"
                          max="60"
                          value={durationMonths}
                          onChange={(e) => setDurationMonths(e.target.value)}
                          required
                          className="w-32 bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-forest-900 font-semibold"
                        />
                        <span className="text-xs text-emerald-700">bulan</span>
                      </div>
                    </div>
                  )}

                  <div className="sm:col-span-2 pt-1 border-t border-emerald-200/60">
                    <label htmlFor="kos-grace-days-input" className="block text-[11px] font-semibold text-emerald-800 mb-1">
                      Tenggat Pembayaran (Jatuh Tempo)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="kos-grace-days-input"
                        type="number"
                        min="0"
                        max="28"
                        value={graceDays}
                        onChange={(e) => setGraceDays(Number(e.target.value) || 0)}
                        className="w-24 bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-forest-900 font-semibold"
                      />
                      <span className="text-xs text-emerald-700">hari setelah tanggal masuk / masa sewa dimulai</span>
                    </div>
                  </div>

                  {/* Pilihan Siklus Tagihan (KOS-3.2) */}
                  <div className="sm:col-span-2 pt-2 border-t border-emerald-200/60">
                    <label className="block text-[11px] font-bold text-emerald-900 mb-1.5 flex items-center gap-1">
                      <AiOutlineCalendar />
                      <span>Siklus Tagihan</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div
                        role="radio"
                        aria-checked={billingCycle === 'start_date'}
                        tabIndex={0}
                        onClick={() => setBillingCycle('start_date')}
                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setBillingCycle('start_date'); }}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          billingCycle === 'start_date'
                            ? 'bg-white border-forest-600 shadow-2xs text-forest-950 font-medium'
                            : 'bg-emerald-50/40 border-emerald-200 hover:bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="kosBillingCycle"
                          value="start_date"
                          checked={billingCycle === 'start_date'}
                          onChange={() => setBillingCycle('start_date')}
                          className="mt-0.5 text-forest-700 focus:ring-forest-600 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-forest-900">Ikut tanggal masuk</div>
                          <div className="text-[10px] text-slate-500 leading-normal">
                            Tagihan jatuh tempo berulang setiap tanggal masuk kamar
                          </div>
                        </div>
                      </div>

                      <div
                        role="radio"
                        aria-checked={billingCycle === 'month_start_prorata'}
                        tabIndex={0}
                        onClick={() => setBillingCycle('month_start_prorata')}
                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setBillingCycle('month_start_prorata'); }}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          billingCycle === 'month_start_prorata'
                            ? 'bg-white border-forest-600 shadow-2xs text-forest-950 font-medium'
                            : 'bg-emerald-50/40 border-emerald-200 hover:bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="kosBillingCycle"
                          value="month_start_prorata"
                          checked={billingCycle === 'month_start_prorata'}
                          onChange={() => setBillingCycle('month_start_prorata')}
                          className="mt-0.5 text-forest-700 focus:ring-forest-600 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-forest-900">Awal bulan (bulan pertama prorata)</div>
                          <div className="text-[10px] text-slate-500 leading-normal">
                            Tagihan per tanggal 1, periode pertama dihitung prorata
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pratinjau Prorata saat dipilih dan tanggal masuk bukan tanggal 1 */}
                    {prorataPreview && (
                      <div
                        data-testid="prorata-preview-badge"
                        className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between shadow-2xs"
                      >
                        <span className="text-[11px] font-medium text-amber-800">
                          Pratinjau Tagihan Bulan Pertama:
                        </span>
                        <span className="font-bold text-forest-900">
                          {prorataPreview}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pratinjau 3 Periode Pertama (KOS-2.4 f) */}
                {previewPeriods.length > 0 && (
                  <div data-testid="rent-preview-panel" className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <AiOutlineInfoCircle className="text-forest-600" />
                      <span>Pratinjau Siklus Penagihan</span>
                    </div>
                    <div className="space-y-1.5">
                      {previewPeriods.map((p) => (
                        <div
                          key={p.period}
                          className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white border border-slate-200 gap-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-forest-800">{p.period}</span>
                            <span className="text-slate-500 text-[11px]">
                              ({formatDateWIB(p.service_start)} – {formatDateWIB(p.service_end)})
                            </span>
                            {p.is_prorata && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Prorata
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 sm:text-right flex items-center sm:justify-end gap-2">
                            {amount && (
                              <span className="font-bold text-emerald-700">
                                {formatRupiah(p.is_prorata ? prorataInfo?.amount : Number(amount))}
                              </span>
                            )}
                            <span>
                              Jatuh tempo: <span className="font-semibold text-rose-700">{formatDateWIB(p.due_date)}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed italic">
                      {billingCycle === 'month_start_prorata'
                        ? 'Tagihan periode pertama dihitung prorata s.d. akhir bulan. Periode berikutnya terbit setiap tanggal 1.'
                        : 'Tagihan periode pertama akan langsung dibuat. Periode berikutnya terbit otomatis setiap tanggal masuk kamar.'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              /* Form Reguler Non-Kos (RT/RW, dsb) */
              <>
                {/* Pilihan Penyewa / Anggota */}
                <div>
                  <label htmlFor="nonkos-member-select" className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                    <AiOutlineUser className="text-sm text-forest-600" />
                    <span>Warga / Penghuni (Opsional)</span>
                  </label>
                  <select
                    id="nonkos-member-select"
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    className="pv-input text-xs w-full bg-white border border-forest-300 rounded-xl px-3 py-2"
                  >
                    <option value="">-- Belum Terdaftar / Mandiri --</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} {m.phone ? `(${m.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Periode & Nominal Tagihan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="nonkos-period-input" className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                      <AiOutlineCalendar className="text-sm text-forest-600" />
                      <span>Periode Tagihan <span className="text-rose-500">*</span></span>
                    </label>
                    <input
                      id="nonkos-period-input"
                      type="month"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      required
                      className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="nonkos-amount-input" className="block text-xs font-bold text-forest-800 mb-1 flex items-center gap-1.5">
                      <AiOutlineDollarCircle className="text-sm text-forest-600" />
                      <span>Nominal IPL (Rp) <span className="text-rose-500">*</span></span>
                    </label>
                    <input
                      id="nonkos-amount-input"
                      type="number"
                      min="0"
                      step="1000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      required
                      className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900 font-semibold"
                    />
                    {amount && (
                      <span className="text-[11px] text-emerald-600 font-bold block mt-0.5">
                        {formatRupiah(Number(amount))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Jatuh Tempo & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="nonkos-due-date-input" className="block text-xs font-semibold text-forest-700 mb-1">
                      Tanggal Jatuh Tempo
                    </label>
                    <input
                      id="nonkos-due-date-input"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-white border border-forest-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="nonkos-status-select" className="block text-xs font-semibold text-forest-700 mb-1">
                      Status Pembayaran Awal
                    </label>
                    <select
                      id="nonkos-status-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full bg-white border border-forest-300 rounded-xl px-3 py-1.5 text-xs text-forest-900"
                    >
                      <option value="unpaid">Belum Dibayar (Unpaid)</option>
                      <option value="paid">Sudah Lunas (Paid)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Catatan / Keterangan */}
            <div>
              <label htmlFor="billing-notes-textarea" className="block text-xs font-semibold text-forest-700 mb-1 flex items-center gap-1.5">
                <AiOutlineFileText className="text-sm text-forest-500" />
                <span>Catatan Tambahan (Opsional)</span>
              </label>
              <textarea
                id="billing-notes-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isKos ? 'Mis: Deposit Rp 500.000, fasilitas tambahan parkir mobil.' : 'Mis: Iuran sampah & keamanan lingkungan.'}
                className="w-full bg-white border border-forest-300 rounded-xl px-3 py-2 text-xs text-forest-900 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-forest-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-forest-100 hover:bg-forest-200 text-xs font-semibold text-forest-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-forest-800 hover:bg-forest-700 text-gold-300 text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                <AiOutlineCheckCircle className="text-sm" />
                <span>{isSubmitting ? 'Menyimpan...' : (isKos ? 'Simpan Kontrak' : 'Simpan Tagihan')}</span>
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
