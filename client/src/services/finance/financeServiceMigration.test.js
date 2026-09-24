import { describe, it, expect, vi } from 'vitest';
import {
  fetchTenantMonthlyFinance,
  fetchTenantRunningBalance,
} from '../tenantOperationalService.js';

/**
 * Creates a mock Supabase client for testing the service layer integration
 * with financialRepository and financialAggregation.
 *
 * Implements faithful PostgREST query filtering (.eq, .is, .gte, .lt, .gt, .in)
 * so that repository queries accurately reflect PostgreSQL query behavior.
 */
function createMockFinanceClient({
  rpcHandler = () => ({ data: '0.00', error: null }),
  tableHandlers = {},
} = {}) {
  const queryLog = [];

  const applyQueryFilters = (rows, filters) => {
    return rows.filter((row) => {
      for (const f of filters) {
        if (f.type === 'eq') {
          if (row[f.col] !== f.val) return false;
        } else if (f.type === 'is') {
          if (f.val === null) {
            if (row[f.col] !== null && row[f.col] !== undefined) return false;
          } else {
            if (row[f.col] !== f.val) return false;
          }
        } else if (f.type === 'gte') {
          if (row[f.col] === null || row[f.col] === undefined || row[f.col] < f.val) return false;
        } else if (f.type === 'lt') {
          if (row[f.col] === null || row[f.col] === undefined || row[f.col] >= f.val) return false;
        } else if (f.type === 'gt') {
          if (Number(row[f.col]) <= Number(f.val)) return false;
        } else if (f.type === 'in') {
          if (!Array.isArray(f.val) || !f.val.includes(row[f.col])) return false;
        }
      }
      return true;
    });
  };

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
      in: vi.fn().mockImplementation((col, val) => {
        filters.push({ type: 'in', col, val });
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
      then: (resolve) => {
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
          if (result.error) return resolve(result);
          const filteredRows = applyQueryFilters(result.data || [], filters);
          return resolve({ data: filteredRows, error: null });
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

describe('Service Layer Additive Migration (Sub-Gate 8.1-C5)', () => {
  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  describe('1. Tenant Isolation & Validation (Items 1-3)', () => {
    it('throws error when tenantId is null, empty string, or whitespace', async () => {
      await expect(fetchTenantMonthlyFinance(null, { year: 2026, month: 8 })).rejects.toThrow(
        'tenantId wajib disertakan dan harus berupa string yang valid.'
      );
      await expect(fetchTenantMonthlyFinance('', { year: 2026, month: 8 })).rejects.toThrow(
        'tenantId wajib disertakan dan harus berupa string yang valid.'
      );
      await expect(fetchTenantMonthlyFinance('   ', { year: 2026, month: 8 })).rejects.toThrow(
        'tenantId wajib disertakan dan harus berupa string yang valid.'
      );
      await expect(fetchTenantRunningBalance(null, { year: 2026, month: 8 })).rejects.toThrow(
        'tenantId wajib disertakan dan harus berupa string yang valid.'
      );
    });

    it('enforces tenant_id in repository queries and isolates Tenant A from Tenant B', async () => {
      const mock = createMockFinanceClient({
        tableHandlers: {
          payments: ({ filters }) => {
            const tenantFilter = filters.find((f) => f.type === 'eq' && f.col === 'tenant_id');
            expect(tenantFilter).toBeDefined();
            expect(tenantFilter.val).toBe(tenantA);
            return {
              data: [
                { id: 'p-a', tenant_id: tenantA, amount: '100000.00', status: 'completed', paid_at: '2026-08-10T10:00:00Z' },
                { id: 'p-b', tenant_id: tenantB, amount: '999999.00', status: 'completed', paid_at: '2026-08-10T10:00:00Z' },
              ],
              error: null,
            };
          },
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      expect(res.report.total_income).toBe(100000);
      expect(res.cashPayments).toHaveLength(1);
      expect(res.cashPayments[0].id).toBe('p-a');
    });
  });

  describe('2. Cash-Basis Payment Recognition (Items 4-9)', () => {
    it('Items 4-9: completed positive payment recognized, zero/pending/rejected excluded, missing paid_at unresolved', async () => {
      const mock = createMockFinanceClient({
        tableHandlers: {
          payments: () => ({
            data: [
              // Item 4: completed positive payment
              { id: 'p-completed', tenant_id: tenantA, amount: '150000.00', status: 'completed', paid_at: '2026-08-10T10:00:00Z' },
              // Item 5: completed zero payment (operational settlement marker)
              { id: 'p-zero', tenant_id: tenantA, amount: '0.00', status: 'completed', paid_at: '2026-08-11T10:00:00Z' },
              // Item 6: pending verification payment
              { id: 'p-pending', tenant_id: tenantA, amount: '250000.00', status: 'pending_verification', paid_at: '2026-08-12T10:00:00Z' },
              // Item 7: rejected payment
              { id: 'p-rejected', tenant_id: tenantA, amount: '50000.00', status: 'rejected', paid_at: '2026-08-13T10:00:00Z' },
              // Item 8: completed monetary payment missing paid_at (unresolved)
              { id: 'p-unresolved', tenant_id: tenantA, amount: '200000.00', status: 'completed', paid_at: null, created_at: '2026-08-14T10:00:00Z' },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      // Inflow recognized ONLY for p-completed (Rp 150.000)
      expect(res.report.total_income).toBe(150000);
      expect(res.report.cash_inflow).toBe(150000);
      // Unresolved count observed
      expect(res.report.unresolved_count).toBe(1);
      expect(res.unresolvedPayments).toHaveLength(1);
      expect(res.unresolvedPayments[0].id).toBe('p-unresolved');
      // cashPayments array contains recognized payment
      expect(res.cashPayments).toHaveLength(1);
      expect(res.cashPayments[0].id).toBe('p-completed');
    });
  });

  describe('3. Non-IPL Income Recognition (Items 10-13)', () => {
    it('Items 10-13: verified positive income recognized, rejected/deleted/zero excluded', async () => {
      const mock = createMockFinanceClient({
        tableHandlers: {
          non_ipl_incomes: () => ({
            data: [
              // Item 10: verified positive non-IPL income
              { id: 'i-verified', tenant_id: tenantA, amount: '75000.00', income_date: '2026-08-15', category: 'sewa', deleted_at: null },
              // Item 11: rejected non-IPL income
              { id: 'i-rejected', tenant_id: tenantA, amount: '50000.00', income_date: '2026-08-16', category: 'donasi', metadata: { status: 'rejected' }, deleted_at: null },
              // Item 12: soft-deleted non-IPL income
              { id: 'i-deleted', tenant_id: tenantA, amount: '25000.00', income_date: '2026-08-17', category: 'sewa', deleted_at: '2026-08-18T00:00:00Z' },
              // Item 13: zero amount income
              { id: 'i-zero', tenant_id: tenantA, amount: '0.00', income_date: '2026-08-19', category: 'bunga', deleted_at: null },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      expect(res.report.total_income).toBe(75000);
      expect(res.nonIplIncomes).toHaveLength(1);
      expect(res.nonIplIncomes[0].id).toBe('i-verified');
    });
  });

  describe('4. Expense Recognition (Items 14-15)', () => {
    it('Items 14-15: positive expense recognized as outflow, zero/negative expense excluded', async () => {
      const mock = createMockFinanceClient({
        tableHandlers: {
          expenses: () => ({
            data: [
              // Item 14: positive expense
              { id: 'e-valid-1', tenant_id: tenantA, amount: '120000.00', expense_date: '2026-08-20', category: 'kebersihan' },
              // Item 15: zero amount expense
              { id: 'e-zero', tenant_id: tenantA, amount: '0.00', expense_date: '2026-08-21', category: 'operasional' },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      expect(res.report.total_expense).toBe(120000);
      expect(res.report.cash_outflow).toBe(120000);
      expect(res.expenses).toHaveLength(1);
      expect(res.expenses[0].id).toBe('e-valid-1');
    });
  });

  describe('5. Period & Boundary Semantics (Items 16-18, 24)', () => {
    it('Item 16, 17, 18 & 24: respects [start, end), WIB boundary, and eliminates billing period leak', async () => {
      const mock = createMockFinanceClient({
        tableHandlers: {
          payments: () => ({
            data: [
              // Included: Aug 31 16:59:59 UTC = 23:59:59 WIB on August 31
              { id: 'p-aug-end', tenant_id: tenantA, amount: '100000.00', status: 'completed', paid_at: '2026-08-31T16:59:59Z' },
              // Excluded from August: Aug 31 17:00:00 UTC = 00:00:00 WIB on Sept 1 (even if billing_period = '2026-08')
              { id: 'p-sept-start', tenant_id: tenantA, amount: '200000.00', status: 'completed', paid_at: '2026-08-31T17:00:00Z', metadata: { billing_period: '2026-08' } },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      // Only p-aug-end is recognized in August cash flow
      expect(res.report.total_income).toBe(100000);
      expect(res.cashPayments).toHaveLength(1);
      expect(res.cashPayments[0].id).toBe('p-aug-end');
    });
  });

  describe('6. Opening Balance & Running Balance Continuity (Items 19-23)', () => {
    it('Items 19, 20 & 21: opening balance comes from RPC and closing = opening + inflow - outflow', async () => {
      const mock = createMockFinanceClient({
        rpcHandler: ({ fnArgs }) => {
          expect(fnArgs.p_before_date).toBe('2026-08-01');
          return { data: '300000.00', error: null }; // Rp 300.000 opening balance
        },
        tableHandlers: {
          payments: () => ({
            data: [{ id: 'p-1', tenant_id: tenantA, amount: '150000.00', status: 'completed', paid_at: '2026-08-10T10:00:00Z' }],
            error: null,
          }),
          expenses: () => ({
            data: [{ id: 'e-1', tenant_id: tenantA, amount: '50000.00', expense_date: '2026-08-12' }],
            error: null,
          }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      expect(res.report.opening_balance).toBe(300000);
      expect(res.report.total_income).toBe(150000);
      expect(res.report.total_expense).toBe(50000);
      expect(res.report.net_income).toBe(100000);
      // Closing = Opening + Inflow - Outflow = 300,000 + 100,000 = 400,000
      expect(res.report.closing_balance).toBe(400000);
    });

    it('Item 22 & 23: running balance chain guarantees Opening(M) === Closing(M - 1) and fake 15M is gone', async () => {
      const mock = createMockFinanceClient({
        rpcHandler: () => ({ data: '100000.00', error: null }), // Rp 100.000 initial opening
        tableHandlers: {
          payments: () => ({
            data: [
              { id: 'p-jul', tenant_id: tenantA, amount: '50000.00', status: 'completed', paid_at: '2026-07-15T10:00:00Z' },
              { id: 'p-aug', tenant_id: tenantA, amount: '70000.00', status: 'completed', paid_at: '2026-08-15T10:00:00Z' },
            ],
            error: null,
          }),
          expenses: () => ({
            data: [
              { id: 'e-jul', tenant_id: tenantA, amount: '20000.00', expense_date: '2026-07-20' },
              { id: 'e-aug', tenant_id: tenantA, amount: '30000.00', expense_date: '2026-08-20' },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantRunningBalance(
        tenantA,
        { year: 2026, month: 8, startYear: 2026, startMonth: 7 },
        { client: mock }
      );

      expect(res.chain).toHaveLength(2);

      const jul = res.chain[0];
      const aug = res.chain[1];

      // July 2026:
      // Opening = 100,000 (NOT fake 15,000,000!)
      // Income = 50,000, Expense = 20,000 -> Closing = 130,000
      expect(jul.period).toBe('2026-07');
      expect(jul.openingBalance).toBe(100000);
      expect(jul.totalIncome).toBe(50000);
      expect(jul.totalExpense).toBe(20000);
      expect(jul.closingBalance).toBe(130000);

      // August 2026:
      // Opening === July Closing (130,000)
      // Income = 70,000, Expense = 30,000 -> Closing = 170,000
      expect(aug.period).toBe('2026-08');
      expect(aug.openingBalance).toBe(jul.closingBalance);
      expect(aug.openingBalance).toBe(130000);
      expect(aug.totalIncome).toBe(70000);
      expect(aug.totalExpense).toBe(30000);
      expect(aug.closingBalance).toBe(170000);

      // Total invariants
      expect(res.finalClosingBalance).toBe(170000);
      expect(res.totalInflow).toBe(120000);
      expect(res.totalOutflow).toBe(50000);
    });
  });

  describe('7. Errors, Cancellation & Abort (Items 27-30)', () => {
    it('Item 27: database errors propagate without being swallowed into fake empty report', async () => {
      const mock = createMockFinanceClient({
        tableHandlers: {
          payments: () => ({
            data: null,
            error: { code: '42501', message: 'permission denied for table payments' },
          }),
        },
      });

      await expect(
        fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock })
      ).rejects.toThrow('permission denied for table payments');
    });

    it('Item 28: abort controller cancellation propagates AbortError', async () => {
      const controller = new AbortController();
      controller.abort();

      const mock = createMockFinanceClient();

      await expect(
        fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { signal: controller.signal, client: mock })
      ).rejects.toThrow('The operation was aborted');
    });

    it('Item 29: legitimately zero activity returns 0 and empty arrays, distinct from failure', async () => {
      const mock = createMockFinanceClient({
        rpcHandler: () => ({ data: '0.00', error: null }),
        tableHandlers: {
          payments: () => ({ data: [], error: null }),
          expenses: () => ({ data: [], error: null }),
          non_ipl_incomes: () => ({ data: [], error: null }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      expect(res.report.total_income).toBe(0);
      expect(res.report.total_expense).toBe(0);
      expect(res.report.net_income).toBe(0);
      expect(res.report.opening_balance).toBe(0);
      expect(res.report.closing_balance).toBe(0);
      expect(res.cashPayments).toHaveLength(0);
      expect(res.expenses).toHaveLength(0);
      expect(res.nonIplIncomes).toHaveLength(0);
      expect(res.unresolvedPayments).toHaveLength(0);
    });
  });

  describe('8. Consumer Compatibility & Fixture Verification (Items 31-32 & Section 24)', () => {
    it('verifies the authoritative Section 24 C5 test fixture dataset end-to-end', async () => {
      const mock = createMockFinanceClient({
        rpcHandler: ({ fnArgs }) => {
          expect(fnArgs.p_tenant_id).toBe(tenantA);
          expect(fnArgs.p_before_date).toBe('2026-08-01');
          // Opening balance Rp 300,000
          return { data: '300000.00', error: null };
        },
        tableHandlers: {
          payments: () => {
            return {
              data: [
                // 1. Completed payment Rp 150,000 paid 2026-08-10 (Recognized cash)
                { id: 'p-1', tenant_id: tenantA, amount: '150000.00', status: 'completed', paid_at: '2026-08-10T10:00:00Z', method: 'qris' },
                // 2. Completed zero payment (Operational settlement marker, Rp 0 cash)
                { id: 'p-2', tenant_id: tenantA, amount: '0.00', status: 'completed', paid_at: '2026-08-11T10:00:00Z', method: 'cash' },
                // 3. Pending verification payment Rp 250,000 (Excluded from cash)
                { id: 'p-3', tenant_id: tenantA, amount: '250000.00', status: 'pending_verification', paid_at: '2026-08-12T10:00:00Z', method: 'transfer' },
                // 4. Completed monetary payment missing paid_at (Unresolved record, excluded from cash)
                { id: 'p-unres', tenant_id: tenantA, amount: '200000.00', status: 'completed', paid_at: null, created_at: '2026-08-13T10:00:00Z', method: 'transfer' },
                // 5. Payment completed Sept 1 (Outside August period)
                { id: 'p-sep', tenant_id: tenantA, amount: '100000.00', status: 'completed', paid_at: '2026-08-31T17:00:00Z', method: 'qris' },
              ],
              error: null,
            };
          },
          non_ipl_incomes: () => ({
            data: [
              // Verified non-IPL income Rp 75,000
              { id: 'i-1', tenant_id: tenantA, amount: '75000.00', income_date: '2026-08-15', category: 'donasi', deleted_at: null },
              // Rejected non-IPL income Rp 50,000
              { id: 'i-2', tenant_id: tenantA, amount: '50000.00', income_date: '2026-08-16', category: 'sewa', metadata: { status: 'rejected' }, deleted_at: null },
              // Soft-deleted non-IPL income Rp 25,000
              { id: 'i-3', tenant_id: tenantA, amount: '25000.00', income_date: '2026-08-17', category: 'sewa', deleted_at: '2026-08-18T00:00:00Z' },
            ],
            error: null,
          }),
          expenses: () => ({
            data: [
              // Expense Rp 120,000
              { id: 'e-1', tenant_id: tenantA, amount: '120000.00', expense_date: '2026-08-20', category: 'kebersihan' },
            ],
            error: null,
          }),
        },
      });

      const res = await fetchTenantMonthlyFinance(tenantA, { year: 2026, month: 8 }, { client: mock });

      // Expected recognized current period (Section 24 Fixture):
      // Inflow = Rp 150.000 (payment 1) + Rp 75.000 (non-IPL) = Rp 225.000
      expect(res.report.total_income).toBe(225000);
      expect(res.report.cash_inflow).toBe(225000);

      // Outflow = Rp 120.000
      expect(res.report.total_expense).toBe(120000);
      expect(res.report.cash_outflow).toBe(120000);

      // Net = 225.000 - 120.000 = 105.000
      expect(res.report.net_income).toBe(105000);
      expect(res.report.balance).toBe(105000);

      // Opening = Rp 300.000
      expect(res.report.opening_balance).toBe(300000);

      // Closing = Opening + Net = Rp 405.000
      expect(res.report.closing_balance).toBe(405000);

      // Unresolved count = 1 (p-unres Rp 200.000)
      expect(res.report.unresolved_count).toBe(1);
      expect(res.unresolvedPayments).toHaveLength(1);
      expect(res.unresolvedPayments[0].id).toBe('p-unres');

      // Formatted strings check
      expect(res.report.inflowFormatted).toBe('225000.00');
      expect(res.report.outflowFormatted).toBe('120000.00');
      expect(res.report.netFormatted).toBe('105000.00');
      expect(res.report.openingBalanceFormatted).toBe('300000.00');
      expect(res.report.closingBalanceFormatted).toBe('405000.00');
    });
  });
});
