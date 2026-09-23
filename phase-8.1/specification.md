# Phase 8.1 — Financial Foundation & Architecture Hardening

## Specification

### 1. Purpose

Phase 8.1 converts the Phase 8.0 Financial Architecture Audit into an implementation-ready financial foundation for RuangWarga.

This is a **correctness, security, tenant-isolation, data-integrity, and financial-source-of-truth phase**. It must be executed before major Finance UI/UX redesign.

RuangWarga is an independent multi-tenant SaaS. Palm Village is only one tenant and MUST NOT become the product identity, default tenant, default terminology, or default financial configuration.

### 2. Relationship to the Global UI/UX Specification

The existing root-level:
- `specification.md`
- `requirement.md`
- `task.md`

remain the master/global UI/UX direction.

Phase 8.1 does not replace them. It supplies the financial architecture required for that UI/UX to display trustworthy data.

Target sequence:

Global UI/UX direction → Phase 8.0 audit → Phase 8.1 financial foundation → Finance UI/UX → regression/final UX validation.

### 3. Core Financial Model

The target financial model is **cash basis**.

For a selected tenant and period:
- income from payments is recognized using the effective payment date, not billing period;
- only valid/verified financial records are included according to the defined verification rules;
- verified non-billing income participates in the same tenant cash picture;
- expenses reduce cash using their effective expense date;
- opening balance is the previous period's closing balance;
- closing balance = opening balance + income - expense;
- no period may invent a balance or use mock/fake financial values.

### 4. Single Source of Truth

Finance screens should consume a coherent finance service/domain layer instead of independently calculating cash totals.

The shared model should cover:
- period income
- period expenses
- opening balance
- closing balance
- income/expense breakdown
- ledger entries
- verification state
- tenant context

Reports, Expenses, FinancialOverviewHero, and future finance surfaces should derive displayed totals from the same financial source of truth.

### 5. Tenant Isolation

Every financial entity and query participating in reporting MUST be tenant-scoped.

Verify:
- schema relationships
- foreign keys
- RLS
- frontend query filters
- service tenant context
- storage paths
- mutation/verification authorization

Legacy single-tenant assumptions must not survive merely because the UI hides them.

### 6. Receipt Storage

Expense receipts must use real Supabase Storage.

Preferred conceptual path:

`tenant-receipts/{tenantId}/expenses/{year}/{uuid}.<ext>`

The DB should retain a storage path/reference rather than a fake local filename or uncontrolled public URL.

Authorized users may receive an appropriate signed/access URL.

`created_at` remains the record creation/audit timestamp and must not be overwritten with the expense business date.

### 7. Transparency

Ordinary residents/members may receive appropriate read-only aggregate financial transparency where tenant policy allows it.

Administrative operations remain role-gated:
- create/edit/delete expenses
- verify financial records
- manage financial configuration
- upload/replace receipts where appropriate

### 8. Adaptive Terminology

Financial labels must not be hardcoded to Palm Village terminology.

Examples:
- RT/RW/community: IPL / Iuran
- Kos: Biaya Sewa
- Arisan: Iuran Putaran
- Kelas/course: SPP / Biaya Kursus

Use tenant type/configuration where available, with a neutral fallback.

### 9. Validation & Auditability

Financial amounts and dates must be validated at appropriate server/database boundaries.

Separate:
- user-input validation
- DB constraints
- authorization
- business rules

Audit timestamps and business-effective dates are separate concepts.

### 10. Error Semantics

A failed finance request MUST NOT become a fake empty state.

Distinguish:
- loading
- success with data
- success with zero data
- error
- unauthorized/forbidden

### 11. Performance

Finance queries must avoid unbounded reads through appropriate:
- tenant filters
- date filters
- pagination
- indexes
- bounded queries
- aggregation strategies

### 12. Testing

Meaningful automated coverage must protect:
- tenant isolation
- cash-basis date recognition
- no double counting
- opening/closing continuity
- verification rules
- expense aggregation
- zero-data behavior
- authorization boundaries

### 13. Explicit Non-Goals

Do not expand this phase into:
- full double-entry accounting/ERP
- tax accounting
- bank reconciliation
- event finance redesign before event finance is tenant-safe
- unrelated global UI redesign
- broad dependency replacement without evidence

### 14. Business Logic Preservation

Inspect existing behavior before changing it.

No financial table, API, auth rule, payment workflow, or DB behavior may change merely to make UI easier.

Schema migration, when necessary, must be explicit, tenant-safe, reversible where practical, and accompanied by verification.

### 15. Architectural Success

Phase 8.1 succeeds when Finance can consistently and tenant-safely answer:

> How much cash did this tenant have at the beginning of the period, what verified cash came in, what was spent, and what is the resulting closing balance?

The answer must use real data, one coherent calculation model, and remain correct across month boundaries and tenant switches.
