You are now in PLAN MODE for the RuangWarga repository.

Your job is to inspect the repository and produce an implementation plan ONLY.

DO NOT:
- modify source code
- modify database schema
- create/run migrations that change state
- change configuration
- upgrade dependencies
- modify assets
- modify git history
- implement fixes
- perform the Finance UI redesign

Do not assume the audit is correct without verifying it against the current repository.

# Required Documents

Read ALL SIX documents before producing the plan:

## Global UI/UX master
1. `specification.md`
2. `requirement.md`
3. `task.md`

## Finance Phase 8.1
4. `phase-8.1/specification.md`
5. `phase-8.1/requirement.md`
6. `phase-8.1/task.md`

Also inspect the Phase 8.0 Financial Architecture Audit if it exists in the repository or was supplied separately.

Treat Phase 8.0 as the audit baseline that motivated Phase 8.1.

# Product Context

RuangWarga is an independent multi-tenant SaaS platform.

Palm Village is ONLY one tenant/customer. Never treat Palm Village as:
- the product identity
- the default tenant
- the default branding
- the default terminology
- the default financial configuration

The existing three root-level documents remain the global UI/UX master.

Phase 8.1 is a specialized financial architecture-hardening phase. It does NOT replace the global UI/UX plan.

# Phase 8.1 Objective

Make the financial foundation:
- correct
- tenant-safe
- auditable
- consistent
- scalable enough for current product scope

BEFORE major Finance UI/UX redesign.

Known audit concerns include:
- fake Rp15,000,000 opening-balance fallback
- monthly payment double counting from `billPeriod || paidMonth`
- running balance resetting with `openingBalance: 0`
- `non_ipl_incomes` lacking tenant isolation
- unbounded expense retrieval
- fake/local receipt URL instead of Supabase Storage
- `created_at` overwritten with expense date
- stale async tenant-switch responses
- split-brain financial sources
- resident transparency blocked by current permission gates
- hardcoded Palm Village finance colors
- fetch errors becoming misleading empty states
- weak amount validation
- hardcoded Palm Village terminology
- insufficient meaningful finance tests

Do not assume these still exist unchanged. Verify each against current code.

# Repository Inspection Requirements

## Frontend

Inspect:
- routes
- pages
- finance components
- reusable UI components
- design tokens/theme
- tenant context
- auth/role gates
- loading/error/empty patterns
- async data-fetching patterns

Pay special attention to:
- `Reports.jsx`
- `Expenses.jsx`
- `NonIplIncomes.jsx`
- `EventFinance.jsx`
- `FinancialOverviewHero.jsx`

## Services / Data

Inspect:
- `tenantOperationalService.js`
- `dataService.js`
- all finance services
- Supabase client usage
- n8n/API proxy boundaries
- queries for payments, billing_items, expenses, non_ipl_incomes

Search for:
- `billPeriod`
- `paidMonth`
- `payment_date`
- `created_at`
- expense/business dates
- receipt URLs/paths
- hardcoded financial amounts
- duplicated financial calculations
- tenant filters
- tenant switching
- request cancellation/sequence guards

## Database

Inspect:
- migrations/schema
- tables
- foreign keys
- indexes
- RLS policies
- storage buckets/policies
- historical data assumptions
- tenant relationships

## Tests

Inspect:
- current finance tests
- test framework
- test utilities
- tenant-isolation tests
- database/integration test capabilities

# Required Plan Output

## 1. Executive Architecture Assessment

Report:
- current financial architecture
- confirmed Phase 8.0 findings
- findings that are no longer applicable
- newly discovered risks
- dependencies between fixes

Separate verified facts from assumptions.

## 2. Exact File/Table/Policy Map

For every proposed change identify:
- exact file/path
- component/service/migration/policy
- current responsibility
- proposed responsibility
- why it needs changing

Do not list generic files that you have not inspected.

## 3. Target Financial Architecture

Describe:
- source of truth
- tenant boundary
- cash-basis calculation
- income recognition
- expense recognition
- opening balance
- closing balance
- verification rules
- ledger/reporting model
- how Reports, Expenses, and FinancialOverviewHero consume it

## 4. Migration Strategy

If migration is required, specify:
- migration order
- affected tables
- tenant mapping
- historical backfill strategy
- validation queries/checks
- rollback considerations
- data-loss prevention

Do not recommend destructive migration merely for architectural cleanliness.

## 5. RLS & Security Plan

Specify:
- existing policies
- missing/unsafe policies
- tenant-scoped access rules
- read-only vs mutation permissions
- storage access rules

## 6. Receipt Storage Plan

Specify:
- bucket
- path format
- DB reference field
- upload flow
- replacement/deletion behavior
- authorized URL strategy
- tenant isolation

## 7. Async & Error-State Plan

Identify exactly where stale tenant requests can happen and how they should be guarded.

Describe:
- loading
- success with data
- success with zero data
- error
- forbidden/unauthorized
- retry

## 8. Testing Plan

Map Phase 8.1 requirements to concrete tests.

Prioritize:
- no double counting
- cash-basis date
- running balance continuity
- verified/unverified
- tenant isolation
- zero-data
- receipts
- tenant switching
- error vs empty

## 9. Implementation Sequence

Break work into approval gates:
- 8.1-A mapping
- 8.1-B tenant foundation
- 8.1-C cash-basis correctness
- 8.1-D unified finance service
- 8.1-E expenses/receipts
- 8.1-F async/error state
- 8.1-G authorization/transparency
- 8.1-H terminology
- 8.1-I tests/regression
- 8.1-J readiness review

For every gate include:
- prerequisites
- files/tables affected
- expected behavior
- validation
- rollback/risk notes

## 10. Global UI/UX Compatibility

Explain how Phase 8.1 supports the six-document global UI/UX direction without prematurely redesigning Finance UI.

## 11. Risk Register

Include:
- data migration risk
- tenant isolation risk
- historical calculation risk
- regression risk
- storage migration risk
- authorization/privacy risk
- scope creep risk

## 12. Definition of Done

Use the Phase 8.1 requirements and identify any requirement that cannot yet be verified.

# Important Constraints

- No code changes.
- No DB changes.
- No migrations.
- No dependency upgrades.
- No visual redesign.
- No broad refactor merely for style.
- Preserve working business logic unless a documented Phase 8.1 requirement requires changing it.
- Do not proceed automatically after producing the plan.
- End by identifying the FIRST implementation gate that should be approved.

The plan must be detailed enough that another coding agent can execute it without rediscovering the architecture from scratch.
