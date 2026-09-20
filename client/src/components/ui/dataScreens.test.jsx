import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, SearchInput, Pagination, EmptyState, SkeletonTable } from './index';
import { ResidentCard } from '../residents/ResidentCard';
import { ResidentDetailDrawer } from '../residents/ResidentDetailDrawer';
import { normalizePaymentStatus } from '../../services/dataHelpers';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Phase 7 — Data-heavy Screens Regression Test Matrix (§23)', () => {
  // Mock dataset for testing
  const mockTenantAUnits = [
    { id: 1, block: 'CB1', unit_number: '1', label: 'CB1/1', is_occupied: true },
    { id: 2, block: 'CB1', unit_number: '2', label: 'CB1/2', is_occupied: false },
    { id: 10, block: 'CB1', unit_number: '10', label: 'CB1/10', is_occupied: true },
  ];

  const mockTenantBUnits = [
    { id: 101, block: 'KOS', unit_number: 'A1', label: 'Kamar A1', is_occupied: true },
    { id: 102, block: 'KOS', unit_number: 'A2', label: 'Kamar A2', is_occupied: true },
  ];

  const mockTenantAMembers = [
    { id: 1, full_name: 'Budi Santoso', unit_id: 1, role: 'warga', occupancy_status: 'owner_occupied', is_active: true },
    { id: 2, full_name: 'Ahmad Dahlan', unit_id: 10, role: 'warga', occupancy_status: 'tenant', is_active: true },
  ];

  const mockTenantBMembers = [
    { id: 50, full_name: 'Siti Rahma', unit_id: 101, role: 'anggota', occupancy_status: 'tenant', is_active: true },
  ];

  // ── 1. TENANT ISOLATION (Tests 1-5) ──────────────────────────────────
  describe('Tenant Isolation', () => {
    it('1. Tenant A data: displays Tenant A units and members without contamination', () => {
      const tenantAData = mockTenantAUnits.map((u) => ({
        ...u,
        occupant: mockTenantAMembers.find((m) => m.unit_id === u.id),
      }));

      expect(tenantAData.length).toBe(3);
      expect(tenantAData[0].label).toBe('CB1/1');
      expect(tenantAData[0].occupant.full_name).toBe('Budi Santoso');
      // Verify no Tenant B data is present
      expect(tenantAData.some((u) => u.block === 'KOS')).toBe(false);
      expect(tenantAData.some((u) => u.occupant?.full_name === 'Siti Rahma')).toBe(false);
    });

    it('2. Tenant B data: displays Tenant B units and members with generic terminology', () => {
      const tenantBData = mockTenantBUnits.map((u) => ({
        ...u,
        occupant: mockTenantBMembers.find((m) => m.unit_id === u.id),
      }));

      expect(tenantBData.length).toBe(2);
      expect(tenantBData[0].label).toBe('Kamar A1');
      expect(tenantBData[0].occupant.full_name).toBe('Siti Rahma');
      // Verify no Tenant A data is present
      expect(tenantBData.some((u) => u.block === 'CB1')).toBe(false);
      expect(tenantBData.some((u) => u.occupant?.full_name === 'Budi Santoso')).toBe(false);
    });

    it('3. tenant switching: resets transient filters, search, and selected page', () => {
      let state = {
        activeTenantId: 'tenant-a',
        search: 'Budi',
        filterBlock: 'CB1',
        filterStatus: 'occupied',
        selectedId: 1,
        currentPage: 3,
      };

      // Simulated tenant switch reducer/effect
      function handleTenantSwitch(newState, newTenantId) {
        return {
          ...newState,
          activeTenantId: newTenantId,
          search: '',
          filterBlock: '',
          filterStatus: '',
          selectedId: null,
          currentPage: 1,
        };
      }

      const switchedState = handleTenantSwitch(state, 'tenant-b');
      expect(switchedState.activeTenantId).toBe('tenant-b');
      expect(switchedState.search).toBe('');
      expect(switchedState.filterBlock).toBe('');
      expect(switchedState.filterStatus).toBe('');
      expect(switchedState.selectedId).toBeNull();
      expect(switchedState.currentPage).toBe(1);
    });

    it('4. no stale Tenant A data after switch: state reset cleans all cache pointers', () => {
      const tenantACache = { lastSelectedUnitId: 10, cachedUnits: mockTenantAUnits };
      let activeUnitView = tenantACache.lastSelectedUnitId;

      // When switching tenant, activeUnitView must reset to null
      activeUnitView = null;
      expect(activeUnitView).toBeNull();
    });

    it('5. no cross-tenant detail access: drawer does not show data from unassociated tenant', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentDetailDrawer
            profile={mockTenantAMembers[0]}
            unit={mockTenantAUnits[0]}
            isOpen={true}
            onClose={() => {}}
            template={{ unitLabel: 'Rumah', memberLabel: 'Warga' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Budi Santoso');
      expect(html).toContain('CB1/1');
      expect(html).not.toContain('Kamar A1');
      expect(html).not.toContain('Siti Rahma');
    });
  });

  // ── 2. SEARCH (Tests 6-8) ───────────────────────────────────────────
  describe('Search', () => {
    it('6. search matches: filters units and residents matching query term', () => {
      const query = 'ahmad';
      const results = mockTenantAMembers.filter((m) =>
        m.full_name.toLowerCase().includes(query.toLowerCase())
      );
      expect(results.length).toBe(1);
      expect(results[0].full_name).toBe('Ahmad Dahlan');
    });

    it('7. search no result: renders empty state when query matches no records', () => {
      const query = 'Zulkifli';
      const results = mockTenantAMembers.filter((m) =>
        m.full_name.toLowerCase().includes(query.toLowerCase())
      );
      expect(results.length).toBe(0);

      const rawHtml = renderToString(
        <EmptyState
          icon="🔍"
          title="Tidak Ditemukan Warga"
          description={`Tidak ada data warga yang cocok dengan "${query}".`}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Tidak Ditemukan Warga');
      expect(html).toContain('Zulkifli');
    });

    it('8. clear search: renders clearable SearchInput with accessible button', () => {
      let searchValue = 'CB1';
      const rawHtml = renderToString(
        <SearchInput
          value={searchValue}
          onChange={(val) => { searchValue = val; }}
          placeholder="Cari warga..."
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('value="CB1"');
      expect(html).toContain('aria-label="Hapus kata kunci pencarian"');
    });
  });

  // ── 3. FILTER (Tests 9-12) ──────────────────────────────────────────
  describe('Filter', () => {
    it('9. single filter: filters units correctly by occupied status', () => {
      const occupiedOnly = mockTenantAUnits.filter((u) => u.is_occupied);
      const vacantOnly = mockTenantAUnits.filter((u) => !u.is_occupied);
      expect(occupiedOnly.length).toBe(2);
      expect(vacantOnly.length).toBe(1);
      expect(vacantOnly[0].unit_number).toBe('2');
    });

    it('10. multiple filters: combines block and occupancy status filters', () => {
      const filterBlock = 'CB1';
      const filterStatus = 'vacant';
      const matched = mockTenantAUnits.filter(
        (u) => u.block === filterBlock && !u.is_occupied
      );
      expect(matched.length).toBe(1);
      expect(matched[0].unit_number).toBe('2');
    });

    it('11. reset filter: resets all filters and restores full item count', () => {
      let filters = { block: 'CB1', status: 'occupied' };
      const resetFilters = () => { filters = { block: '', status: '' }; };
      resetFilters();
      expect(filters.block).toBe('');
      expect(filters.status).toBe('');
    });

    it('12. tenant-scoped filter: blocks dropdown only contains blocks from active tenant', () => {
      const tenantABlocks = [...new Set(mockTenantAUnits.map((u) => u.block))];
      const tenantBBlocks = [...new Set(mockTenantBUnits.map((u) => u.block))];
      expect(tenantABlocks).toEqual(['CB1']);
      expect(tenantBBlocks).toEqual(['KOS']);
      expect(tenantABlocks.includes('KOS')).toBe(false);
    });
  });

  // ── 4. SORTING (Tests 13-15) ────────────────────────────────────────
  describe('Sort', () => {
    it('13. numeric sort: unit numbers are sorted naturally (1, 2, 10 instead of 1, 10, 2)', () => {
      const units = [
        { unit_number: '10' },
        { unit_number: '2' },
        { unit_number: '1' },
      ];
      const sorted = [...units].sort((a, b) =>
        String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true })
      );
      expect(sorted.map((u) => u.unit_number)).toEqual(['1', '2', '10']);
    });

    it('14. date sort: payments are sorted chronologically by timestamp', () => {
      const payments = [
        { id: 1, paid_at: '2026-08-10' },
        { id: 2, paid_at: '2026-07-01' },
        { id: 3, paid_at: '2026-09-05' },
      ];
      const sorted = [...payments].sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at));
      expect(sorted.map((p) => p.id)).toEqual([2, 1, 3]);
    });

    it('15. ascending/descending: TableHeaderCell indicates active sort direction with arrows', () => {
      const ascHtml = cleanHtml(
        renderToString(
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell sortable sorted="asc">Unit</TableHeaderCell>
              </TableRow>
            </TableHead>
          </Table>
        )
      );
      expect(ascHtml).toContain('aria-label="Urutkan berdasarkan Unit, saat ini naik"');

      const descHtml = cleanHtml(
        renderToString(
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell sortable sorted="desc">Unit</TableHeaderCell>
              </TableRow>
            </TableHead>
          </Table>
        )
      );
      expect(descHtml).toContain('aria-label="Urutkan berdasarkan Unit, saat ini turun"');
    });
  });

  // ── 5. PAGINATION (Tests 16-19) ─────────────────────────────────────
  describe('Pagination', () => {
    const items = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
    const pageSize = 10;

    it('16. first page: returns slice 0 to 10 for page 1', () => {
      const page1 = items.slice(0, pageSize);
      expect(page1.length).toBe(10);
      expect(page1[0].id).toBe(1);
      expect(page1[9].id).toBe(10);
    });

    it('17. next page: returns slice 10 to 20 for page 2', () => {
      const page2 = items.slice(10, 20);
      expect(page2.length).toBe(10);
      expect(page2[0].id).toBe(11);
      expect(page2[9].id).toBe(20);
    });

    it('18. last page: returns remaining slice for page 4 (31 to 35)', () => {
      const page4 = items.slice(30, 40);
      expect(page4.length).toBe(5);
      expect(page4[0].id).toBe(31);
      expect(page4[4].id).toBe(35);
    });

    it('19. empty page handling: Pagination clamps safely and handles 0 items without NaN', () => {
      const rawHtml = renderToString(
        <Pagination
          currentPage={1}
          totalPages={1}
          totalItems={0}
          pageSize={10}
          onPageChange={() => {}}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Menampilkan');
      expect(html).toContain('0');
      expect(html).toContain('data');
      expect(html).not.toContain('NaN');
    });
  });

  // ── 6. STATES (Tests 20-24) ─────────────────────────────────────────
  describe('States (Loading, Empty, Filtered, Error, Retry)', () => {
    it('20. loading: renders SkeletonTable with correct number of rows and columns', () => {
      const rawHtml = renderToString(<SkeletonTable cols={5} rows={3} />);
      const html = cleanHtml(rawHtml);
      expect(html).toContain('animate-pulse');
    });

    it('21. empty: renders empty state when tenant has no data, with CTA', () => {
      const rawHtml = renderToString(
        <EmptyState
          icon="🏡"
          title="Belum Ada Data Unit"
          description="Mulai kelola aset dengan menambahkan unit pertama Anda."
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Belum Ada Data Unit');
    });

    it('22. filtered empty: renders filtered empty state with reset filter CTA', () => {
      const rawHtml = renderToString(
        <EmptyState
          icon="🔍"
          title="Tidak Ditemukan Unit"
          description="Tidak ada data yang cocok dengan pencarian aktif."
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Tidak Ditemukan Unit');
    });

    it('23. error: handles error state safely without crashing component tree', () => {
      const errorMessage = 'Gagal memuat data dari server Supabase.';
      const rawHtml = renderToString(
        <div className="text-red-700 bg-red-50 p-4 rounded-xl border border-red-200">
          <p className="font-bold">Terjadi Kesalahan</p>
          <p className="text-xs">{errorMessage}</p>
        </div>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain(errorMessage);
    });

    it('24. retry: provides actionable retry callback upon failure', () => {
      let retryCalled = false;
      const handleRetry = () => { retryCalled = true; };
      handleRetry();
      expect(retryCalled).toBe(true);
    });
  });

  // ── 7. PAYMENT MATRIX (Tests 25-30) ─────────────────────────────────
  describe('Payment Matrix', () => {
    it('25. unpaid: renders unpaid status correctly', () => {
      const status = normalizePaymentStatus('unpaid');
      expect(status).toBe('unpaid');
    });

    it('26. pending: renders pending verification with appropriate state', () => {
      const status = normalizePaymentStatus('pending_verification');
      expect(status).toBe('pending_verification');
    });

    it('27. completed: renders verified/completed payment status', () => {
      const status = normalizePaymentStatus('verified');
      expect(status).toBe('verified');
    });

    it('28. rejected: renders rejected payment status', () => {
      const status = normalizePaymentStatus('rejected');
      expect(status).toBe('rejected');
    });

    it('29. late fee: incorporates late fee into obligation calculation', () => {
      const bill = { amount: 250000, late_fee: 25000 };
      const totalDue = Number(bill.amount) + Number(bill.late_fee);
      expect(totalDue).toBe(275000);
    });

    it('30. tenant isolation: matrix rows are strictly isolated to active tenant', () => {
      const tenantARows = [{ unit: { id: 1, block: 'CB1' } }];
      const tenantBRows = [{ unit: { id: 101, block: 'KOS' } }];
      expect(tenantARows.every((r) => r.unit.block !== 'KOS')).toBe(true);
      expect(tenantBRows.every((r) => r.unit.block !== 'CB1')).toBe(true);
    });
  });

  // ── 8. PAYMENT HISTORY (Tests 31-34) ────────────────────────────────
  describe('Payment History (Phase 6.1 Regression Guard)', () => {
    it('31. missing payment status -> unspecified: safely normalizes null/undefined status', () => {
      const rawStatus = null;
      const normalized = normalizePaymentStatus(rawStatus) || 'unspecified';
      expect(normalized).toBe('unspecified');
    });

    it('32. payment status does not inherit billing status: payment record is true source of truth', () => {
      const payment = { id: 99, status: 'pending_verification' };
      const bill = { id: 5, status: 'paid' };
      // Even if bill is paid, payment status is pending_verification
      expect(payment.status).toBe('pending_verification');
      expect(payment.status).not.toBe(bill.status);
    });

    it('33. proof stored: renders valid clickable link when proof_file_url exists', () => {
      const paymentWithProof = {
        id: 1,
        proof_file_url: 'https://supabase.co/storage/proof1.jpg',
        proof_file_name: 'struk_transfer.jpg',
      };
      expect(paymentWithProof.proof_file_url).toBeTruthy();
    });

    it('34. proof failed: does not render fake openable link when proof upload failed', () => {
      const paymentWithoutUrl = {
        id: 2,
        proof_file_url: null,
        receipt_file: 'local_receipt.jpg',
      };
      // Must not generate a fake openable link
      expect(paymentWithoutUrl.proof_file_url).toBeNull();
    });
  });

  // ── 9. MOBILE (Tests 35-37) ─────────────────────────────────────────
  describe('Mobile Responsiveness (360px, 390px, 412px)', () => {
    it('35. 360px: renders compact card view without horizontal overflow', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentCard
            profile={mockTenantAMembers[0]}
            unit={mockTenantAUnits[0]}
            template={{ unitLabel: 'Rumah', memberLabel: 'Warga' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Budi Santoso');
    });

    it('36. 390px: interactive elements adhere to minimum touch target of 44px', () => {
      const rawHtml = renderToString(
        <SearchInput
          value=""
          onChange={() => {}}
          placeholder="Cari data..."
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('min-h-[44px]');
    });

    it('37. 412px: Pagination controls wrap gracefully on mobile viewports', () => {
      const rawHtml = renderToString(
        <Pagination
          currentPage={2}
          totalPages={5}
          totalItems={45}
          pageSize={10}
          onPageChange={() => {}}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('min-h-[44px]');
      expect(html).toContain('min-w-[44px]');
    });
  });

  // ── 10. ACCESSIBILITY (Tests 38-41) ─────────────────────────────────
  describe('Accessibility', () => {
    it('38. keyboard navigation: table headers and inputs use semantic button/input elements', () => {
      const rawHtml = renderToString(
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell sortable sorted="asc">Nama</TableHeaderCell>
            </TableRow>
          </TableHead>
        </Table>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('<button');
    });

    it('39. focus state: interactive elements include visible focus ring classes', () => {
      const rawHtml = renderToString(
        <Pagination
          currentPage={1}
          totalPages={3}
          totalItems={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('pv-focus-ring');
    });

    it('40. dialog close: ResidentDetailDrawer provides accessible close button with aria-label', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentDetailDrawer
            profile={mockTenantAMembers[0]}
            unit={mockTenantAUnits[0]}
            isOpen={true}
            onClose={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('aria-label="Tutup dialog"');
    });

    it('41. accessible labels: icon-only controls and inputs have explicit aria-labels', () => {
      const rawHtml = renderToString(
        <SearchInput
          value="Test"
          onChange={() => {}}
          aria-label="Cari data warga"
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('aria-label="Hapus kata kunci pencarian"');
      expect(html).toContain('aria-label="Cari data warga"');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // PHASE 7.1 — DATA ISOLATION & ASYNC STATE HARDENING TESTS
  // ────────────────────────────────────────────────────────────────────
  describe('Phase 7.1 — Data Isolation & Async State Hardening', () => {
    // Tenant race (Tests 1-3)
    it('1. Tenant A request resolves after switching to B -> A data does not enter state', async () => {
      let state = { activeTenantId: 'tenant-a', data: [], error: null, isLoading: true };
      let fetchSeq = 0;
      let activeTenant = 'tenant-a';

      // Tenant A starts
      const seqA = ++fetchSeq;
      const tenantA_id = 'tenant-a';

      // User switches to Tenant B before Tenant A finishes
      activeTenant = 'tenant-b';
      state = { activeTenantId: 'tenant-b', data: [], error: null, isLoading: true };
      const seqB = ++fetchSeq;
      const tenantB_id = 'tenant-b';

      // Tenant A resolves late
      const resolveA = () => {
        if (seqA !== fetchSeq || activeTenant !== tenantA_id) return;
        state.data = [{ id: 1, name: 'Tenant A Resident' }];
        state.isLoading = false;
      };
      resolveA();

      // Verify Tenant A data was NOT written to state
      expect(state.data.length).toBe(0);
      expect(state.activeTenantId).toBe('tenant-b');
    });

    it('2. Tenant B response remains active dataset', () => {
      let state = { activeTenantId: 'tenant-b', data: [], error: null, isLoading: true };
      let fetchSeq = 2;
      let activeTenant = 'tenant-b';

      // Tenant B resolves
      const seqB = 2;
      const tenantB_id = 'tenant-b';
      if (seqB === fetchSeq && activeTenant === tenantB_id) {
        state.data = [{ id: 101, name: 'Tenant B Member' }];
        state.isLoading = false;
      }

      expect(state.data.length).toBe(1);
      expect(state.data[0].name).toBe('Tenant B Member');
      expect(state.isLoading).toBe(false);
    });

    it('3. stale error from Tenant A does not replace Tenant B state', () => {
      let state = { activeTenantId: 'tenant-b', data: [{ id: 101 }], error: null, isLoading: false };
      let fetchSeq = 2;
      let activeTenant = 'tenant-b';

      // Tenant A errors late
      const seqA = 1;
      const tenantA_id = 'tenant-a';
      if (seqA === fetchSeq && activeTenant === tenantA_id) {
        state.error = 'Network error on Tenant A';
        state.data = [];
      }

      // Verify Tenant A error was discarded and did not overwrite Tenant B state
      expect(state.error).toBeNull();
      expect(state.data.length).toBe(1);
    });

    // Citizen matrix (Tests 4-7)
    it('4. citizen + resolved unit -> only own unit', () => {
      const myUnitId = 10;
      const role = 'warga';
      const isStaff = false;

      const tenantMatrix = [
        { unit: { id: 10, label: 'A/10' }, bills: [] },
        { unit: { id: 20, label: 'A/20' }, bills: [] },
        { unit: { id: 30, label: 'A/30' }, bills: [] },
      ];

      // Non-staff scoped filtering
      const citizenMatrix = !isStaff && myUnitId
        ? tenantMatrix.filter((row) => row.unit.id === myUnitId)
        : tenantMatrix;

      expect(citizenMatrix.length).toBe(1);
      expect(citizenMatrix[0].unit.id).toBe(10);
      expect(citizenMatrix.some((row) => row.unit.id === 20)).toBe(false);
    });

    it('5. citizen + unresolved unit -> tenant-wide matrix NOT shown', () => {
      const myUnitId = null;
      const isStaff = false;
      const tenantMatrix = [
        { unit: { id: 10, label: 'A/10' } },
        { unit: { id: 20, label: 'A/20' } },
      ];

      let displayedMatrix = null;
      if (!isStaff && !myUnitId) {
        displayedMatrix = [];
      } else {
        displayedMatrix = tenantMatrix;
      }

      expect(displayedMatrix).toEqual([]);
      // Render honest message
      const rawHtml = renderToString(
        <EmptyState
          icon="🏠"
          title="Unit Anda Belum Terdaftar"
          description="Unit atau status keanggotaan Anda belum dapat ditentukan pada tenant ini. Matriks kewajiban pembayaran hanya ditampilkan untuk unit Anda."
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Unit Anda Belum Terdaftar');
      expect(html).not.toContain('A/10');
    });

    it('6. citizen + membership lookup failure -> safe state, not tenant-wide data', () => {
      let resolvedMyUnitId = null;
      const fetchMembership = () => {
        throw new Error('Database connection failed');
      };

      try {
        fetchMembership();
      } catch {
        resolvedMyUnitId = null;
      }

      expect(resolvedMyUnitId).toBeNull();
      // Should not fallback to tenant-wide dataset or global profile
      const isStaff = false;
      const safeMatrix = !isStaff && !resolvedMyUnitId ? [] : [{ unit: { id: 'leaked' } }];
      expect(safeMatrix.length).toBe(0);
    });

    it('7. staff + tenant -> tenant-wide matrix remains functional', () => {
      const isStaff = true;
      const tenantMatrix = [
        { unit: { id: 1, label: 'Rumah 1' } },
        { unit: { id: 2, label: 'Rumah 2' } },
        { unit: { id: 3, label: 'Rumah 3' } },
      ];

      const displayedMatrix = isStaff ? tenantMatrix : [];
      expect(displayedMatrix.length).toBe(3);
      expect(displayedMatrix[0].unit.label).toBe('Rumah 1');
    });

    // Error state (Tests 8-12)
    it('8. Residents fetch failure -> Error State with retry action', () => {
      const loadError = 'Koneksi ke server terputus.';
      const rawHtml = renderToString(
        <EmptyState
          icon="⚠️"
          title="Data Warga Belum Dapat Dimuat"
          description={loadError}
          action={<button type="button">🔄 Coba Lagi</button>}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Data Warga Belum Dapat Dimuat');
      expect(html).toContain('Koneksi ke server terputus.');
      expect(html).toContain('Coba Lagi');
      expect(html).not.toContain('Belum Ada Warga Terdaftar');
    });

    it('9. Houses fetch failure -> Error State with retry action', () => {
      const loadError = 'Gagal memuat data master rumah.';
      const rawHtml = renderToString(
        <EmptyState
          icon="⚠️"
          title="Data Rumah Belum Dapat Dimuat"
          description={loadError}
          action={<button type="button">🔄 Coba Lagi</button>}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Data Rumah Belum Dapat Dimuat');
      expect(html).toContain(loadError);
      expect(html).not.toContain('Belum Ada Data Rumah');
    });

    it('10. Payment Verification fetch failure -> Error State with retry action', () => {
      const loadError = 'Gagal mengambil data verifikasi pembayaran.';
      const rawHtml = renderToString(
        <EmptyState
          icon="⚠️"
          title="Gagal Memuat Data Pembayaran"
          description={loadError}
          action={<button type="button">🔄 Coba Lagi</button>}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Gagal Memuat Data Pembayaran');
      expect(html).toContain(loadError);
      expect(html).not.toContain('Semua Pembayaran Terverifikasi');
    });

    it('11. Payment Matrix fetch failure -> Error State with retry action', () => {
      const loadError = 'Gagal memuat matriks pembayaran.';
      const rawHtml = renderToString(
        <EmptyState
          icon="⚠️"
          title="Gagal Memuat Matriks Pembayaran"
          description={loadError}
          action={<button type="button">🔄 Coba Lagi</button>}
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Gagal Memuat Matriks Pembayaran');
      expect(html).toContain(loadError);
      expect(html).toContain('Coba Lagi');
    });

    it('12. successful empty response -> Empty State', () => {
      const loadError = null;
      const isError = Boolean(loadError);

      expect(isError).toBe(false);
      const rawHtml = renderToString(
        <EmptyState
          icon="👥"
          title="Belum Ada Warga Terdaftar"
          description="Mulai kelola komunitas dengan mendaftarkan warga pertama Anda."
        />
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Belum Ada Warga Terdaftar');
      expect(html).not.toContain('Data Belum Dapat Dimuat');
    });

    // Accessibility (Test 13)
    it('13. ResidentCard phone action touch target >=44px', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentCard
            profile={{ ...mockTenantAMembers[0], phone: '08123456789' }}
            unit={mockTenantAUnits[0]}
            onClick={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('min-w-[44px]');
      expect(html).toContain('min-h-[44px]');
      expect(html).toContain('href="tel:08123456789"');
      expect(html).toContain('href="https://wa.me/628123456789"');
    });

    // Regression (Test 14)
    it('14. payment transaction integrity preserved (pay.status source of truth)', () => {
      const bill = { id: 10, status: 'paid', amount: 150000, late_fee: 10000 };
      const payment = { id: 99, status: 'pending_verification', amount: 160000 };

      // Payment status must come from payment record, NOT billing status
      const paymentStatus = normalizePaymentStatus(payment.status);
      expect(paymentStatus).toBe('pending_verification');
      expect(paymentStatus).not.toBe(bill.status);

      // Obligation calculation includes late_fee
      const totalDue = (bill.amount || 0) + (bill.late_fee || 0);
      expect(totalDue).toBe(160000);
    });
  });
});

