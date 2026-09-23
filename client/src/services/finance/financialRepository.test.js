import { describe, it, expect, vi } from 'vitest';
import {
  assertValidTenantId,
  assertValidCalendarDate,
  calendarDateToJakartaBoundaryUtcIso,
  normalizePaymentRecord,
  normalizeNonIplIncomeRecord,
  normalizeExpenseRecord,
  normalizeFinancialRecord,
  getTenantOpeningBalance,
  fetchTenantPayments,
  fetchTenantUnresolvedPayments,
  fetchTenantNonIplIncomes,
  fetchTenantExpenses,
  fetchTenantFinancialRecords,
} from './financialRepository.js';
import { aggregatePeriodCashFlow } from './financialAggregation.js';

/**
 * Creates a mock Supabase client for testing repository I/O and query contracts.
 */
function createMockSupabaseClient({
  rpcHandler = () => ({ data: '0.00', error: null }),
  tableHandlers = {},
} = {}) {
  const queryLog = [];

  const createTableQueryBuilder = (tableName) => {
    const filters = [];
    const orders = [];
    let rangeArgs = null;
    let signalReceived = null;

    const builder = {
      _tableName: tableName,
      select: vi.fn().mockImplementation((fields) => {
        filters.push({ type: 'select', fields });
        return builder;
      }),
      eq: vi.fn().mockImplementation((col, val) => {
        filters.push({ type: 'eq', col, val });
        return builder;
      }),
      gte: vi.fn().mockImplementation((col, val) => {
        filters.push({ type: 'gte', col, val });
        return builder;
      }),
      lt: vi.fn().mockImplementation((col, val) => {
        filters.push({ type: 'lt', col, val });
        return builder;
      }),
      gt: vi.fn().mockImplementation((col, val) => {
        filters.push({ type: 'gt', col, val });
        return builder;
      }),
      is: vi.fn().mockImplementation((col, val) => {
        filters.push({ type: 'is', col, val });
        return builder;
      }),
      order: vi.fn().mockImplementation((col, opts) => {
        orders.push({ col, opts });
        return builder;
      }),
      range: vi.fn().mockImplementation((from, to) => {
        rangeArgs = { from, to };
        return builder;
      }),
      abortSignal: vi.fn().mockImplementation((sig) => {
        signalReceived = sig;
        return builder;
      }),
      then: (resolve, reject) => {
        queryLog.push({
          table: tableName,
          filters,
          orders,
          rangeArgs,
          signalReceived,
        });

        if (signalReceived?.aborted) {
          const abortError = new Error('AbortError: This operation was aborted');
          abortError.name = 'AbortError';
          return resolve({ data: null, error: abortError });
        }

        const handler = tableHandlers[tableName];
        if (handler) {
          const result = handler({ filters, orders, rangeArgs, signal: signalReceived });
          return resolve(result);
        }

        return resolve({ data: [], error: null });
      },
    };

    return builder;
  };

  const client = {
    _queryLog: queryLog,
    from: vi.fn().mockImplementation((tableName) => createTableQueryBuilder(tableName)),
    rpc: vi.fn().mockImplementation((fnName, fnArgs) => {
      let signalReceived = null;
      const rpcBuilder = {
        abortSignal: vi.fn().mockImplementation((sig) => {
          signalReceived = sig;
          return rpcBuilder;
        }),
        then: (resolve) => {
          queryLog.push({
            type: 'rpc',
            fnName,
            fnArgs,
            signalReceived,
          });

          if (signalReceived?.aborted) {
            const abortError = new Error('AbortError: This operation was aborted');
            abortError.name = 'AbortError';
            return resolve({ data: null, error: abortError });
          }

          return resolve(rpcHandler({ fnName, fnArgs, signal: signalReceived }));
        },
      };
      return rpcBuilder;
    }),
  };

  return client;
}

describe('Financial Repository (Sub-Gate 8.1-C4)', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  describe('1. Tenant Isolation & Validation', () => {
    it('throws explicit error when tenantId is null, undefined, or empty whitespace', () => {
      expect(() => assertValidTenantId(null)).toThrow('Tenant ID is required and must be a non-empty string.');
      expect(() => assertValidTenantId(undefined)).toThrow('Tenant ID is required and must be a non-empty string.');
      expect(() => assertValidTenantId('')).toThrow('Tenant ID is required and must be a non-empty string.');
      expect(() => assertValidTenantId('   ')).toThrow('Tenant ID is required and must be a non-empty string.');
      expect(() => assertValidTenantId(12345)).toThrow('Tenant ID is required and must be a non-empty string.');
    });

    it('passes for valid non-empty string tenantId', () => {
      expect(() => assertValidTenantId(tenantA)).not.toThrow();
    });

    it('enforces tenant_id in payments query and never defaults implicitly', async () => {
      const mock = createMockSupabaseClient();
      await fetchTenantPayments({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });

      expect(mock._queryLog).toHaveLength(1);
      const query = mock._queryLog[0];
      expect(query.table).toBe('payments');
      const tenantFilter = query.filters.find((f) => f.type === 'eq' && f.col === 'tenant_id');
      expect(tenantFilter).toBeDefined();
      expect(tenantFilter.val).toBe(tenantA);
    });

    it('differentiates tenant A query from tenant B query', async () => {
      const mock = createMockSupabaseClient();
      await fetchTenantExpenses({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });
      await fetchTenantExpenses({
        tenantId: tenantB,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });

      expect(mock._queryLog).toHaveLength(2);
      const queryA = mock._queryLog[0];
      const queryB = mock._queryLog[1];
      expect(queryA.filters.find((f) => f.col === 'tenant_id').val).toBe(tenantA);
      expect(queryB.filters.find((f) => f.col === 'tenant_id').val).toBe(tenantB);
    });
  });

  describe('2. Calendar Date Validation & WIB Boundaries', () => {
    it('validates calendar date format YYYY-MM-DD and rejects non-calendar dates', () => {
      expect(() => assertValidCalendarDate('2026-08-01')).not.toThrow();
      expect(() => assertValidCalendarDate('2026-02-29')).toThrow('day must be between 1 and 28'); // 2026 is non-leap
      expect(() => assertValidCalendarDate('2024-02-29')).not.toThrow(); // 2024 is leap
      expect(() => assertValidCalendarDate('2026-13-01')).toThrow('month must be between 1 and 12');
      expect(() => assertValidCalendarDate('2026/08/01')).toThrow("must be formatted as 'YYYY-MM-DD'");
      expect(() => assertValidCalendarDate('')).toThrow('valid');
    });

    it('converts calendar date to exact Asia/Jakarta boundary in UTC ISO-8601', () => {
      // 2026-08-01 00:00:00 WIB (UTC+7) -> 2026-07-31T17:00:00.000Z
      expect(calendarDateToJakartaBoundaryUtcIso('2026-08-01')).toBe('2026-07-31T17:00:00.000Z');
      // 2026-09-01 00:00:00 WIB (UTC+7) -> 2026-08-31T17:00:00.000Z
      expect(calendarDateToJakartaBoundaryUtcIso('2026-09-01')).toBe('2026-08-31T17:00:00.000Z');
    });

    it('verifies that bounded payment query uses the exact WIB boundary range [startWib, endWib)', async () => {
      const mock = createMockSupabaseClient();
      await fetchTenantPayments({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });

      const query = mock._queryLog[0];
      const gteFilter = query.filters.find((f) => f.type === 'gte' && f.col === 'paid_at');
      const ltFilter = query.filters.find((f) => f.type === 'lt' && f.col === 'paid_at');

      expect(gteFilter.val).toBe('2026-07-31T17:00:00.000Z');
      expect(ltFilter.val).toBe('2026-08-31T17:00:00.000Z');
    });
  });

  describe('3. Payment Normalization', () => {
    it('normalizes a completed monetary payment with valid paid_at into recognized cash', () => {
      const raw = {
        id: 'pay-1',
        tenant_id: tenantA,
        amount: '150000.00',
        status: 'completed',
        paid_at: '2026-08-15T10:00:00Z',
        category: 'IPL',
        description: 'IPL Agustus',
      };

      const norm = normalizePaymentRecord(raw);
      expect(norm).toEqual({
        id: 'pay-1',
        tenantId: tenantA,
        entityType: 'payment',
        amountMinorUnits: 15000000,
        canonicalDate: '2026-08-15',
        isRecognizedCash: true,
        isUnresolved: false,
        unresolvedReason: null,
        status: 'completed',
        category: 'IPL',
        description: 'IPL Agustus',
        raw,
      });
    });

    it('normalizes a zero-amount completed payment as NOT recognized cash and NOT unresolved', () => {
      const raw = {
        id: 'pay-zero',
        tenant_id: tenantA,
        amount: '0.00',
        status: 'completed',
        paid_at: '2026-08-15T10:00:00Z',
      };

      const norm = normalizePaymentRecord(raw);
      expect(norm.amountMinorUnits).toBe(0);
      expect(norm.isRecognizedCash).toBe(false);
      expect(norm.isUnresolved).toBe(false);
      expect(norm.unresolvedReason).toBeNull();
    });

    it('normalizes pending and pending_verification payments as NOT recognized cash', () => {
      const pendingRaw = {
        id: 'pay-pending',
        tenant_id: tenantA,
        amount: '100000.00',
        status: 'pending',
        paid_at: '2026-08-15T10:00:00Z',
      };
      const verificationRaw = {
        id: 'pay-verif',
        tenant_id: tenantA,
        amount: '100000.00',
        status: 'pending_verification',
        paid_at: '2026-08-15T10:00:00Z',
      };

      expect(normalizePaymentRecord(pendingRaw).isRecognizedCash).toBe(false);
      expect(normalizePaymentRecord(verificationRaw).isRecognizedCash).toBe(false);
    });

    it('normalizes rejected payment as NOT recognized cash', () => {
      const rejectedRaw = {
        id: 'pay-rejected',
        tenant_id: tenantA,
        amount: '100000.00',
        status: 'rejected',
        paid_at: '2026-08-15T10:00:00Z',
      };

      const norm = normalizePaymentRecord(rejectedRaw);
      expect(norm.isRecognizedCash).toBe(false);
      expect(norm.isUnresolved).toBe(false);
    });

    it('normalizes completed monetary payment missing paid_at as UNRESOLVED record with null canonicalDate', () => {
      const unresolvedRaw = {
        id: 'pay-unresolved',
        tenant_id: tenantA,
        amount: '250000.00',
        status: 'completed',
        paid_at: null,
        created_at: '2026-08-10T12:00:00Z',
        metadata: { billing_period: '2026-08' },
      };

      const norm = normalizePaymentRecord(unresolvedRaw);
      expect(norm.canonicalDate).toBeNull();
      expect(norm.isRecognizedCash).toBe(false);
      expect(norm.isUnresolved).toBe(true);
      expect(norm.unresolvedReason).toBe(
        'Completed monetary payment missing canonical paid_at cash date'
      );
      // Ensures created_at or billing period are NEVER fabricated as cash date
      expect(norm.canonicalDate).not.toBe('2026-08-10');
      expect(norm.canonicalDate).not.toBe('2026-08-01');
    });

    it('resolves canonical paid_at under Asia/Jakarta calendar boundary correctly', () => {
      // 2026-08-31T16:59:59Z is 23:59:59 WIB on August 31
      const augEnd = normalizePaymentRecord({
        id: 'p-aug',
        amount: '100',
        status: 'completed',
        paid_at: '2026-08-31T16:59:59Z',
      });
      expect(augEnd.canonicalDate).toBe('2026-08-31');

      // 2026-08-31T17:00:00Z is 00:00:00 WIB on September 1
      const septStart = normalizePaymentRecord({
        id: 'p-sept',
        amount: '100',
        status: 'completed',
        paid_at: '2026-08-31T17:00:00Z',
      });
      expect(septStart.canonicalDate).toBe('2026-09-01');
    });
  });

  describe('4. Non-IPL Income Normalization', () => {
    it('normalizes verified non-IPL income as recognized cash', () => {
      const raw = {
        id: 'income-1',
        tenant_id: tenantA,
        income_date: '2026-08-20',
        amount: '500000.00',
        category: 'sewa_lapangan',
        source_name: 'Komunitas Futsal',
        description: 'Sewa lapangan malam',
        deleted_at: null,
      };

      const norm = normalizeNonIplIncomeRecord(raw);
      expect(norm.isRecognizedCash).toBe(true);
      expect(norm.amountMinorUnits).toBe(50000000);
      expect(norm.canonicalDate).toBe('2026-08-20');
      expect(norm.category).toBe('sewa_lapangan');
      expect(norm.description).toBe('Sewa lapangan malam');
    });

    it('excludes soft-deleted non-IPL income from cash', () => {
      const raw = {
        id: 'income-del',
        tenant_id: tenantA,
        income_date: '2026-08-20',
        amount: '500000.00',
        deleted_at: '2026-08-21T00:00:00Z',
      };

      const norm = normalizeNonIplIncomeRecord(raw);
      expect(norm.isRecognizedCash).toBe(false);
    });

    it('excludes rejected non-IPL income (metadata.status === rejected) from cash', () => {
      const raw = {
        id: 'income-rej',
        tenant_id: tenantA,
        income_date: '2026-08-20',
        amount: '500000.00',
        metadata: { status: 'rejected' },
        deleted_at: null,
      };

      const norm = normalizeNonIplIncomeRecord(raw);
      expect(norm.isRecognizedCash).toBe(false);
    });

    it('excludes zero non-IPL income from cash', () => {
      const raw = {
        id: 'income-0',
        tenant_id: tenantA,
        income_date: '2026-08-20',
        amount: '0.00',
      };

      const norm = normalizeNonIplIncomeRecord(raw);
      expect(norm.isRecognizedCash).toBe(false);
      expect(norm.amountMinorUnits).toBe(0);
    });
  });

  describe('5. Expense Normalization', () => {
    it('normalizes valid expense as recognized cash outflow', () => {
      const raw = {
        id: 'exp-1',
        tenant_id: tenantA,
        expense_date: '2026-08-10',
        amount: '200000.00',
        category: 'kebersihan',
        description: 'Beli sapu dan kantong sampah',
      };

      const norm = normalizeExpenseRecord(raw);
      expect(norm.isRecognizedCash).toBe(true);
      expect(norm.amountMinorUnits).toBe(20000000);
      expect(norm.canonicalDate).toBe('2026-08-10');
      expect(norm.category).toBe('kebersihan');
      expect(norm.description).toBe('Beli sapu dan kantong sampah');
    });

    it('excludes zero amount expense from cash outflow', () => {
      const raw = {
        id: 'exp-0',
        tenant_id: tenantA,
        expense_date: '2026-08-10',
        amount: '0.00',
      };

      const norm = normalizeExpenseRecord(raw);
      expect(norm.isRecognizedCash).toBe(false);
      expect(norm.amountMinorUnits).toBe(0);
    });

    it('does not invent status, approval state, or deleted_at for expense', () => {
      const raw = {
        id: 'exp-clean',
        tenant_id: tenantA,
        expense_date: '2026-08-10',
        amount: '50000.00',
      };

      const norm = normalizeExpenseRecord(raw);
      expect(norm).not.toHaveProperty('deleted_at');
      expect(norm).not.toHaveProperty('approval_state');
    });
  });

  describe('6. Unified normalizeFinancialRecord Dispatcher', () => {
    it('dispatches payment, non_ipl_income, and expense correctly', () => {
      const p = normalizeFinancialRecord({ entityType: 'payment', amount: '100', status: 'completed', paid_at: '2026-08-01T00:00:00Z' });
      expect(p.entityType).toBe('payment');

      const i = normalizeFinancialRecord({ entityType: 'non_ipl_income', amount: '200', income_date: '2026-08-01' });
      expect(i.entityType).toBe('non_ipl_income');

      const e = normalizeFinancialRecord({ entityType: 'expense', amount: '300', expense_date: '2026-08-01' });
      expect(e.entityType).toBe('expense');
    });

    it('throws for unsupported entity type', () => {
      expect(() => normalizeFinancialRecord({ entityType: 'unknown', amount: '100' })).toThrow(
        'Unsupported financial entity type: "unknown"'
      );
    });
  });

  describe('7. Authoritative Opening Balance RPC Integration', () => {
    it('invokes get_tenant_opening_balance with correct tenant and date arguments', async () => {
      const mock = createMockSupabaseClient({
        rpcHandler: ({ fnName, fnArgs }) => {
          expect(fnName).toBe('get_tenant_opening_balance');
          expect(fnArgs).toEqual({
            p_tenant_id: tenantA,
            p_before_date: '2026-09-01',
          });
          return { data: '300000.00', error: null };
        },
      });

      const balanceMinorUnits = await getTenantOpeningBalance({
        tenantId: tenantA,
        beforeDate: '2026-09-01',
        client: mock,
      });

      // 300,000.00 Rupiah = 30,000,000 minor units
      expect(balanceMinorUnits).toBe(30000000);
      expect(Number.isSafeInteger(balanceMinorUnits)).toBe(true);
    });

    it('converts negative opening balance properly without float drift', async () => {
      const mock = createMockSupabaseClient({
        rpcHandler: () => ({ data: '-150000.50', error: null }),
      });

      const balanceMinorUnits = await getTenantOpeningBalance({
        tenantId: tenantA,
        beforeDate: '2026-09-01',
        client: mock,
      });

      expect(balanceMinorUnits).toBe(-15000050);
    });

    it('propagates database authorization error 42501 without swallowing into 0', async () => {
      const mock = createMockSupabaseClient({
        rpcHandler: () => ({
          data: null,
          error: {
            message: `Access denied for tenant ${tenantA}`,
            code: '42501',
            details: 'Unauthorized',
          },
        }),
      });

      await expect(
        getTenantOpeningBalance({
          tenantId: tenantA,
          beforeDate: '2026-09-01',
          client: mock,
        })
      ).rejects.toThrow(`Access denied for tenant ${tenantA}`);
    });
  });

  describe('8. Deterministic Pagination & Ordering', () => {
    it('traverses multiple pages deterministically when result set exceeds pageSize', async () => {
      // 5 items with pageSize = 2 -> 3 pages (2, 2, 1)
      const allPayments = [
        { id: 'p-1', tenant_id: tenantA, amount: '100.00', status: 'completed', paid_at: '2026-08-01T10:00:00Z' },
        { id: 'p-2', tenant_id: tenantA, amount: '200.00', status: 'completed', paid_at: '2026-08-02T10:00:00Z' },
        { id: 'p-3', tenant_id: tenantA, amount: '300.00', status: 'completed', paid_at: '2026-08-03T10:00:00Z' },
        { id: 'p-4', tenant_id: tenantA, amount: '400.00', status: 'completed', paid_at: '2026-08-04T10:00:00Z' },
        { id: 'p-5', tenant_id: tenantA, amount: '500.00', status: 'completed', paid_at: '2026-08-05T10:00:00Z' },
      ];

      const mock = createMockSupabaseClient({
        tableHandlers: {
          payments: ({ rangeArgs }) => {
            const { from, to } = rangeArgs;
            const slice = allPayments.slice(from, to + 1);
            return { data: slice, error: null };
          },
        },
      });

      const { records, rawRows } = await fetchTenantPayments({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        pageSize: 2,
        client: mock,
      });

      expect(rawRows).toHaveLength(5);
      expect(records).toHaveLength(5);
      expect(records.map((r) => r.id)).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5']);

      // 3 pages requested
      const pageQueries = mock._queryLog.filter((q) => q.table === 'payments');
      expect(pageQueries).toHaveLength(3);
      expect(pageQueries[0].rangeArgs).toEqual({ from: 0, to: 1 });
      expect(pageQueries[1].rangeArgs).toEqual({ from: 2, to: 3 });
      expect(pageQueries[2].rangeArgs).toEqual({ from: 4, to: 5 });
    });
  });

  describe('9. AbortSignal & Cancellation', () => {
    it('throws AbortError immediately when pre-aborted signal is provided', async () => {
      const controller = new AbortController();
      controller.abort();

      const mock = createMockSupabaseClient();

      await expect(
        getTenantOpeningBalance({
          tenantId: tenantA,
          beforeDate: '2026-09-01',
          signal: controller.signal,
          client: mock,
        })
      ).rejects.toThrow('The operation was aborted.');

      await expect(
        fetchTenantFinancialRecords({
          tenantId: tenantA,
          startDate: '2026-08-01',
          endDate: '2026-09-01',
          signal: controller.signal,
          client: mock,
        })
      ).rejects.toThrow('The operation was aborted.');

      // Zero table queries were executed
      expect(mock._queryLog).toHaveLength(0);
    });

    it('propagates AbortSignal and does not convert mid-flight cancellation to empty array', async () => {
      const controller = new AbortController();

      const mock = createMockSupabaseClient({
        tableHandlers: {
          payments: ({ signal }) => {
            // Simulate abort during fetch
            controller.abort();
            const err = new Error('AbortError: This operation was aborted');
            err.name = 'AbortError';
            return { data: null, error: err };
          },
        },
      });

      await expect(
        fetchTenantPayments({
          tenantId: tenantA,
          startDate: '2026-08-01',
          endDate: '2026-09-01',
          signal: controller.signal,
          client: mock,
        })
      ).rejects.toThrow('The operation was aborted.');
    });
  });

  describe('10. Error Semantics', () => {
    it('returns empty result when queries legitimately match zero records', async () => {
      const mock = createMockSupabaseClient({
        tableHandlers: {
          payments: () => ({ data: [], error: null }),
          non_ipl_incomes: () => ({ data: [], error: null }),
          expenses: () => ({ data: [], error: null }),
        },
      });

      const res = await fetchTenantFinancialRecords({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });

      expect(res.records).toEqual([]);
      expect(res.unresolvedRecords).toEqual([]);
      expect(res.unresolvedCount).toBe(0);
      expect(res.rawCounts).toEqual({
        payments: 0,
        unresolvedPayments: 0,
        nonIplIncomes: 0,
        expenses: 0,
      });
    });

    it('throws explicit error when table query encounters network/database error', async () => {
      const mock = createMockSupabaseClient({
        tableHandlers: {
          expenses: () => ({
            data: null,
            error: { message: 'Database connection failed', code: 'P0001' },
          }),
        },
      });

      await expect(
        fetchTenantExpenses({
          tenantId: tenantA,
          startDate: '2026-08-01',
          endDate: '2026-09-01',
          client: mock,
        })
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('11. Period Financial Records Orchestration & Observability', () => {
    it('concurrently fetches payments, unresolved payments, non-IPL incomes, and expenses', async () => {
      const mock = createMockSupabaseClient({
        tableHandlers: {
          payments: ({ filters }) => {
            const isUnresolvedQuery = filters.some((f) => f.col === 'paid_at' && f.type === 'is');
            if (isUnresolvedQuery) {
              return {
                data: [
                  {
                    id: 'p-unresolved',
                    tenant_id: tenantA,
                    amount: '100000.00',
                    status: 'completed',
                    paid_at: null,
                  },
                ],
                error: null,
              };
            }
            return {
              data: [
                {
                  id: 'p-resolved',
                  tenant_id: tenantA,
                  amount: '200000.00',
                  status: 'completed',
                  paid_at: '2026-08-10T10:00:00Z',
                },
              ],
              error: null,
            };
          },
          non_ipl_incomes: () => ({
            data: [
              {
                id: 'i-1',
                tenant_id: tenantA,
                amount: '300000.00',
                income_date: '2026-08-15',
                category: 'sewa',
                deleted_at: null,
              },
            ],
            error: null,
          }),
          expenses: () => ({
            data: [
              {
                id: 'e-1',
                tenant_id: tenantA,
                amount: '50000.00',
                expense_date: '2026-08-12',
                category: 'operasional',
              },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantFinancialRecords({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });

      expect(res.records).toHaveLength(4);
      expect(res.payments).toHaveLength(1);
      expect(res.unresolvedPayments).toHaveLength(1);
      expect(res.nonIplIncomes).toHaveLength(1);
      expect(res.expenses).toHaveLength(1);
      expect(res.unresolvedCount).toBe(1);
      expect(res.unresolvedRecords[0].id).toBe('p-unresolved');
      expect(res.unresolvedRecords[0].isUnresolved).toBe(true);
      expect(res.unresolvedRecords[0].canonicalDate).toBeNull();
    });
  });

  describe('12. End-to-End Compatibility with C2 Pure Aggregation Engine', () => {
    it('seamlessly passes repository domain records into financialAggregation.aggregatePeriodCashFlow', async () => {
      const mock = createMockSupabaseClient({
        rpcHandler: () => ({ data: '500000.00', error: null }), // Rp 500.000 opening balance
        tableHandlers: {
          payments: ({ filters }) => {
            const isUnresolvedQuery = filters.some((f) => f.col === 'paid_at' && f.type === 'is');
            if (isUnresolvedQuery) {
              return {
                data: [
                  {
                    id: 'p-unres',
                    tenant_id: tenantA,
                    amount: '75000.00',
                    status: 'completed',
                    paid_at: null,
                  },
                ],
                error: null,
              };
            }
            return {
              data: [
                {
                  id: 'p-comp',
                  tenant_id: tenantA,
                  amount: '150000.00',
                  status: 'completed',
                  paid_at: '2026-08-10T10:00:00Z',
                },
              ],
              error: null,
            };
          },
          non_ipl_incomes: () => ({
            data: [
              {
                id: 'i-donasi',
                tenant_id: tenantA,
                amount: '100000.00',
                income_date: '2026-08-15',
                category: 'donasi',
                deleted_at: null,
              },
            ],
            error: null,
          }),
          expenses: () => ({
            data: [
              {
                id: 'e-lampu',
                tenant_id: tenantA,
                amount: '80000.00',
                expense_date: '2026-08-20',
                category: 'listrik',
              },
            ],
            error: null,
          }),
        },
      });

      // 1. Fetch Authoritative Opening Balance via Repository
      const openingBalanceMinorUnits = await getTenantOpeningBalance({
        tenantId: tenantA,
        beforeDate: '2026-08-01',
        client: mock,
      });
      expect(openingBalanceMinorUnits).toBe(50000000); // Rp 500.000

      // 2. Fetch Bounded Domain Records via Repository
      const financialData = await fetchTenantFinancialRecords({
        tenantId: tenantA,
        startDate: '2026-08-01',
        endDate: '2026-09-01',
        client: mock,
      });

      // 3. Feed directly into C2 Pure Aggregation Engine
      const summary = aggregatePeriodCashFlow({
        openingBalanceMinorUnits,
        records: financialData.records,
        periodRange: {
          periodStartCalendar: '2026-08-01',
          periodEndCalendarExclusive: '2026-09-01',
        },
      });

      // Assertions matching Cash-Basis Financial Principles:
      // Opening = Rp 500.000 (50,000,000 minor)
      // Inflow = Rp 150.000 (payment) + Rp 100.000 (non-IPL) = Rp 250.000 (25,000,000 minor)
      // Outflow = Rp 80.000 (expense) = 8,000,000 minor
      // Net = Inflow - Outflow = Rp 170.000 (17,000,000 minor)
      // Closing = Opening + Net = Rp 670.000 (67,000,000 minor)
      // Unresolved = 1 (p-unres Rp 75.000, does not affect inflow or balance)
      expect(summary.openingBalanceMinorUnits).toBe(50000000);
      expect(summary.inflowMinorUnits).toBe(25000000);
      expect(summary.outflowMinorUnits).toBe(8000000);
      expect(summary.netMinorUnits).toBe(17000000);
      expect(summary.closingBalanceMinorUnits).toBe(67000000);

      expect(summary.inflowCount).toBe(2);
      expect(summary.outflowCount).toBe(1);
      expect(summary.unresolvedCount).toBe(1);
      expect(summary.unresolvedRecords[0].id).toBe('p-unres');

      expect(summary.openingBalanceFormatted).toBe('500000.00');
      expect(summary.inflowFormatted).toBe('250000.00');
      expect(summary.outflowFormatted).toBe('80000.00');
      expect(summary.netFormatted).toBe('170000.00');
      expect(summary.closingBalanceFormatted).toBe('670000.00');
    });
  });
});
