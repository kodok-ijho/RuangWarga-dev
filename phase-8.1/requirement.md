# Phase 8.1 — Financial Foundation & Architecture Hardening

## Requirements

### A. Baseline & Scope

**REQ-8.1-001 — Audit-driven implementation**  
Every implementation decision MUST trace to the Phase 8.0 audit or a concrete issue verified during repository inspection.

**REQ-8.1-002 — No premature Finance UI redesign**  
Major Finance UI/UX redesign MUST wait until financial correctness and tenant-isolation requirements are satisfied.

**REQ-8.1-003 — Preserve global UI/UX direction**  
Root `specification.md`, `requirement.md`, and `task.md` remain the global UI/UX authority. Phase 8.1 adds finance architecture requirements.

### B. Tenant Isolation & Security

**REQ-8.1-004 — Tenant-scoped financial records**  
All financial records used in tenant reporting MUST be associated with a tenant directly or through a verified tenant-scoped relationship.

**REQ-8.1-005 — Legacy non-IPL isolation**  
`non_ipl_incomes` MUST NOT remain a shared single-tenant financial source. Migrate, replace, or normalize it into a tenant-scoped model.

**REQ-8.1-006 — RLS**  
Every tenant-scoped financial table MUST have appropriate Row Level Security policies.

**REQ-8.1-007 — Explicit tenant context**  
Finance services MUST require tenant context and MUST NOT silently fall back to a default tenant.

**REQ-8.1-008 — Tenant-switch safety**  
Async finance requests MUST prevent stale responses from a previous tenant from updating current tenant state.

### C. Cash Basis

**REQ-8.1-009 — Payment recognition date**  
Payments contribute to cash using the canonical effective payment date, not billing period.

**REQ-8.1-010 — No double counting**  
A payment MUST appear in exactly one cash reporting period according to its effective payment date.

**REQ-8.1-011 — Verified records**  
Reporting MUST consistently enforce which verification states count toward cash.

**REQ-8.1-012 — Unified income**  
Verified billing payments and verified non-billing income MUST contribute to the same tenant cash model.

**REQ-8.1-013 — Opening balance continuity**  
For period N after the first known period: `openingBalance(N) = closingBalance(N-1)`.

**REQ-8.1-014 — Closing balance**  
`closingBalance = openingBalance + income - expense`.

**REQ-8.1-015 — No fake balance**  
No hardcoded/mock financial amount may be used in production. The audited Rp15,000,000 fallback MUST be removed.

**REQ-8.1-016 — Empty history**  
No-history tenants MUST receive a correct zero/no-history state, not an invented opening balance.

### D. Unified Finance Service / Ledger

**REQ-8.1-017 — Single source of truth**  
Reports, FinancialOverviewHero, Expenses-related summaries, and future finance surfaces MUST derive totals from a shared finance domain/service or equivalent.

**REQ-8.1-018 — Consistent period model**  
All summaries MUST use identical tenant, date, verification, and cash-basis rules.

**REQ-8.1-019 — Ledger-ready model**  
Architecture SHOULD represent cash movements as normalized income/expense entries or an equivalent unified reporting model.

**REQ-8.1-020 — No split-brain totals**  
Legacy sources MUST NOT continue producing competing totals across screens.

### E. Expense Integrity

**REQ-8.1-021 — Tenant-scoped expense reads**  
Expense queries MUST be tenant-filtered at the appropriate data boundary.

**REQ-8.1-022 — Bounded expense queries**  
Expense retrieval MUST use date filtering, pagination, or another bounded strategy.

**REQ-8.1-023 — Receipt persistence**  
Receipts MUST be uploaded to Supabase Storage when supplied/required.

**REQ-8.1-024 — Tenant-scoped receipt paths**  
Receipt paths MUST include tenant scope and a collision-resistant identifier.

**REQ-8.1-025 — Receipt authorization**  
Receipt access MUST respect tenant and role authorization. Avoid uncontrolled public exposure.

**REQ-8.1-026 — Audit timestamp integrity**  
`created_at` MUST remain record creation time.

**REQ-8.1-027 — Business date separation**  
Expense business date MUST be stored separately from audit metadata.

**REQ-8.1-028 — Amount validation**  
Expense amounts MUST be positive and valid at appropriate server/database boundaries.

**REQ-8.1-029 — Configurable thresholds**  
Amount limits/confirmation thresholds SHOULD be tenant-configurable unless a documented global safety limit is required.

### F. Async & Error State

**REQ-8.1-030 — Error is not empty**  
Failed finance fetches MUST produce an explicit error/retry state, not “no data.”

**REQ-8.1-031 — Loading state**  
Finance surfaces MUST expose intentional loading state and avoid presenting stale totals as current.

**REQ-8.1-032 — Tenant race protection**  
Tenant changes MUST cancel, invalidate, or sequence requests so old responses cannot overwrite current state.

### G. Transparency & Authorization

**REQ-8.1-033 — Read-only transparency**  
Ordinary residents/members SHOULD be able to view permitted aggregate financial transparency where tenant policy allows.

**REQ-8.1-034 — Mutation authorization**  
Create/edit/delete/verify/administer financial records MUST remain role-gated.

**REQ-8.1-035 — Privacy boundaries**  
Resident-facing transparency MUST expose only permitted fields.

### H. Adaptive Terminology

**REQ-8.1-036 — No hardcoded Palm Village terminology**  
Finance UI/services MUST NOT assume Palm Village vocabulary universally.

**REQ-8.1-037 — Tenant-aware labels**  
Where tenant type/configuration exists, labels SHOULD adapt.

**REQ-8.1-038 — Neutral fallback**  
Unknown tenant types MUST use neutral terminology.

### I. Design System Boundary

**REQ-8.1-039 — Semantic tokens**  
Finance UI MUST use the global design-token system, not hardcoded Palm Village colors.

**REQ-8.1-040 — Architecture before polish**  
Visual redesign MUST NOT bypass or duplicate financial business logic.

**REQ-8.1-041 — Reusable states**  
Finance UI SHOULD reuse global loading/empty/error/forbidden/retry patterns.

### J. Testing

**REQ-8.1-042 — Financial invariant tests**  
Automated tests MUST cover cash-basis recognition, no double counting, opening/closing continuity, and verification rules.

**REQ-8.1-043 — Tenant isolation tests**  
Tests MUST cover cross-tenant read/mutation attempts.

**REQ-8.1-044 — Zero-data tests**  
Tests MUST cover no transactions, no expenses, and no financial history.

**REQ-8.1-045 — Receipt tests**  
Receipt upload/path/access behavior MUST be testable or verifiable through integration checks.

**REQ-8.1-046 — Regression verification**  
Existing payment, billing, auth, tenant switching, and non-finance behavior MUST be regression-tested.

### K. Migration Safety

**REQ-8.1-047 — Explicit migration**  
Schema/data migrations MUST document source, target, mapping, and verification.

**REQ-8.1-048 — Historical data preservation**  
Existing financial history MUST NOT be silently discarded.

**REQ-8.1-049 — Backfill safety**  
Historical tenant assignment MUST be deterministic and verified before becoming authoritative.

**REQ-8.1-050 — Rollback awareness**  
Destructive/irreversible migration steps MUST be identified and avoided unless explicitly approved.

### L. Out of Scope

**REQ-8.1-051 — Event finance**  
Event finance remains out of scope until event finance is demonstrably tenant-safe.

**REQ-8.1-052 — ERP**  
Double-entry accounting, tax accounting, bank reconciliation, and full ERP are out of scope.

**REQ-8.1-053 — Unrelated redesign**  
Unrelated redesign MUST NOT be bundled into Phase 8.1.
