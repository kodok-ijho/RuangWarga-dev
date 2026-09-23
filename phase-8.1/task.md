# Phase 8.1 — Financial Foundation & Architecture Hardening

## Task Plan

### Execution Rule

The coding agent MUST:
1. Read the three global UI/UX documents first.
2. Read the Phase 8.0 audit and all Phase 8.1 documents.
3. Inspect the actual repository before changing anything.
4. Map findings to real files, tables, services, routes, and policies.
5. Work incrementally.
6. Validate after each logical work package.
7. Stop when the approved work package is complete.
8. Never proceed automatically to later phases.

---

## Phase 8.1-A — Repository & Financial Dependency Mapping

**Goal:** Produce a precise implementation map before changes.

Tasks:
- Inspect finance routes/pages/components.
- Inspect `tenantOperationalService.js`, `dataService.js`, and finance services.
- Inspect `Reports.jsx`, `Expenses.jsx`, `NonIplIncomes.jsx`, `EventFinance.jsx`, `FinancialOverviewHero.jsx`.
- Inspect all payment/billing/expense/income access.
- Inspect Supabase schema, migrations, FKs, indexes, RLS.
- Inspect storage buckets/policies.
- Inspect auth/role/tenant context.
- Search hardcoded amounts, terminology, colors, calculations.
- Search `billPeriod`, `paidMonth`, `payment_date`, `created_at`, expense dates, receipt URLs/paths.
- Search tenant-switch async patterns.
- Inspect test framework and existing finance tests.

**Gate:** No code changes until actual architecture is mapped.

---

## Phase 8.1-B — Tenant Financial Data Foundation

**Goal:** Eliminate single-tenant finance assumptions.

Tasks:
- Design target tenant-scoped income model.
- Decide whether `non_ipl_incomes` is migrated, replaced, or normalized.
- Add/verify tenant relationships and FKs.
- Add/verify RLS.
- Verify service-layer tenant scoping.
- Plan/execute safe historical backfill if required.
- Verify no default tenant fallback.
- Verify tenant-switch behavior.

**Acceptance:** A tenant cannot read or mutate another tenant's financial data through supported paths.

---

## Phase 8.1-C — Correct Cash-Basis Aggregation

**Goal:** Make monthly finance mathematically correct.

Tasks:
- Remove `billPeriod || paidMonth` aggregation.
- Use canonical effective payment date.
- Define/enforce verified-state rules.
- Include verified non-billing income.
- Ensure each payment contributes to exactly one cash period.
- Remove Rp15,000,000 fallback.
- Implement cumulative historical opening balance.
- Calculate closing = opening + income - expense.
- Verify month-to-month continuity.
- Define first-period/no-history behavior.

**Acceptance:** A January bill paid in February contributes to February cash only.

---

## Phase 8.1-D — Unified Finance Service / Reporting Model

**Goal:** Create one coherent source for finance summaries.

Tasks:
- Define finance service/domain API.
- Centralize income, expenses, opening, closing, breakdowns, ledger entries, verification rules.
- Refactor Reports and FinancialOverviewHero to consume the shared model.
- Remove competing legacy calculations.
- Keep business rules out of presentation components where practical.
- Keep event finance isolated unless proven tenant-safe.

**Acceptance:** Finance screens cannot disagree because of separate calculation logic.

---

## Phase 8.1-E — Expenses, Pagination & Receipts

**Goal:** Make expense retrieval scalable and auditable.

Tasks:
- Add tenant/date filters.
- Add pagination or another bounded strategy.
- Add useful indexes where justified.
- Implement Supabase Storage receipt upload.
- Use tenant-scoped receipt paths.
- Store storage path/reference, not fake local/public filename.
- Generate authorized access URLs.
- Preserve `created_at`.
- Store expense business date separately.
- Validate positive amounts.
- Review duplicate upload/replacement behavior.

**Acceptance:** Receipts persist in real storage and cannot be casually accessed across tenants.

---

## Phase 8.1-F — Async Safety & Error Semantics

**Goal:** Prevent stale or misleading finance UI.

Tasks:
- Add request sequencing/cancellation/equivalent tenant-switch protection.
- Prevent stale responses from updating current tenant.
- Separate loading, success-empty, error, forbidden.
- Add retry.
- Test tenant switching during slow requests.

**Acceptance:** Switching tenants during an in-flight request cannot display previous-tenant results.

---

## Phase 8.1-G — Authorization & Transparency

**Goal:** Separate read transparency from financial administration.

Tasks:
- Review role gates.
- Define resident/member read-only aggregate access.
- Keep create/edit/delete/verify restricted.
- Enforce authorization at data/API boundaries, not only UI.
- Review receipt and transaction privacy.

**Acceptance:** Residents see only permitted financial data and cannot perform admin mutations.

---

## Phase 8.1-H — Adaptive Finance Vocabulary

**Goal:** Remove one-tenant terminology assumptions.

Tasks:
- Find hardcoded IPL/fasum/satpam and related terms.
- Define tenant-type/configuration terminology.
- Implement neutral fallback.
- Verify Reports, Expenses, income screens, and related components.

**Acceptance:** Non-community tenants do not automatically receive Palm Village-specific wording.

---

## Phase 8.1-I — Tests & Regression

Required tests:
1. January bill paid in February → February cash only.
2. Payment cannot count twice.
3. Verified/unverified rules work.
4. Verified non-billing income is included.
5. Opening equals previous closing.
6. Closing formula is correct.
7. No-history tenant has no fake opening balance.
8. Tenant A cannot access tenant B.
9. Invalid expense amount is rejected.
10. Receipt path contains tenant scope.
11. Fetch error is not interpreted as empty.
12. Tenant switch rejects stale response.
13. Existing payment/billing flows still work.

**Acceptance:** Tests fail when core financial invariants are intentionally broken.

---

## Phase 8.1-J — Finance UI Readiness Review

Tasks:
- Verify Reports/Expenses have reliable data contracts.
- Verify loading/error/empty/forbidden states.
- Verify semantic tokens are available.
- Verify terminology resolves from tenant context.
- Verify totals come from shared service.
- Verify no fake data remains.
- Produce Phase 8.2 input summary.

**Gate:** Only after this gate should major Finance UI/UX redesign proceed.

---

## Phase 8.1-K — Final Audit

Checklist:
- [ ] No fake financial fallback
- [ ] No payment double counting
- [ ] Historical running balance works
- [ ] Tenant isolation enforced
- [ ] RLS verified
- [ ] Unified finance source
- [ ] Non-billing income tenant-scoped
- [ ] Expenses bounded/paginated
- [ ] Receipts stored in Supabase Storage
- [ ] Receipt access authorized
- [ ] `created_at` preserved
- [ ] Amount validation enforced
- [ ] Async tenant-switch guard
- [ ] Error ≠ empty
- [ ] Resident transparency is read-only
- [ ] Admin mutation remains role-gated
- [ ] Terminology is tenant-aware
- [ ] Finance colors use semantic tokens
- [ ] Financial invariant tests exist
- [ ] Historical migration verified
- [ ] No unrelated scope creep

### Deliverable

Produce a concise completion report containing:
- changes made
- migrations
- backfill status
- RLS/security status
- tests and results
- remaining risks
- explicit readiness status for Phase 8.2 Finance UI/UX
