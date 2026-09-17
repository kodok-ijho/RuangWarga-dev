# RuangWarga UI/UX Redesign Tasks

## 0. Execution Rules

The agent MUST follow these rules throughout the task.

1. Read `specification.md` before implementation.
2. Read `requirement.md` before implementation.
3. Inspect the existing codebase before changing UI.
4. Do not redesign the entire application in one uncontrolled change.
5. Work in phases.
6. Preserve business logic.
7. Reuse existing components/dependencies where possible.
8. Do not introduce a new UI framework without explicit justification.
9. Do not add visual complexity merely to make the UI look modern.
10. After every phase, run the appropriate build/tests and inspect the result.
11. If an implementation decision conflicts with the specification, stop and document the conflict before proceeding.
12. Prefer deleting unnecessary UI over adding new UI.

---

# Phase 0 — Repository & Production Audit

## TASK-001 — Inspect Repository

- [ ] Identify frontend application structure.
- [ ] Identify routing.
- [ ] Identify component architecture.
- [ ] Identify styling system.
- [ ] Identify design tokens, if any.
- [ ] Identify state-management patterns.
- [ ] Identify API/data-fetching patterns.
- [ ] Identify authentication/authorization boundaries.
- [ ] Identify reusable components.
- [ ] Identify duplicate UI implementations.

### Deliverable

Create:

`UI_UX_AUDIT.md`

Do not modify UI as part of this task.

---

## TASK-002 — Inspect All Major Routes

Create an inventory of all major frontend routes/screens.

For each route document:

- route
- user role
- primary purpose
- primary action
- critical information
- secondary information
- detailed information
- current UX problems
- duplicated patterns
- responsive issues
- likely performance issues

### Acceptance

- [ ] Major resident routes documented.
- [ ] Major administrative routes documented.
- [ ] Authentication-related screens documented where relevant.
- [ ] Shared shell/navigation documented.

---

## TASK-003 — Establish UX Baseline

Identify the highest-impact UX issues.

Categorize:

- P0 usability
- P1 consistency
- P2 visual polish

Do not prioritize based only on visual attractiveness.

Prioritize issues that affect:

- comprehension
- task completion
- mobile usability
- navigation
- important information visibility
- performance

---

# Phase 1 — Design System Foundation

## TASK-004 — Define Design Tokens

Create or consolidate tokens for:

- [ ] colors
- [ ] typography
- [ ] spacing
- [ ] border radius
- [ ] borders
- [ ] shadows
- [ ] breakpoints
- [ ] component sizing

Use existing project conventions when suitable.

---

## TASK-005 — Establish Typography Hierarchy

Define reusable typography styles for:

- [ ] page title
- [ ] section title
- [ ] primary value
- [ ] body
- [ ] secondary text
- [ ] metadata
- [ ] labels

Ensure the hierarchy works on mobile.

---

## TASK-006 — Establish Semantic Colors

Define semantic states:

- [ ] success
- [ ] warning
- [ ] error
- [ ] information
- [ ] neutral

Ensure status remains understandable without color alone.

---

## TASK-007 — Audit/Rebuild Core Components

Review existing components and improve/reuse where appropriate:

- [ ] Button
- [ ] IconButton
- [ ] Input
- [ ] Select
- [ ] Badge
- [ ] Status
- [ ] Card
- [ ] Section
- [ ] Dialog
- [ ] Drawer
- [ ] EmptyState
- [ ] LoadingState
- [ ] PageHeader
- [ ] navigation components

Do not create components unnecessarily.

---

## TASK-008 — Global Shell

Redesign:

- [ ] application header
- [ ] navigation
- [ ] mobile navigation
- [ ] page container
- [ ] global spacing
- [ ] global background/surface treatment

### Acceptance

- [ ] Mobile navigation is easy to use.
- [ ] Desktop navigation is not excessive.
- [ ] Current location is clear.
- [ ] Global shell feels lightweight.
- [ ] No business logic is changed.

---

# Phase 2 — Dashboard

## TASK-009 — Dashboard UX Redesign

Redesign the dashboard around:

1. current IPL status
2. primary action
3. important announcement
4. quick actions
5. secondary information

### Rules

- [ ] Do not create a dashboard wall of cards.
- [ ] Remove low-value information.
- [ ] Make the current status immediately visible.
- [ ] Make the primary CTA obvious.
- [ ] Use progressive disclosure for details.

---

## TASK-010 — Dashboard Mobile Optimization

Validate:

- [ ] 360px
- [ ] 375px
- [ ] 390px
- [ ] 412px

Ensure the first viewport communicates the most important information.

---

# Phase 3 — IPL & Payment

## TASK-011 — IPL Overview

Redesign the IPL overview/status experience.

Prioritize:

- [ ] period
- [ ] amount
- [ ] status
- [ ] next action
- [ ] payment method

---

## TASK-012 — Payment Flow

Redesign the payment/reporting interaction without changing business logic.

Validate:

- [ ] required fields
- [ ] validation
- [ ] payment method selection
- [ ] QRIS where applicable
- [ ] proof/report submission where applicable
- [ ] success state
- [ ] failure state
- [ ] pending state

---

## TASK-013 — Payment History

Redesign history using progressive disclosure.

Primary view should show:

- [ ] period
- [ ] amount
- [ ] status
- [ ] date where relevant

Secondary transaction information should be available through detail interaction.

---

# Phase 4 — Residents

## TASK-014 — Resident Directory

Redesign the resident directory.

Prioritize:

- [ ] search
- [ ] house identifier
- [ ] resident/contact name
- [ ] relevant contact information

Avoid unnecessary personal information.

---

## TASK-015 — Resident Mobile Experience

Create an appropriate mobile list/detail experience.

Do not simply shrink a desktop table.

---

# Phase 5 — Finance & Administration

## TASK-016 — Financial Dashboard

Redesign financial overview screens.

Prioritize:

- [ ] important totals
- [ ] income/expense understanding
- [ ] relevant period
- [ ] primary actions
- [ ] concise charts/visualizations where already supported

Avoid unnecessary metrics.

---

## TASK-017 — Administrative Tables

Audit and redesign dense tables.

For every table:

- [ ] identify essential columns
- [ ] remove redundant columns from primary view
- [ ] provide detail access
- [ ] optimize number alignment
- [ ] optimize mobile behavior
- [ ] preserve filtering/sorting where functionally required

---

# Phase 6 — Information / Community Modules

## TASK-018 — Announcements

Redesign announcements to prioritize:

- title
- date
- urgency/relevance
- short summary
- action/detail

Avoid large blocks of text in list views.

---

## TASK-019 — Other Community Features

Apply the design system to remaining community modules.

Do not invent unnecessary UI patterns.

---

# Phase 7 — Forms & States

## TASK-020 — Form Audit

Audit every important form.

For each form:

- [ ] remove unnecessary fields
- [ ] improve labels
- [ ] improve placeholders where useful
- [ ] improve validation
- [ ] improve error messages
- [ ] improve success feedback
- [ ] improve mobile keyboard/input behavior

---

## TASK-021 — Empty States

Audit empty states across the application.

Replace generic messages with contextual states.

Example:

`Belum ada pembayaran`

instead of:

`No data`

Where appropriate provide the next action.

---

## TASK-022 — Loading States

Audit loading behavior.

Remove unnecessary full-screen loaders.

Use lightweight local loading feedback where practical.

---

# Phase 8 — Accessibility & Performance

## TASK-023 — Accessibility Audit

Check:

- [ ] semantic HTML
- [ ] keyboard navigation
- [ ] focus states
- [ ] accessible names
- [ ] status announcements where necessary
- [ ] contrast
- [ ] reduced motion

Fix issues introduced or exposed by redesign.

---

## TASK-024 — Performance Audit

Check for:

- [ ] unnecessary dependencies
- [ ] unnecessary client components
- [ ] unnecessary renders
- [ ] duplicated data fetching
- [ ] oversized assets
- [ ] unnecessary animations
- [ ] unnecessary JavaScript
- [ ] unnecessary network requests

Do not optimize blindly; identify actual issues first.

---

# Phase 9 — Responsive Validation

## TASK-025 — Full Responsive Pass

Validate all redesigned routes at:

- [ ] 360px
- [ ] 375px
- [ ] 390px
- [ ] 412px
- [ ] 768px
- [ ] 1024px
- [ ] 1440px

Check:

- [ ] overflow
- [ ] clipping
- [ ] wrapping
- [ ] tap targets
- [ ] navigation
- [ ] dialogs
- [ ] forms
- [ ] tables
- [ ] charts
- [ ] empty states
- [ ] loading states

---

# Phase 10 — Regression & Cleanup

## TASK-026 — Business Logic Regression

Verify that UI changes did not affect:

- [ ] authentication
- [ ] authorization
- [ ] IPL calculation
- [ ] payment behavior
- [ ] QRIS behavior
- [ ] payment status
- [ ] financial calculations
- [ ] resident data
- [ ] API behavior

---

## TASK-027 — Build & Test

Run:

- [ ] frontend build
- [ ] existing tests
- [ ] lint/type checks where configured
- [ ] relevant integration/e2e tests where available

Resolve regressions caused by the redesign.

---

## TASK-028 — Console & Runtime Cleanup

Check for:

- [ ] console errors
- [ ] React warnings
- [ ] hydration warnings where applicable
- [ ] broken network requests
- [ ] failed image/assets
- [ ] broken navigation

No new unresolved errors should remain.

---

## TASK-029 — Visual Consistency Pass

Perform a final pass across the entire redesigned application.

Look specifically for:

- [ ] inconsistent spacing
- [ ] inconsistent button sizes
- [ ] inconsistent typography
- [ ] inconsistent radius
- [ ] inconsistent status styles
- [ ] excessive cards
- [ ] excessive shadows
- [ ] unnecessary text
- [ ] duplicated UI patterns
- [ ] visual noise

---

# Phase 11 — Final UX Review

## TASK-030 — 3-Second Test

For every major screen ask:

> Can a new user understand what this screen is for within approximately 3 seconds?

If no:

- improve hierarchy
- reduce noise
- simplify copy
- clarify the primary action

---

## TASK-031 — 20% Removal Test

For every major screen ask:

> Can approximately 20% of the visible UI be removed without reducing functionality or comprehension?

If yes, remove it.

Do not add UI unless it solves a documented problem.

---

## TASK-032 — Primary Task Test

For every major screen identify:

- primary task
- primary information
- primary action

Confirm that all three are obvious.

---

## TASK-033 — Final Documentation

Update:

`UI_UX_AUDIT.md`

with:

- problems found
- changes made
- components introduced/changed
- design-token decisions
- performance decisions
- accessibility decisions
- known limitations
- remaining P2 improvements

---

# Definition of Done

The UI/UX redesign is complete when:

- [ ] All P0 requirements are satisfied.
- [ ] Relevant P1 requirements are satisfied.
- [ ] Major routes follow one design language.
- [ ] Mobile experience is intentionally designed, not merely responsive.
- [ ] Important information is immediately understandable.
- [ ] Primary actions are obvious.
- [ ] Text has been reduced where possible without losing meaning.
- [ ] Unnecessary visual complexity has been removed.
- [ ] Reusable patterns are centralized.
- [ ] Existing business logic continues to work.
- [ ] Build passes.
- [ ] Tests pass where available.
- [ ] No new runtime/console errors remain.
- [ ] Accessibility has been checked.
- [ ] Performance has been checked.
- [ ] Final visual consistency pass is complete.

---

# Agent Behavior Rule

At every stage, use this decision hierarchy:

1. **Does this improve user comprehension?**
2. **Does this reduce user effort?**
3. **Does this preserve functionality?**
4. **Does this improve consistency?**
5. **Does this preserve/improve performance?**
6. **Only then: does it improve visual polish?**

When a proposed visual change improves aesthetics but hurts clarity, performance, or efficiency:

> **Do not implement it.**
