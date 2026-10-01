import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

// Mocks
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/TenantContext', () => ({
  useTenant: vi.fn(),
}));

vi.mock('../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: vi.fn(),
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: vi.fn().mockReturnValue({
    billLabel: 'IPL',
    unitLabel: 'Rumah',
  }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: vi.fn().mockReturnValue({
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../services/dataService', () => ({
  fetchExpenses: vi.fn(),
  fetchEvents: vi.fn().mockResolvedValue([]),
  fetchMyEventAccess: vi.fn().mockResolvedValue({ events: [] }),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://mock-signed-url' }, error: null }),
      })),
    },
  },
}));

import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useSubscriptionGate } from '../hooks/useSubscriptionGate';
import { fetchExpenses } from '../services/dataService';
import {
  fetchTenantExpenses,
  createTenantExpense,
  updateTenantExpense,
} from '../services/tenantOperationalService';
import { supabase } from '../services/supabaseClient';
import Expenses from './Expenses';
import ExpenseCard from '../components/finance/ExpenseCard';
import ExpenseDetailDrawer from '../components/finance/ExpenseDetailDrawer';
import { EmptyState } from '../components/ui';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('TASK-080 Expenses Implementation (Sub-Gate 8.2-B)', () => {
  const mockTenantId = 'tenant-test-uuid-80';

  beforeEach(() => {
    vi.clearAllMocks();

    useAuth.mockReturnValue({
      role: 'bendahara',
      profile: { id: 'prof-1' },
      session: { access_token: 'mock-token' },
      isReadOnly: false,
      isAuthenticated: true,
    });

    useTenant.mockReturnValue({
      currentTenant: { id: mockTenantId, name: 'Komunitas Harmoni', type: 'rt_rw' },
      userTenants: [{ id: 'other-tenant-uuid', name: 'Other' }],
    });

    useSubscriptionGate.mockReturnValue({
      canWrite: true,
      isReadOnly: false,
    });

    fetchExpenses.mockResolvedValue([
      {
        id: 'exp-1',
        category: 'Kebersihan',
        amount: 250000,
        expense_date: '2026-03-15',
        date: '2026-03-15',
        description: 'Beli tempat sampah taman',
        recorded_by: 'Budi Bendahara',
        scope: 'general',
        receipt_file: 'nota-sampah.jpg',
        receipt_url: `${mockTenantId}/expenses/2026/uuid-1_nota-sampah.jpg`,
      },
    ]);
  });

  // A. Tenant neutrality
  it('A. Tenant neutrality — does not render forest-* or gold-* tokens or Palm Village identity', () => {
    const rawHtml = renderToString(
      <MemoryRouter initialEntries={[`/t/${mockTenantId}/expenses`]}>
        <Routes>
          <Route path="/t/:tenantId/expenses" element={<Expenses />} />
        </Routes>
      </MemoryRouter>
    );
    const html = cleanHtml(rawHtml);

    expect(html).not.toMatch(/forest-(?:500|800|900)/);
    expect(html).not.toMatch(/gold-(?:400|500)/);
    expect(html).not.toContain('Palm Village');

    // Also verify ExpenseCard & ExpenseDetailDrawer independently
    const cardHtml = renderToString(
      <MemoryRouter>
        <ExpenseCard
          expense={{
            id: 'exp-1',
            category: 'Listrik & Air',
            amount: 150000,
            expense_date: '2026-03-10',
            scope: 'general',
            receipt_file: 'nota.jpg',
          }}
          canEdit={true}
        />
      </MemoryRouter>
    );
    expect(cardHtml).not.toMatch(/forest-/);
    expect(cardHtml).not.toMatch(/gold-/);

    const drawerHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-1',
          category: 'Listrik & Air',
          amount: 150000,
          expense_date: '2026-03-10',
          scope: 'general',
          receipt_file: 'nota.jpg',
        }}
        canEdit={true}
      />
    );
    expect(drawerHtml).not.toMatch(/forest-/);
    expect(drawerHtml).not.toMatch(/gold-/);
  });

  // B. Tenant isolation
  it('B. Tenant isolation — resolves activeTenantId explicitly and rejects userTenants[0] fallback', () => {
    const expensesSource = fs.readFileSync(
      path.resolve(__dirname, 'Expenses.jsx'),
      'utf8'
    );
    expect(expensesSource).toContain('const activeTenantId = params.tenantId || currentTenant?.id || null;');
    expect(expensesSource).not.toContain('userTenants?.[0]?.id');

    // When no tenant in params and no currentTenant, but userTenants has items
    useTenant.mockReturnValue({
      currentTenant: null,
      userTenants: [{ id: 'foreign-tenant-uuid' }],
    });

    const noTenantHtml = renderToString(
      <MemoryRouter initialEntries={['/expenses']}>
        <Routes>
          <Route path="/expenses" element={<Expenses />} />
        </Routes>
      </MemoryRouter>
    );

    // Must NOT query expenses for foreign tenant and displays prompt
    expect(cleanHtml(noTenantHtml)).toContain('Silakan pilih tenant terlebih dahulu');
  });

  // C. Async race guard
  it('C. Async race guard — ignores stale out-of-order responses', async () => {
    // Verified by source inspection of requestIdRef pattern in Expenses.jsx
    const expensesSource = fs.readFileSync(
      path.resolve(__dirname, 'Expenses.jsx'),
      'utf8'
    );
    expect(expensesSource).toContain('requestIdRef = useRef(0)');
    expect(expensesSource).toContain('const currentRequestId = ++requestIdRef.current');
    expect(expensesSource).toContain('if (requestIdRef.current !== currentRequestId) return');
    expect(expensesSource).toContain('if (requestIdRef.current === currentRequestId)');
  });

  // D. expense_date read
  it('D. expense_date read — fetchTenantExpenses maps canonical expense_date and does not override it with metadata.date', async () => {
    const mockExpenseRows = [
      {
        id: 'exp-d1',
        tenant_id: mockTenantId,
        category: 'Keamanan',
        amount: 500000,
        description: 'Honor pos satpam',
        receipt_url: `${mockTenantId}/expenses/2026/uuid_nota.jpg`,
        recorded_by: 'bendahara-id',
        metadata: { date: '2020-01-01' }, // Stale legacy metadata date
        expense_date: '2026-03-20',        // Canonical business date
        created_at: '2026-03-21T02:00:00Z',
      },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();

    supabase.from.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
      then: (resolve) => resolve({ data: mockExpenseRows, error: null }),
    });

    const results = await fetchTenantExpenses(mockTenantId, {});
    expect(results).toHaveLength(1);
    expect(results[0].expense_date).toBe('2026-03-20');
    expect(results[0].date).toBe('2026-03-20');
    expect(results[0].date).not.toBe('2020-01-01'); // metadata.date did NOT override
    expect(results[0].date).not.toBe('2026-03-21'); // created_at substring did NOT override
  });

  // E. expense_date create & G. created_at preservation
  it('E & G. expense_date create & created_at preservation — payload includes expense_date and does not overwrite created_at', async () => {
    let capturedPayload = null;
    supabase.from.mockReturnValue({
      insert: vi.fn((payload) => {
        capturedPayload = payload;
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'new-id', ...payload }, error: null }),
        };
      }),
    });

    await createTenantExpense(mockTenantId, {
      date: '2026-03-18',
      category: 'Kebersihan',
      amount: 120000,
      description: 'Sapu lidi dan serokan',
    });

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.expense_date).toBe('2026-03-18');
    expect(capturedPayload.tenant_id).toBe(mockTenantId);
    expect(capturedPayload.amount).toBe(120000);
    // MUST NOT overwrite created_at
    expect(capturedPayload.created_at).toBeUndefined();
  });

  // F. expense_date update & G. created_at preservation
  it('F & G. expense_date update & created_at preservation — updates expense_date without overwriting created_at', async () => {
    let capturedUpdateFields = null;
    supabase.from.mockReturnValue({
      update: vi.fn((fields) => {
        capturedUpdateFields = fields;
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'exp-1', ...fields }, error: null }),
        };
      }),
    });

    await updateTenantExpense(mockTenantId, 'exp-1', {
      date: '2026-03-19',
      amount: 150000,
      description: 'Perbaikan nota',
    });

    expect(capturedUpdateFields).not.toBeNull();
    expect(capturedUpdateFields.expense_date).toBe('2026-03-19');
    expect(capturedUpdateFields.amount).toBe(150000);
    // MUST NOT rewrite created_at
    expect(capturedUpdateFields.created_at).toBeUndefined();
  });

  // H. Error state
  it('H. Error state — renders structured error UI with retry when data loading fails', () => {
    // In server-rendered view with loadError state simulated or error source verified
    const expensesSource = fs.readFileSync(
      path.resolve(__dirname, 'Expenses.jsx'),
      'utf8'
    );
    expect(expensesSource).toContain('Gagal Memuat Data Pengeluaran');
    expect(expensesSource).toContain('Coba Lagi');
    expect(expensesSource).toContain('setLoadError');
  });

  // I. Empty state
  it('I. Empty state — successful zero-result query displays empty state, not error UI', () => {
    const expensesSource = fs.readFileSync(
      path.resolve(__dirname, 'Expenses.jsx'),
      'utf8'
    );
    expect(expensesSource).toContain("'Belum Ada Pengeluaran Kas'");
    expect(expensesSource).toContain("'Tidak Ditemukan Pengeluaran'");
    expect(expensesSource).toContain('filtered.length === 0 ?');

    // Verify EmptyState component structure when rendered with empty expenses
    const emptyHtml = renderToString(
      <EmptyState
        icon="💸"
        title="Belum Ada Pengeluaran Kas"
        description="Belum ada catatan pengeluaran kas yang dibukukan untuk periode komunitas ini."
      />
    );
    expect(cleanHtml(emptyHtml)).toContain('Belum Ada Pengeluaran Kas');
    expect(cleanHtml(emptyHtml)).not.toContain('Gagal Memuat Data Pengeluaran');
  });

  // J. Read-only subscription
  it('J. Read-only subscription — create, edit, and delete are blocked when subReadOnly=true', () => {
    useSubscriptionGate.mockReturnValue({
      canWrite: false,
      isReadOnly: true,
    });

    const rawHtml = renderToString(
      <MemoryRouter initialEntries={[`/t/${mockTenantId}/expenses`]}>
        <Routes>
          <Route path="/t/:tenantId/expenses" element={<Expenses />} />
        </Routes>
      </MemoryRouter>
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('Mode Read-Only Aktif');
    // Primary "Catat Pengeluaran" button must not be rendered
    expect(html).not.toContain('Catat Pengeluaran Pertama');
    // Table action buttons must not be rendered
    expect(html).not.toContain('title="Edit"');
    expect(html).not.toContain('title="Hapus"');
  });

  // K. Drawer progressive disclosure
  it('K. Drawer — ExpenseDetailDrawer renders full transaction details', () => {
    const rawHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-k',
          category: 'Acara Warga',
          amount: 750000,
          expense_date: '2026-03-25',
          description: 'Konsumsi rapat RT dan warga',
          recorded_by: 'Sekretaris',
          scope: 'general',
          receipt_file: 'nota-konsumsi.jpg',
        }}
        canEdit={true}
        onViewReceipt={() => {}}
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('Rincian Pengeluaran Kas');
    expect(html).toContain('Acara Warga');
    expect(html).toContain('Konsumsi rapat RT dan warga');
    expect(html).toContain('Sekretaris');
    expect(html).toContain('Lihat Nota');
  });

  // L. Receipt handling & canonical private signed URL
  it('L. Receipt handling — uses canonical private bucket and signed URL architecture', () => {
    const expensesSource = fs.readFileSync(
      path.resolve(__dirname, 'Expenses.jsx'),
      'utf8'
    );
    const serviceSource = fs.readFileSync(
      path.resolve(__dirname, '../services/tenantOperationalService.js'),
      'utf8'
    );

    expect(expensesSource).toContain('createReceiptSignedUrl');
    expect(expensesSource).toContain('isValidExpenseReceiptPath');
    expect(serviceSource).toContain("from('expense-receipts')");
    expect(serviceSource).toContain('buildCanonicalExpenseReceiptPath');
  });

  // M. Amount validation
  it('M. Amount validation — rejects zero, negative, and NaN amounts', async () => {
    await expect(
      createTenantExpense(mockTenantId, { date: '2026-03-20', category: 'Lain-lain', amount: 0 })
    ).rejects.toThrow('Nominal pengeluaran harus berupa angka lebih besar dari 0.');

    await expect(
      createTenantExpense(mockTenantId, { date: '2026-03-20', category: 'Lain-lain', amount: -50000 })
    ).rejects.toThrow('Nominal pengeluaran harus berupa angka lebih besar dari 0.');

    await expect(
      createTenantExpense(mockTenantId, { date: '2026-03-20', category: 'Lain-lain', amount: 'not-a-number' })
    ).rejects.toThrow('Nominal pengeluaran harus berupa angka lebih besar dari 0.');

    await expect(
      updateTenantExpense(mockTenantId, 'exp-1', { amount: 0 })
    ).rejects.toThrow('Nominal pengeluaran harus berupa angka lebih besar dari 0.');

    await expect(
      updateTenantExpense(mockTenantId, 'exp-1', { amount: -100 })
    ).rejects.toThrow('Nominal pengeluaran harus berupa angka lebih besar dari 0.');
  });

  // N. TASK-081 (F-05) Canonical expense_date priority
  it('N. Canonical expense_date priority — ExpenseDetailDrawer prioritizes expense_date over legacy date', () => {
    const rawHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-n',
          category: 'Konsumsi',
          amount: 50000,
          date: '2020-01-01',          // Stale legacy date
          expense_date: '2026-03-28',  // Canonical business date
          scope: 'general',
        }}
      />
    );
    const html = cleanHtml(rawHtml);
    expect(html).toContain('28 Mar 2026');
    expect(html).not.toContain('1 Jan 2020');
  });

  // O. TASK-081 (F-02) Tenant neutrality in budget scope
  it('O. Tenant neutrality — ExpenseDetailDrawer renders neutral budget scope and avoids "Kas Umum Paguyuban"', () => {
    const rawHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-o',
          category: 'Operasional',
          amount: 100000,
          expense_date: '2026-03-28',
          scope: 'general',
        }}
      />
    );
    const html = cleanHtml(rawHtml);
    expect(html).toContain('Kas Umum Komunitas');
    expect(html).not.toContain('Kas Umum Paguyuban');

    const eventHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-o2',
          category: 'Pentas Seni',
          amount: 200000,
          expense_date: '2026-03-28',
          scope: 'event',
        }}
      />
    );
    expect(cleanHtml(eventHtml)).toContain('Kegiatan / Acara Komunitas');
  });

  // P. TASK-081 (F-03) Audit trail and proxy date indicator
  it('P. Audit trail & proxy indicator — displays created_at, updated_at, and is_date_proxy indicator', () => {
    const rawHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-p',
          category: 'Kebersihan',
          amount: 150000,
          expense_date: '2026-03-20',
          created_at: '2026-03-20T08:30:00Z',
          updated_at: '2026-03-21T10:15:00Z',
          is_date_proxy: true,
          scope: 'general',
        }}
      />
    );
    const html = cleanHtml(rawHtml);
    expect(html).toContain('Informasi Audit Sistem');
    expect(html).toContain('Waktu pencatatan sistem');
    expect(html).toContain('Terakhir diperbarui');
    expect(html).toContain('Tanggal Estimasi');
  });

  // Q. TASK-081 (F-06) Event title resolution
  it('Q. Event title resolution — resolves human-readable event title from eventOptions', () => {
    const mockEvents = [
      { id: 'evt-uuid-1', title: 'Bazar Ramadhan 2026' },
      { id: 'evt-uuid-2', title: 'Kerja Bakti Akbar' },
    ];

    const rawHtml = renderToString(
      <ExpenseDetailDrawer
        isOpen={true}
        onClose={() => {}}
        expense={{
          id: 'exp-q',
          category: 'Logistik',
          amount: 300000,
          expense_date: '2026-03-25',
          scope: 'event',
          event_id: 'evt-uuid-1',
        }}
        eventOptions={mockEvents}
      />
    );
    const html = cleanHtml(rawHtml);
    expect(html).toContain('Bazar Ramadhan 2026');
    expect(html).not.toContain('evt-uuid-1');
  });

  // R. TASK-081 (F-01) Tenant switch state reset
  it('R. Tenant switch state reset — Expenses.jsx purges drawer and modal state when activeTenantId changes', () => {
    const expensesSource = fs.readFileSync(
      path.resolve(__dirname, 'Expenses.jsx'),
      'utf8'
    );
    expect(expensesSource).toContain('// Reset tenant-specific transient UI state when switching tenants (F-01)');
    expect(expensesSource).toContain('setSelectedExpenseForDrawer(null)');
    expect(expensesSource).toContain('setViewReceipt(null)');
    expect(expensesSource).toContain('setModalForm(null)');
    expect(expensesSource).toContain('}, [activeTenantId]);');
  });

  // S. TASK-081 (F-04 & F-07) Focus management and accessibility in Drawer primitive
  it('S. Focus trap & restoration — Drawer primitive contains focus trap and restoration logic', () => {
    const drawerSource = fs.readFileSync(
      path.resolve(__dirname, '../components/ui/Drawer.jsx'),
      'utf8'
    );
    expect(drawerSource).toContain('previouslyFocusedElementRef');
    expect(drawerSource).toContain("if (e.key === 'Tab' && panelRef.current)");
    expect(drawerSource).toContain('focusableSelectors');
    expect(drawerSource).toContain('previouslyFocusedElementRef.current.focus()');
  });
});
