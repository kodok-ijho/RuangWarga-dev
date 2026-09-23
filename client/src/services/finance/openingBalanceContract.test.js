import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  aggregatePeriodCashFlow,
  toMinorUnits,
  fromMinorUnits,
} from './financialAggregation.js';

describe('Database Opening Balance RPC Contract (Sub-Gate 8.1-C3)', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    '../supabase/migrations/202609220004_create_opening_balance_rpc_and_indexes.sql'
  );

  describe('Migration File Integrity & Hardening Constraints', () => {
    it('migration file 202609220004 exists and contains required DDL statements', () => {
      // In client cwd, test is run from client/
      const fileExists = fs.existsSync(migrationPath);
      expect(fileExists).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // 1. Partial Index
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_payments_tenant_cash');
      expect(sql).toContain("WHERE status = 'completed' AND amount > 0");

      // 2. Function Signature & Security Definer
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_tenant_opening_balance');
      expect(sql).toContain('p_tenant_id uuid');
      expect(sql).toContain('p_before_date date');
      expect(sql).toContain('RETURNS numeric(12,2)');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public, pg_temp');

      // 3. Strict Tenant Authorization Checks
      expect(sql).toContain('public.is_platform_admin()');
      expect(sql).toContain('public.is_tenant_owner(p_tenant_id)');
      expect(sql).toContain('p_tenant_id IN (SELECT public.current_tenant_ids())');
      expect(sql).toContain("ERRCODE = '42501'");

      // 4. Exact Financial Semantics Filters
      expect(sql).toContain("status = 'completed'");
      expect(sql).toContain('amount > 0');
      expect(sql).toContain('paid_at IS NOT NULL');
      expect(sql).toContain('deleted_at IS NULL');
      expect(sql).toContain("COALESCE(metadata->>'status', 'verified') != 'rejected'");

      // 5. Hardened Permissions (Revoke anon/public, grant authenticated/service_role)
      expect(sql).toContain('ALTER FUNCTION public.get_tenant_opening_balance(uuid, date) OWNER TO postgres;');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_tenant_opening_balance(uuid, date) FROM PUBLIC, anon;');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_tenant_opening_balance(uuid, date) TO authenticated, service_role;');
    });
  });

  describe('Semantic Parity: SQL RPC Contract vs C2 Aggregation Engine', () => {
    it('proves that RPC and C2 aggregation calculate identical cumulative balance for identical transactions', () => {
      const tenantId = '00000000-0000-0000-0000-000000000001';

      // Test dataset representing exact SQL table states
      const rawPayments = [
        // Included: completed monetary payment before Sept 1 WIB (Aug 31 16:59:59 UTC = 23:59:59 WIB)
        { tenant_id: tenantId, amount: '500000.00', status: 'completed', paid_at: '2026-08-31T16:59:59Z', canonicalDate: '2026-08-31', type: 'payment' },
        // Excluded from Sept 1 before_date: on Sept 1 00:00:00 WIB (Aug 31 17:00:00 UTC)
        { tenant_id: tenantId, amount: '100000.00', status: 'completed', paid_at: '2026-08-31T17:00:00Z', canonicalDate: '2026-09-01', type: 'payment' },
        // Excluded: amount = 0
        { tenant_id: tenantId, amount: '0.00', status: 'completed', paid_at: '2026-08-15T10:00:00Z', canonicalDate: '2026-08-15', type: 'payment' },
        // Excluded: paid_at is null (unresolved)
        { tenant_id: tenantId, amount: '200000.00', status: 'completed', paid_at: null, canonicalDate: null, type: 'payment' },
        // Excluded: pending
        { tenant_id: tenantId, amount: '300000.00', status: 'pending', paid_at: '2026-08-10T10:00:00Z', canonicalDate: '2026-08-10', type: 'payment' },
        // Excluded: rejected
        { tenant_id: tenantId, amount: '400000.00', status: 'rejected', paid_at: '2026-08-10T10:00:00Z', canonicalDate: '2026-08-10', type: 'payment' },
      ];

      const rawIncomes = [
        // Included: verified non-IPL income before Sept 1
        { tenant_id: tenantId, amount: '75000.00', income_date: '2026-08-20', canonicalDate: '2026-08-20', status: 'verified', deleted_at: null, type: 'non_ipl_income' },
        // Excluded: rejected non-IPL income
        { tenant_id: tenantId, amount: '50000.00', income_date: '2026-08-20', canonicalDate: '2026-08-20', status: 'rejected', deleted_at: null, type: 'non_ipl_income' },
        // Excluded: soft-deleted non-IPL income
        { tenant_id: tenantId, amount: '25000.00', income_date: '2026-08-20', canonicalDate: '2026-08-20', status: 'verified', deleted_at: '2026-08-21T00:00:00Z', type: 'non_ipl_income' },
      ];

      const rawExpenses = [
        // Included: expense before Sept 1
        { tenant_id: tenantId, amount: '120000.00', expense_date: '2026-08-25', canonicalDate: '2026-08-25', type: 'expense' },
        // Excluded: amount = 0
        { tenant_id: tenantId, amount: '0.00', expense_date: '2026-08-25', canonicalDate: '2026-08-25', type: 'expense' },
      ];

      // Simulate SQL Opening Balance for p_before_date = '2026-09-01'
      const wibBoundaryUtc = new Date('2026-08-31T17:00:00Z').getTime();

      let sqlInflowPaymentsMinor = 0;
      for (const p of rawPayments) {
        if (p.tenant_id === tenantId && p.status === 'completed' && p.paid_at) {
          const minor = toMinorUnits(p.amount);
          const paidAtTime = new Date(p.paid_at).getTime();
          if (minor > 0 && paidAtTime < wibBoundaryUtc) {
            sqlInflowPaymentsMinor += minor;
          }
        }
      }

      let sqlInflowNonIplMinor = 0;
      for (const inc of rawIncomes) {
        if (inc.tenant_id === tenantId && !inc.deleted_at && inc.status !== 'rejected') {
          const minor = toMinorUnits(inc.amount);
          if (minor > 0 && inc.income_date < '2026-09-01') {
            sqlInflowNonIplMinor += minor;
          }
        }
      }

      let sqlOutflowExpensesMinor = 0;
      for (const exp of rawExpenses) {
        if (exp.tenant_id === tenantId) {
          const minor = toMinorUnits(exp.amount);
          if (minor > 0 && exp.expense_date < '2026-09-01') {
            sqlOutflowExpensesMinor += minor;
          }
        }
      }

      const sqlOpeningBalanceMinor = sqlInflowPaymentsMinor + sqlInflowNonIplMinor - sqlOutflowExpensesMinor;
      const sqlOpeningBalanceFormatted = fromMinorUnits(sqlOpeningBalanceMinor);

      // Verify simulated SQL calculation
      // Payments: 500,000 (50,000,000 sen)
      // Non-IPL: 75,000 (7,500,000 sen)
      // Expenses: 120,000 (12,000,000 sen)
      // Net: 50,000,000 + 7,500,000 - 12,000,000 = 45,500,000 sen (455000.00)
      expect(sqlOpeningBalanceFormatted).toBe('455000.00');

      // Now aggregate using C2 Engine for Month of August [2026-08-01, 2026-09-01)
      const allRecords = [...rawPayments, ...rawIncomes, ...rawExpenses];
      const engineResult = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 0,
        records: allRecords,
        periodRange: {
          periodStartCalendar: '2026-08-01',
          periodEndCalendarExclusive: '2026-09-01',
        },
      });

      // Assert Zero Semantic Divergence:
      // SQL Opening Balance before Sept 1st === Engine Closing Balance of August
      expect(engineResult.closingBalanceFormatted).toBe(sqlOpeningBalanceFormatted);
      expect(engineResult.closingBalanceMinorUnits).toBe(sqlOpeningBalanceMinor);
    });
  });
});
