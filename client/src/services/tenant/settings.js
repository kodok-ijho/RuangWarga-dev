/**
 * settings.js
 * Pengaturan tenant, rekening bank, kode undangan, dan audit pengaturan.
 */

import { supabase, IS_DEMO } from './shared';

export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate kode undangan unik berbasis nama tenant (SEC-3F.1).
 * Menggunakan crypto.getRandomValues dengan 8 karakter dari alfabet 32 simbol (2^40 kemungkinan).
 * Format: RW-<maks 4 huruf nama>-<XXXX>-<XXXX> (misal: "RW-PALM-7K8M-2N9P").
 *
 * @param {string} [tenantName='']
 * @returns {string}
 */
export function generateInviteCode(tenantName = '') {
  const clean = tenantName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'RW';

  const randomBytes = new Uint8Array(8);
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Web Cryptography API (crypto.getRandomValues) tidak didukung pada lingkungan ini.');
  }
  cryptoObj.getRandomValues(randomBytes);

  let randomPart = '';
  for (let i = 0; i < 8; i++) {
    // 32 adalah pembagi 256 yang tepat (256 % 32 === 0), distribusi byte seragam sempurna
    randomPart += INVITE_CODE_ALPHABET[randomBytes[i] % 32];
  }

  const part1 = randomPart.slice(0, 4);
  const part2 = randomPart.slice(4, 8);

  return `RW-${clean}-${part1}-${part2}`;
}

const mockTenantInviteCodes = {
  'demo-tenant-kos': 'RW-KOS-2026',
  'demo-tenant-rtrw': 'RW-PALM-2026',
  't-rt-1': 'PV-05',
};

const mockTenantSettingsAudit = {
  'demo-tenant-rtrw': [
    {
      id: 'mock-audit-1',
      tenant_id: 'demo-tenant-rtrw',
      changed_by: 'demo-admin',
      changed_by_name: 'Bambang Sudarmono (Ketua RT)',
      field: 'bank_account',
      old_value: { bank_name: 'BCA', account_number: '8830111111', account_holder: 'Kas RT Lama' },
      new_value: { bank_name: 'BCA', account_number: '8830123456', account_holder: 'Kas RT 05 Palm Village' },
      changed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ],
};

export function getCachedTenantInviteCode(tenantId) {
  if (!tenantId) return null;
  return mockTenantInviteCodes[tenantId] || null;
}

/**
 * Mengambil detail tenant beserta settings
 */
export async function fetchTenantDetails(tenantId) {
  if (!tenantId) return null;

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const isKos = String(tenantId).includes('kos');
    if (isKos) {
      return {
        id: tenantId,
        name: 'Kos Melati Harmoni',
        type: 'kos',
        address: 'Jl. Melati Raya No. 12, Sleman',
        contact_phone: '081234567891',
        settings: {
          default_rent_price: 1200000,
          billing_cycle: 'monthly',
          due_day: 1,
          bank_account: {
            bank_name: 'BCA',
            account_number: '8830998877',
            account_holder: 'Pengelola Kos Melati',
          },
          onboarding_completed: false,
        },
      };
    }

    return {
      id: tenantId,
      name: 'Palm Village RT 05',
      type: 'rt_rw',
      address: 'Jl. Boulevard Palm No. 1',
      contact_phone: '081234567890',
      settings: {
        logo_url: '/tenants/palm-village/logo.png',
        legacy_qris_enabled: true,
        ipl_components: [
          { name: 'Keamanan', amount: 80000 },
          { name: 'Kebersihan', amount: 30000 },
          { name: 'Kas RT', amount: 20000 },
          { name: 'DDC (Sosial)', amount: 10000 },
        ],
        due_day: 10,
        bank_account: {
          bank_name: 'BCA',
          account_number: '8830123456',
          account_holder: 'Kas RT 05 Palm Village',
        },
        onboarding_completed: true,
      },
    };
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, type, owner_id, address, contact_phone, settings, created_at, updated_at')
    .eq('id', tenantId)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantDetails error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui profil dan settings tenant
 */
export async function updateTenantProfileAndSettings(tenantId, { name, address, contact_phone, settings }) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) payload.name = name.trim();
  if (address !== undefined) payload.address = address ? address.trim() : null;
  if (contact_phone !== undefined) payload.contact_phone = contact_phone ? contact_phone.trim() : null;
  if (settings !== undefined) payload.settings = settings;

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return { id: tenantId, ...payload };
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(payload)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantProfileAndSettings error:', error);
    throw error;
  }

  return data;
}

/**
 * Membaca rekening bank tenant dari objek tenant atau settings tenant.
 * Mengembalikan objek bersih { bank_name, account_number, account_holder } bila terisi lengkap,
 * atau null jika belum diisi atau tidak lengkap. Tidak pernah mengembalikan undefined atau objek setengah isi.
 *
 * @param {Object} [tenantOrSettings]
 * @returns {{ bank_name: string, account_number: string, account_holder: string } | null}
 */
export function getTenantBankAccount(tenantOrSettings) {
  if (!tenantOrSettings || typeof tenantOrSettings !== 'object') {
    return null;
  }

  const settings = tenantOrSettings.settings || tenantOrSettings;
  const bankAccount = settings?.bank_account;

  if (!bankAccount || typeof bankAccount !== 'object') {
    return null;
  }

  const bankName = typeof bankAccount.bank_name === 'string' ? bankAccount.bank_name.trim() : '';
  const accountNumber =
    typeof bankAccount.account_number === 'string' || typeof bankAccount.account_number === 'number'
      ? String(bankAccount.account_number).trim()
      : '';
  const accountHolder =
    typeof bankAccount.account_holder === 'string' ? bankAccount.account_holder.trim() : '';

  if (!bankName || !accountNumber || !accountHolder) {
    return null;
  }

  return {
    bank_name: bankName,
    account_number: accountNumber,
    account_holder: accountHolder,
  };
}

/**
 * Mengecek apakah pembayaran QRIS legacy (jalur n8n/DOKU Palm Village)
 * diizinkan untuk tenant yang bersangkutan. Default false.
 *
 * @param {Object} [tenantOrSettings]
 * @returns {boolean}
 */
export function isLegacyQrisEnabled(tenantOrSettings) {
  if (!tenantOrSettings || typeof tenantOrSettings !== 'object') {
    return false;
  }
  const settings = tenantOrSettings.settings || tenantOrSettings;
  return settings?.legacy_qris_enabled === true;
}

/**
 * Mengambil data rekening bank yang tersedia dari settings tenant untuk form input (BRAND-1F.3).
 * Mengutamakan format baru bank_account, dengan fallback ke format lama bank_info.
 * Mengembalikan objek rekening atau null bila tidak tersedia.
 *
 * @param {Object} settings
 * @returns {Object|null}
 */
export function pickBankAccountForForm(settings) {
  if (
    settings &&
    typeof settings === 'object' &&
    settings.bank_account &&
    typeof settings.bank_account === 'object'
  ) {
    return settings.bank_account;
  }

  if (
    settings &&
    typeof settings === 'object' &&
    settings.bank_info &&
    typeof settings.bank_info === 'object'
  ) {
    return settings.bank_info;
  }

  return null;
}

/**
 * Memvalidasi dan menormalisasi data rekening bank tenant.
 * Fungsi murni tanpa efek samping.
 *
 * @param {Object} bankAccount - { bank_name, account_number, account_holder }
 * @returns {{ bank_name: string, account_number: string, account_holder: string }}
 * @throws {Error} bila data tidak valid
 */
export function normalizeBankAccount(bankAccount) {
  if (!bankAccount || typeof bankAccount !== 'object') {
    throw new Error('Data rekening bank wajib disertakan.');
  }

  const rawBankName =
    bankAccount.bank_name !== undefined && bankAccount.bank_name !== null
      ? String(bankAccount.bank_name).trim()
      : '';
  const rawAccountNumber =
    bankAccount.account_number !== undefined && bankAccount.account_number !== null
      ? String(bankAccount.account_number).trim()
      : '';
  const rawAccountHolder =
    bankAccount.account_holder !== undefined && bankAccount.account_holder !== null
      ? String(bankAccount.account_holder).trim()
      : '';

  // Validasi bank_name: wajib, 2-50 karakter
  if (!rawBankName) {
    throw new Error('Nama bank wajib diisi.');
  }
  if (rawBankName.length < 2 || rawBankName.length > 50) {
    throw new Error('Nama bank harus terdiri dari 2 hingga 50 karakter.');
  }

  // Validasi account_number: wajib, hanya angka (boleh spasi/strip saat input, disimpan tanpa pemisah), 6-20 digit
  if (!rawAccountNumber) {
    throw new Error('Nomor rekening wajib diisi.');
  }
  const cleanAccountNumber = rawAccountNumber.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(cleanAccountNumber)) {
    throw new Error('Nomor rekening hanya boleh berisi angka.');
  }
  if (cleanAccountNumber.length < 6 || cleanAccountNumber.length > 20) {
    throw new Error('Nomor rekening harus terdiri dari 6 hingga 20 digit angka.');
  }

  // Validasi account_holder: wajib, 2-100 karakter
  if (!rawAccountHolder) {
    throw new Error('Nama pemilik rekening wajib diisi.');
  }
  if (rawAccountHolder.length < 2 || rawAccountHolder.length > 100) {
    throw new Error('Nama pemilik rekening harus terdiri dari 2 hingga 100 karakter.');
  }

  return {
    bank_name: rawBankName,
    account_number: cleanAccountNumber,
    account_holder: rawAccountHolder,
  };
}

/**
 * Menyimpan / memperbarui rekening bank tenant ke dalam settings tenant.
 * Memakai updateTenantProfileAndSettings yang sudah ada (tidak membuat query update baru).
 * Selalu mengambil settings terbaru lewat fetchTenantDetails tepat sebelum menyimpan
 * untuk mencegah penimpaan setting lain (F10).
 *
 * @param {string} tenantId
 * @param {Object} bankAccount - { bank_name, account_number, account_holder }
 * @returns {Promise<Object>}
 */
export async function saveTenantBankAccount(tenantId, bankAccount) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }

  const normalizedAccount = normalizeBankAccount(bankAccount);

  // F10: Selalu ambil settings terbaru tepat sebelum menyimpan agar tidak menimpa setting lain.
  let tenantDetails;
  try {
    tenantDetails = await fetchTenantDetails(tenantId);
  } catch {
    throw new Error('Gagal memuat pengaturan tenant, rekening tidak disimpan.');
  }

  if (!tenantDetails || typeof tenantDetails.settings !== 'object' || tenantDetails.settings === null) {
    throw new Error('Gagal memuat pengaturan tenant, rekening tidak disimpan.');
  }

  const baseSettings = tenantDetails.settings;

  const updatedSettings = {
    ...baseSettings,
    bank_account: normalizedAccount,
  };

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    if (!mockTenantSettingsAudit[tenantId]) {
      mockTenantSettingsAudit[tenantId] = [];
    }
    mockTenantSettingsAudit[tenantId].unshift({
      id: `mock-audit-${Date.now()}`,
      tenant_id: tenantId,
      changed_by: 'demo-admin',
      changed_by_name: 'Pengelola Tenant',
      field: 'bank_account',
      old_value: baseSettings.bank_account || null,
      new_value: updatedSettings.bank_account,
      changed_at: new Date().toISOString(),
    });
  }

  return await updateTenantProfileAndSettings(tenantId, { settings: updatedSettings });
}

/**
 * Mengambil kode undangan privat tenant dari tabel tenant_invites (SEC-3.2).
 * Mengembalikan null bila tidak ditemukan atau user tidak memiliki hak akses (RLS).
 * 
 * @param {string} tenantId 
 * @returns {Promise<string|null>}
 */
export async function fetchTenantInviteCode(tenantId) {
  if (!tenantId) return null;

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return mockTenantInviteCodes[tenantId] || null;
  }

  try {
    const { data, error } = await supabase
      .from('tenant_invites')
      .select('code')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[tenantOperationalService] fetchTenantInviteCode error/restricted:', error.message);
      return null;
    }

    return data?.code || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tenantOperationalService] fetchTenantInviteCode unexpected error:', err);
    return null;
  }
}

/**
 * Menyimpan atau memperbarui kode undangan tenant ke tabel tenant_invites (SEC-3.2).
 * 
 * @param {string} tenantId 
 * @param {string} code 
 * @returns {Promise<boolean>}
 */
export async function saveTenantInviteCode(tenantId, code) {
  if (!tenantId || !code) return false;

  const trimmedCode = String(code).trim().toUpperCase();

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    mockTenantInviteCodes[tenantId] = trimmedCode;
    return true;
  }

  const { error } = await supabase
    .from('tenant_invites')
    .upsert(
      {
        tenant_id: tenantId,
        code: trimmedCode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' }
    );

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] saveTenantInviteCode error:', error);
    throw error;
  }

  return true;
}

/**
 * Menyimpan kode undangan baru dengan retry otomatis jika terjadi bentrok unik (SEC-3F.2).
 * Mencoba hingga maxRetries kali (default 3). Bila sukses, mengembalikan kode yang tersimpan.
 * Bila gagal karena bentrok terus menerus atau error lain, melempar Error.
 *
 * @param {string} tenantId
 * @param {string} [tenantName='']
 * @param {number} [maxRetries=3]
 * @returns {Promise<string>} Kode undangan yang berhasil tersimpan
 */
export async function saveInviteCodeWithRetry(tenantId, tenantName = '', maxRetries = 3) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan untuk menyimpan kode undangan.');
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const code = generateInviteCode(tenantName);
    try {
      await saveTenantInviteCode(tenantId, code);
      return code;
    } catch (err) {
      lastError = err;
      const isUniqueCollision =
        err?.code === '23505' ||
        String(err?.message || '').toLowerCase().includes('duplicate key') ||
        String(err?.message || '').toLowerCase().includes('unique') ||
        String(err?.message || '').toLowerCase().includes('bentrok');

      if (!isUniqueCollision || attempt >= maxRetries) {
        throw new Error(
          `Gagal membuat kode undangan unik setelah ${attempt} percobaan: ${err?.message || 'Kode bentrok'}`
        );
      }
    }
  }

  throw lastError || new Error('Gagal menyimpan kode undangan.');
}

/**
 * Mengambil riwayat perubahan pengaturan tenant (SEC-3.3).
 * Khusus untuk field 'bank_account' maksimal 5 baris terakhir.
 * Menyertakan nama pengubah bila dapat ditemukan di tenant_members.
 *
 * @param {string} tenantId
 * @returns {Promise<Array<{ id: string, tenant_id: string, changed_by: string, changed_by_name: string|null, field: string, old_value: any, new_value: any, changed_at: string }>>}
 */
export async function fetchTenantSettingsAudit(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const list = mockTenantSettingsAudit[tenantId] || [];
    return list.slice(0, 5);
  }

  try {
    const { data: auditRows, error } = await supabase
      .from('tenant_settings_audit')
      .select('id, tenant_id, changed_by, field, old_value, new_value, changed_at')
      .eq('tenant_id', tenantId)
      .eq('field', 'bank_account')
      .order('changed_at', { ascending: false })
      .limit(5);

    if (error || !auditRows || auditRows.length === 0) {
      return [];
    }

    const userIds = [...new Set(auditRows.map((r) => r.changed_by).filter(Boolean))];
    let memberMap = {};

    if (userIds.length > 0) {
      try {
        const { data: members } = await supabase
          .from('tenant_members')
          .select('user_id, full_name')
          .eq('tenant_id', tenantId)
          .in('user_id', userIds);

        if (members) {
          members.forEach((m) => {
            if (m.user_id && m.full_name) {
              memberMap[m.user_id] = m.full_name;
            }
          });
        }
      } catch {
        // Fallback jika terjadi kesalahan saat pencarian nama member
      }
    }

    return auditRows.map((row) => ({
      ...row,
      changed_by_name: row.changed_by ? memberMap[row.changed_by] || null : null,
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tenantOperationalService] fetchTenantSettingsAudit unexpected error:', err);
    return [];
  }
}