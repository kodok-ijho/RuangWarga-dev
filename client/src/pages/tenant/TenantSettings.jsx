import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  AiOutlineSave,
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineCopy,
  AiOutlineCheck,
  AiOutlineReload,
  AiOutlineClockCircle,
  AiOutlineWarning,
} from 'react-icons/ai';
import { useTenant } from '../../hooks/useTenant';
import { useTenantTemplate } from '../../hooks/useTenantTemplate';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import { formatRupiah } from '../../services/dataHelpers';
import {
  fetchTenantDetails,
  updateTenantProfileAndSettings,
  pickBankAccountForForm,
  saveTenantBankAccount,
  fetchTenantInviteCode,
  saveInviteCodeWithRetry,
  fetchTenantSettingsAudit,
  fetchBillingAutoRuns,
} from '../../services/tenantOperationalService';

export default function TenantSettings() {
  const { tenantId: routeTenantId } = useParams();
  const { activeTenant, activeTenantId, tenantType: ctxTenantType, isOwner, hasPermission, refreshTenant } = useTenant();
  const tenantId = routeTenantId || activeTenantId;

  const template = useTenantTemplate();
  const billLabel = template?.billLabel || 'IPL';
  const unitLabel = template?.unitLabel || 'Unit';
  const memberLabel = template?.memberLabel || 'Warga';
  const toast = useToast();

  const [tenantType, setTenantType] = useState(null);

  const effectiveTenantType = tenantType || ctxTenantType || null;

  const isAutoBillingSupported = effectiveTenantType === 'rt_rw' || effectiveTenantType === 'kos';

  const canManage = Boolean(isOwner || (hasPermission && hasPermission('manage_settings')));
  const { canTransact, isReadOnly, tooltip } = useSubscriptionGate({
    actionName: 'Ubah pengaturan komunitas',
  });
  const canEdit = Boolean(canManage && canTransact);

  const [loading, setLoading] = useState(true);

  // Bagian 1: Profil Komunitas
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Bagian 2: Tagihan {billLabel}
  const [dueDay, setDueDay] = useState(10);
  const [iplComponents, setIplComponents] = useState([
    { name: `Iuran Pokok`, amount: 0 },
  ]);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(false);
  const [billingIssueDay, setBillingIssueDay] = useState(1);
  const [autoRuns, setAutoRuns] = useState([]);
  const [isLoadingAutoRuns, setIsLoadingAutoRuns] = useState(false);

  // Bagian 3: Rekening Penerima
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [savedBankAccount, setSavedBankAccount] = useState(null);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [bankAuditLogs, setBankAuditLogs] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Bagian 4: Kode Undangan
  const [inviteCode, setInviteCode] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Riwayat perubahan rekening (khusus owner)
  const loadAudit = useCallback(async () => {
    if (!tenantId || !isOwner) return;
    try {
      setIsLoadingAudit(true);
      const logs = await fetchTenantSettingsAudit(tenantId);
      setBankAuditLogs(logs || []);
    } catch {
      setBankAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  }, [tenantId, isOwner]);

  // Riwayat penerbitan tagihan otomatis (BILL-AUTO-1.2)
  const loadAutoRuns = useCallback(async () => {
    if (!tenantId || !isAutoBillingSupported) return;
    try {
      setIsLoadingAutoRuns(true);
      const runs = await fetchBillingAutoRuns(tenantId, 6);
      setAutoRuns(runs || []);
    } catch {
      setAutoRuns([]);
    } finally {
      setIsLoadingAutoRuns(false);
    }
  }, [tenantId, isAutoBillingSupported]);

  // Load Data awal
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [details, code] = await Promise.all([
        fetchTenantDetails(tenantId),
        fetchTenantInviteCode(tenantId),
      ]);

      if (details) {
        setName(details.name || '');
        setAddress(details.address || '');
        setContactPhone(details.contact_phone || '');
        if (details.type) {
          setTenantType(details.type);
        }

        const settings = details.settings || {};
        const isKos = (details.type || effectiveTenantType) === 'kos';
        const hasBillingDueDay =
          settings.billing_due_day !== undefined &&
          settings.billing_due_day !== null &&
          String(settings.billing_due_day).trim() !== '';
        const hasDueDay =
          settings.due_day !== undefined &&
          settings.due_day !== null &&
          String(settings.due_day).trim() !== '';

        if (isKos && hasBillingDueDay) {
          setDueDay(settings.billing_due_day);
        } else if (hasDueDay) {
          setDueDay(settings.due_day);
        } else {
          setDueDay(10);
        }

        setAutoBillingEnabled(Boolean(settings.auto_billing_enabled));
        if (settings.billing_issue_day !== undefined && settings.billing_issue_day !== null) {
          const parsedIssueDay = parseInt(settings.billing_issue_day, 10);
          setBillingIssueDay(!isNaN(parsedIssueDay) && parsedIssueDay >= 1 && parsedIssueDay <= 28 ? parsedIssueDay : 1);
        } else {
          setBillingIssueDay(1);
        }

        if (Array.isArray(settings.ipl_components) && settings.ipl_components.length > 0) {
          setIplComponents(
            settings.ipl_components.map((c) => ({
              name: c.name || '',
              amount: c.amount !== undefined ? c.amount : 0,
            }))
          );
        } else {
          setIplComponents([{ name: `Iuran ${billLabel}`, amount: 0 }]);
        }

        const bank = pickBankAccountForForm(settings);
        if (bank) {
          const cleanBank = {
            bank_name: bank.bank_name || '',
            account_number: bank.account_number ? String(bank.account_number) : '',
            account_holder: bank.account_holder || '',
          };
          setBankName(cleanBank.bank_name);
          setAccountNumber(cleanBank.account_number);
          setAccountHolder(cleanBank.account_holder);
          setSavedBankAccount(cleanBank);
        } else {
          setBankName('');
          setAccountNumber('');
          setAccountHolder('');
          setSavedBankAccount(null);
        }
      }

      if (code) {
        setInviteCode(code);
      }
    } catch (err) {
      toast.error(err.message || 'Gagal memuat pengaturan tenant.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, billLabel, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isOwner) {
      loadAudit();
    }
  }, [isOwner, loadAudit]);

  useEffect(() => {
    if (isAutoBillingSupported) {
      loadAutoRuns();
    }
  }, [isAutoBillingSupported, loadAutoRuns]);

  // ── Handler Bagian 1: Profil Komunitas ──────────────────────────────────────
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!canEdit) return;

    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Nama komunitas wajib diisi.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateTenantProfileAndSettings(tenantId, {
        name: cleanName,
        address: address ? address.trim() : null,
        contact_phone: contactPhone ? contactPhone.trim() : null,
      });
      toast.success('Profil komunitas berhasil disimpan.');
      if (typeof refreshTenant === 'function') {
        refreshTenant();
      }
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan profil komunitas.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Handler Bagian 2: Tagihan ───────────────────────────────────────────────
  const handleAddComponent = () => {
    setIplComponents((prev) => [...prev, { name: '', amount: 0 }]);
  };

  const handleRemoveComponent = (index) => {
    if (iplComponents.length <= 1) {
      toast.error('Minimal harus ada 1 komponen biaya.');
      return;
    }
    setIplComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleComponentChange = (index, field, value) => {
    setIplComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const totalBillingAmount = useMemo(() => {
    return iplComponents.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [iplComponents]);

  const handleSaveBilling = async (e) => {
    if (e) e.preventDefault();
    if (!canEdit) return;

    const dueDayNum = parseInt(dueDay, 10);
    if (isNaN(dueDayNum) || dueDayNum < 1 || dueDayNum > 28) {
      toast.error('Tanggal jatuh tempo harus berupa angka antara 1 hingga 28.');
      return;
    }

    let issueDayNum = 1;
    if (isAutoBillingSupported) {
      issueDayNum = parseInt(billingIssueDay, 10);
      if (isNaN(issueDayNum) || issueDayNum < 1 || issueDayNum > 28) {
        toast.error('Tanggal terbit tagihan harus berupa angka antara 1 hingga 28.');
        return;
      }
    }

    for (let i = 0; i < iplComponents.length; i++) {
      const c = iplComponents[i];
      if (!c.name || !c.name.trim()) {
        toast.error(`Nama komponen biaya ke-${i + 1} wajib diisi.`);
        return;
      }
      const amt = Number(c.amount);
      if (isNaN(amt) || amt < 0) {
        toast.error(`Nominal komponen "${c.name.trim()}" harus berupa angka non-negatif.`);
        return;
      }
    }

    const cleanedComponents = iplComponents.map((c) => ({
      name: c.name.trim(),
      amount: Math.round(Number(c.amount) || 0),
    }));

    const billingSettings = {
      due_day: dueDayNum,
      ipl_components: cleanedComponents,
    };

    if (effectiveTenantType === 'kos') {
      billingSettings.billing_due_day = dueDayNum;
    }

    if (isAutoBillingSupported) {
      billingSettings.auto_billing_enabled = Boolean(autoBillingEnabled);
      billingSettings.billing_issue_day = issueDayNum;
    }

    setIsSavingBilling(true);
    try {
      await updateTenantProfileAndSettings(tenantId, {
        settings: billingSettings,
      });
      toast.success(`Pengaturan tagihan ${billLabel} berhasil disimpan.`);
      if (typeof refreshTenant === 'function') {
        refreshTenant();
      }
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pengaturan tagihan.');
    } finally {
      setIsSavingBilling(false);
    }
  };

  // ── Handler Bagian 3: Rekening Penerima ─────────────────────────────────────
  const hasSavedBankAccount = Boolean(
    savedBankAccount?.bank_name &&
    savedBankAccount?.account_number &&
    savedBankAccount?.account_holder
  );

  const handleSaveBankAccount = async (e) => {
    if (e) e.preventDefault();
    if (!canEdit) return;

    setIsSavingBank(true);
    try {
      await saveTenantBankAccount(tenantId, {
        bank_name: bankName,
        account_number: accountNumber,
        account_holder: accountHolder,
      });

      const cleanAcc = accountNumber.replace(/[\s-]/g, '').trim();
      const cleanBank = bankName.trim();
      const cleanHolder = accountHolder.trim();
      const updatedBank = {
        bank_name: cleanBank,
        account_number: cleanAcc,
        account_holder: cleanHolder,
      };

      setAccountNumber(cleanAcc);
      setBankName(cleanBank);
      setAccountHolder(cleanHolder);
      setSavedBankAccount(updatedBank);
      toast.success('Rekening penerima pembayaran berhasil disimpan.');

      if (typeof refreshTenant === 'function') {
        refreshTenant();
      }
      if (isOwner) {
        loadAudit();
      }
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan rekening penerima pembayaran.');
    } finally {
      setIsSavingBank(false);
    }
  };

  // ── Handler Bagian 4: Kode Undangan ─────────────────────────────────────────
  const joinUrl = useMemo(() => {
    if (!inviteCode) return '';
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    return `${origin}/join/${inviteCode}`;
  }, [inviteCode]);

  const handleCopyLink = async () => {
    if (!inviteCode || !joinUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinUrl);
      }
      setCopiedLink(true);
      toast.success('Tautan undangan berhasil disalin!');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Gagal menyalin tautan undangan.');
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
      }
      setCopiedCode(true);
      toast.success('Kode undangan berhasil disalin!');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error('Gagal menyalin kode undangan.');
    }
  };

  const handleGenerateNewCode = async () => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      'Tautan lama tidak akan berlaku lagi. Apakah Anda yakin ingin membuat kode undangan baru?'
    );
    if (!confirmed) return;

    setIsGeneratingCode(true);
    try {
      const tenantName = name || activeTenant?.name || '';
      const newCode = await saveInviteCodeWithRetry(tenantId, tenantName);
      setInviteCode(newCode);
      toast.success('Kode undangan baru berhasil dibuat!');
    } catch (err) {
      toast.error(err.message || 'Gagal membuat kode undangan baru.');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-200 border-t-emerald-700 animate-spin" />
        <p className="text-xs text-slate-500 mt-3 font-medium">Memuat pengaturan komunitas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Halaman */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Pengaturan Komunitas
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Kelola profil komunitas, skema tagihan {billLabel}, rekening kas penerima, dan kode akses pendaftaran {memberLabel.toLowerCase()}.
        </p>
      </div>

      {/* Banner Read-Only jika langganan nonaktif */}
      {isReadOnly && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/80 text-amber-800 text-xs flex items-start gap-2.5">
          <AiOutlineWarning className="text-amber-600 text-base shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Mode Hanya-Baca (Read-Only)</p>
            <p className="text-amber-700 mt-0.5">
              {tooltip || 'Pengaturan tidak dapat diubah selama paket layanan dalam status hanya-baca.'}
            </p>
          </div>
        </div>
      )}

      {/* Bagian 1: Profil Komunitas */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">Profil Komunitas</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Informasi identitas dan narahubung komunitas yang ditampilkan kepada anggota.
          </p>
        </div>

        <form noValidate onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label htmlFor="communityNameInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Nama Komunitas <span className="text-red-500">*</span>
            </label>
            <input
              id="communityNameInput"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Palm Village RT 05"
              disabled={!canEdit || isSavingProfile}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
            />
          </div>

          <div>
            <label htmlFor="communityAddressInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Alamat
            </label>
            <textarea
              id="communityAddressInput"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Contoh: Jl. Boulevard Palm No. 1, Kel. Melati, Kec. Sukamaju"
              disabled={!canEdit || isSavingProfile}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
            />
          </div>

          <div>
            <label htmlFor="communityContactPhoneInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Kontak / WhatsApp Pengurus
            </label>
            <input
              id="communityContactPhoneInput"
              type="text"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Contoh: 081234567890"
              disabled={!canEdit || isSavingProfile}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={!canEdit || isSavingProfile}
              title={!canTransact ? tooltip : undefined}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AiOutlineSave className="text-base" />
              <span>{isSavingProfile ? 'Menyimpan...' : 'Simpan Profil'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Bagian 2: Pengaturan Tagihan */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">Pengaturan Tagihan {billLabel}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tentukan tanggal jatuh tempo rutin dan rincian biaya yang ditagihkan per {unitLabel.toLowerCase()}.
          </p>
        </div>

        <form noValidate onSubmit={handleSaveBilling} className="space-y-5">
          <div className="max-w-xs">
            <label htmlFor="billingDueDayInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Tanggal Jatuh Tempo (1–28) <span className="text-red-500">*</span>
            </label>
            <input
              id="billingDueDayInput"
              type="number"
              min="1"
              max="28"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              disabled={!canEdit || isSavingBilling}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Tagihan bulanan akan diterbitkan setiap tanggal ini.
            </p>
          </div>

          {/* Blok Terbitkan Tagihan Otomatis (BILL-AUTO-1.2) - HANYA tipe rt_rw atau kos */}
          {isAutoBillingSupported && (
            <div className="pt-2 border-t border-slate-100 space-y-4">
              <div className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/70 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label
                      htmlFor="autoBillingEnabledToggle"
                      className="text-xs sm:text-sm font-bold text-slate-800 cursor-pointer block"
                    >
                      Terbitkan tagihan otomatis
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Otomatisasi pembuatan tagihan berkala setiap bulan tanpa perlu terbit manual.
                    </p>
                  </div>
                  <label
                    htmlFor="autoBillingEnabledToggle"
                    className="relative inline-flex items-center cursor-pointer select-none shrink-0"
                  >
                    <input
                      id="autoBillingEnabledToggle"
                      type="checkbox"
                      checked={autoBillingEnabled}
                      onChange={(e) => setAutoBillingEnabled(e.target.checked)}
                      disabled={!canEdit || isSavingBilling}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed" />
                  </label>
                </div>

                <div className="max-w-xs">
                  <label
                    htmlFor="billingIssueDaySelect"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Tanggal Terbit (1–28)
                  </label>
                  <select
                    id="billingIssueDaySelect"
                    value={billingIssueDay}
                    onChange={(e) => setBillingIssueDay(parseInt(e.target.value, 10))}
                    disabled={!canEdit || isSavingBilling || !autoBillingEnabled}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 font-medium transition"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        Tanggal {day}
                      </option>
                    ))}
                  </select>
                </div>

                {autoBillingEnabled ? (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Tagihan bulan berjalan diterbitkan otomatis setiap tanggal {billingIssueDay} pukul 00:05 WIB, jatuh tempo tanggal {dueDay}.{' '}
                    {effectiveTenantType === 'kos'
                      ? 'Berlaku untuk kamar terisi dengan kontrak berjalan.'
                      : 'Berlaku untuk semua rumah aktif, termasuk rumah kosong.'}{' '}
                    Tombol terbit manual tetap bisa dipakai.
                  </p>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Tagihan saat ini hanya diterbitkan manual. Aktifkan untuk menerbitkan tagihan bulan berjalan otomatis pada tanggal terbit.
                  </p>
                )}

                {autoBillingEnabled && Number(billingIssueDay) > Number(dueDay) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AiOutlineWarning className="text-base text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Peringatan: </span>
                      Tanggal terbit ({billingIssueDay}) lebih besar dari tanggal jatuh tempo ({dueDay}). Tagihan akan langsung lewat jatuh tempo saat terbit.
                    </div>
                  </div>
                )}
              </div>

              {/* Riwayat Penerbitan Otomatis (6 run terakhir) */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <AiOutlineClockCircle className="text-slate-400" size={14} />
                    Riwayat Penerbitan Otomatis
                  </h3>
                  <span className="text-[11px] text-slate-400">6 Run Terakhir</span>
                </div>

                {isLoadingAutoRuns ? (
                  <p className="text-xs text-slate-400 italic py-2">Memuat riwayat penerbitan otomatis...</p>
                ) : autoRuns.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-1">Belum ada penerbitan otomatis.</p>
                ) : (
                  <div className="space-y-2">
                    {autoRuns.map((run) => {
                      const runAtStr = run.run_at
                        ? new Date(run.run_at).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '-';

                      return (
                        <div
                          key={run.id || `${run.period}-${run.run_at}`}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">Periode {run.period}</span>
                              <span className="text-[11px] text-slate-400">• {runAtStr}</span>
                            </div>
                            <div className="text-[11px] text-slate-600">
                              {run.created_count ?? 0} tagihan dibuat, {run.skipped_count ?? 0} dilewati
                            </div>
                            {run.error && (
                              <p className="text-[11px] text-red-600 font-medium mt-0.5">
                                {run.error}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Daftar Komponen Biaya {billLabel}
              </label>
              <button
                type="button"
                onClick={handleAddComponent}
                disabled={!canEdit || isSavingBilling}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AiOutlinePlus />
                <span>Tambah Baris</span>
              </button>
            </div>

            <div className="space-y-2">
              {iplComponents.map((component, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={component.name}
                      onChange={(e) => handleComponentChange(index, 'name', e.target.value)}
                      placeholder="Nama komponen (misal: Keamanan, Kas)"
                      disabled={!canEdit || isSavingBilling}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 transition"
                    />
                  </div>
                  <div className="w-36 sm:w-48">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">
                        Rp
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={component.amount}
                        onChange={(e) => handleComponentChange(index, 'amount', e.target.value)}
                        placeholder="0"
                        disabled={!canEdit || isSavingBilling}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition text-right"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveComponent(index)}
                    disabled={!canEdit || isSavingBilling || iplComponents.length <= 1}
                    title="Hapus komponen"
                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <AiOutlineDelete size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Total Ringkasan Biaya */}
            <div className="mt-3 flex items-center justify-between p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs sm:text-sm">
              <span className="font-semibold text-slate-700">Total Biaya {billLabel}:</span>
              <span className="font-extrabold text-forest-900 text-sm sm:text-base">
                {formatRupiah(totalBillingAmount)}{' '}
                <span className="text-xs font-normal text-slate-500">/ {unitLabel.toLowerCase()} / bulan</span>
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={!canEdit || isSavingBilling}
              title={!canTransact ? tooltip : undefined}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AiOutlineSave className="text-base" />
              <span>{isSavingBilling ? 'Menyimpan...' : 'Simpan Tagihan'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Bagian 3: Rekening Penerima */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1">
          <div>
            <h2 className="text-base font-bold text-slate-900">Rekening Penerima Pembayaran</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rekening bank resmi untuk menerima transfer iuran / pembayaran dari anggota.
            </p>
          </div>
          {hasSavedBankAccount ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Rekening Aktif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 w-fit">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Belum Diisi
            </span>
          )}
        </div>

        {!hasSavedBankAccount && (
          <div className="my-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 flex items-start gap-2">
            <AiOutlineWarning className="text-base text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Belum diisi — </span>
              warga tidak akan melihat tujuan transfer dan tidak bisa membayar lewat transfer bank.
            </div>
          </div>
        )}

        <form noValidate onSubmit={handleSaveBankAccount} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="bankNameInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama Bank <span className="text-red-500">*</span>
              </label>
              <input
                id="bankNameInput"
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Contoh: BCA, Mandiri, BRI"
                disabled={!canEdit || isSavingBank}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
              />
              <p className="mt-1 text-[11px] text-slate-400">2–50 karakter.</p>
            </div>

            <div>
              <label htmlFor="bankAccountNumberInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nomor Rekening <span className="text-red-500">*</span>
              </label>
              <input
                id="bankAccountNumberInput"
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Contoh: 8830123456"
                disabled={!canEdit || isSavingBank}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
              />
              <p className="mt-1 text-[11px] text-slate-400">6–20 digit angka.</p>
            </div>

            <div>
              <label htmlFor="bankAccountHolderInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama Pemilik Rekening <span className="text-red-500">*</span>
              </label>
              <input
                id="bankAccountHolderInput"
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Contoh: Kas RT 05 Palm Village"
                disabled={!canEdit || isSavingBank}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-50 font-medium transition"
              />
              <p className="mt-1 text-[11px] text-slate-400">Nama sesuai buku tabungan (2–100 karakter).</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={!canEdit || isSavingBank}
              title={!canTransact ? tooltip : undefined}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AiOutlineSave className="text-base" />
              <span>{isSavingBank ? 'Menyimpan...' : 'Simpan Rekening'}</span>
            </button>
          </div>
        </form>

        {/* Riwayat Perubahan Rekening (Khusus Owner) */}
        {isOwner && (
          <div className="mt-6 pt-5 border-t border-slate-100" data-testid="bank-account-audit-section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <AiOutlineClockCircle className="text-slate-400" size={14} />
                Riwayat Perubahan Rekening
              </h3>
              <span className="text-[11px] text-slate-400">Khusus Pemilik Komunitas (5 Terakhir)</span>
            </div>

            {isLoadingAudit ? (
              <p className="text-xs text-slate-400 italic py-2">Memuat riwayat perubahan...</p>
            ) : bankAuditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">Belum ada catatan perubahan rekening.</p>
            ) : (
              <div className="space-y-2">
                {bankAuditLogs.map((log) => {
                  const oldAcc = log.old_value;
                  const newAcc = log.new_value;
                  const dateStr = log.changed_at
                    ? new Date(log.changed_at).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '-';
                  const changerName = log.changed_by_name || 'Pengurus/Owner';

                  return (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{changerName}</span>
                          <span className="text-[11px] text-slate-400">• {dateStr}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400">
                            {oldAcc ? `${oldAcc.bank_name} ${oldAcc.account_number} (${oldAcc.account_holder})` : '(Kosong)'}
                          </span>
                          <span className="font-bold text-slate-400">→</span>
                          <span className="font-semibold text-emerald-700">
                            {newAcc ? `${newAcc.bank_name} ${newAcc.account_number} (${newAcc.account_holder})` : '(Dihapus)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Bagian 4: Kode Undangan */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">Kode Undangan & Pendaftaran</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bagikan kode atau tautan pendaftaran kepada calon {memberLabel.toLowerCase()} untuk bergabung ke komunitas ini.
          </p>
        </div>

        <div className="space-y-4">
          {/* Tampilan Kode */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Kode Undangan Aktif
              </span>
              <div className="font-mono text-xl sm:text-2xl font-black text-forest-900 tracking-wider">
                {inviteCode || '-'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              disabled={!inviteCode}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs transition disabled:opacity-50"
            >
              {copiedCode ? <AiOutlineCheck className="text-emerald-600" /> : <AiOutlineCopy />}
              <span>{copiedCode ? 'Tersalin' : 'Salin Kode'}</span>
            </button>
          </div>

          {/* Tautan Pendaftaran */}
          <div className="space-y-1.5">
            <label htmlFor="communityJoinUrlInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tautan Pendaftaran Warga
            </label>
            <div className="flex items-center gap-2">
              <input
                id="communityJoinUrlInput"
                type="text"
                readOnly
                value={joinUrl || (inviteCode ? `/join/${inviteCode}` : '-')}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs sm:text-sm text-slate-700 focus:outline-none cursor-default font-mono"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!inviteCode}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs transition whitespace-nowrap disabled:opacity-50"
              >
                {copiedLink ? <AiOutlineCheck className="text-emerald-600" /> : <AiOutlineCopy />}
                <span>{copiedLink ? 'Tersalin' : 'Salin Tautan'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Calon anggota cukup membuka tautan ini untuk langsung mendaftar ke komunitas.
            </p>
          </div>

          {/* Buat Kode Baru */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800">Perbarui Kode Undangan</h3>
              <p className="text-[11px] text-slate-400">
                Tautan lama tidak akan berlaku lagi setelah membuat kode baru.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateNewCode}
              disabled={!canEdit || isGeneratingCode}
              title={!canTransact ? tooltip : undefined}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <AiOutlineReload className={isGeneratingCode ? 'animate-spin' : ''} />
              <span>{isGeneratingCode ? 'Membuat...' : 'Buat Kode Baru'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
