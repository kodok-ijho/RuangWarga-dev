import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveKosSetupUnitsAndInvite } from './KosSetupWizard';

describe('KosSetupWizard - saveKosSetupUnitsAndInvite (VERT-1.4)', () => {
  const TENANT_ID = 'kos-tenant-123';
  const KOS_NAME = 'Kos Mawar Indah';

  let mockFetchUnits;
  let mockCreateUnits;
  let mockFetchCode;
  let mockSaveCode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUnits = vi.fn();
    mockCreateUnits = vi.fn().mockResolvedValue([]);
    mockFetchCode = vi.fn();
    mockSaveCode = vi.fn().mockResolvedValue('NEW-INVITE-CODE');
  });

  it('bila fetchTenantUnits mengembalikan Kamar 101 dan wizard berisi Kamar 101 + Kamar 102, bulkCreateTenantUnits hanya menerima Kamar 102', async () => {
    mockFetchUnits.mockResolvedValue([{ id: 1, label: 'Kamar 101' }]);
    mockFetchCode.mockResolvedValue('EXISTING-INVITE-CODE');

    const roomList = [
      { label: 'Kamar 101', price: 1500000, facilities: ['AC', 'WiFi'] },
      { label: 'Kamar 102', price: 1600000, facilities: ['AC', 'WiFi', 'Kamar Mandi Dalam'] },
    ];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockFetchUnits).toHaveBeenCalledWith(TENANT_ID);
    expect(mockCreateUnits).toHaveBeenCalledTimes(1);

    const createdArg = mockCreateUnits.mock.calls[0][1];
    expect(createdArg).toHaveLength(1);
    expect(createdArg[0].label).toBe('Kamar 102');
    expect(createdArg[0].status).toBe('vacant');
    expect(createdArg[0].metadata.default_rent_price).toBe(1600000);
    expect(createdArg[0].metadata.facilities).toEqual(['AC', 'WiFi', 'Kamar Mandi Dalam']);

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('bila fetchTenantInviteCode mengembalikan kode, saveInviteCodeWithRetry tidak dipanggil', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue('EXISTING-INVITE-CODE');

    const roomList = [{ label: 'Kamar 101' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockFetchCode).toHaveBeenCalledWith(TENANT_ID);
    expect(mockSaveCode).not.toHaveBeenCalled();
    expect(result.savedInviteCode).toBe('EXISTING-INVITE-CODE');
  });

  it('bila fetchTenantInviteCode mengembalikan null, saveInviteCodeWithRetry dipanggil untuk membuat kode baru', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue(null);

    const roomList = [{ label: 'Kamar 101' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockFetchCode).toHaveBeenCalledWith(TENANT_ID);
    expect(mockSaveCode).toHaveBeenCalledWith(TENANT_ID, KOS_NAME);
    expect(result.savedInviteCode).toBe('NEW-INVITE-CODE');
  });

  it('bila semua kamar sudah ada di database, bulkCreateTenantUnits tidak dipanggil', async () => {
    mockFetchUnits.mockResolvedValue([
      { id: 1, label: 'Kamar 101' },
      { id: 2, label: 'Kamar 102' },
    ]);
    mockFetchCode.mockResolvedValue('CODE-123');

    const roomList = [{ label: 'kamar 101' }, { label: '  Kamar 102 ' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockCreateUnits).not.toHaveBeenCalled();
    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(2);
  });

  it('label yang diketik ganda di wizard hanya disisipkan sekali', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue('CODE-123');

    const roomList = [{ label: 'Kamar 103' }, { label: 'kamar 103 ' }, { label: 'Kamar 104' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    const createdArg = mockCreateUnits.mock.calls[0][1];
    expect(createdArg.map((r) => r.label)).toEqual(['Kamar 103', 'Kamar 104']);
    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });
});
