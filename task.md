# RuangWarga — UI/UX Implementation Tasks

## Implementation Strategy

Execute in this order:

```text
Phase 0 Architecture Audit
→ Phase 1 Global Design System
→ Phase 2 Shared UI Primitives
→ Phase 3 Account/Tenant Shell
→ Phase 4 Tenant Workspace Shell
→ Phase 5 Dashboard
→ Phase 6 Billing
→ Phase 7 Data-heavy Screens
→ Phase 8 Finance
→ Phase 9 Settings
→ Phase 10 Public/Platform
→ Phase 11 Tenant Adaptation
→ Phase 12 QA & Polish
```

Do not redesign the entire application in one pass.

---

## Phase 0 — Architecture Audit

### TASK-001
Map the application layers:

- `/account`
- `/t/:tenantId`
- `/platform`
- `/listing`

### TASK-002
Identify tenant leakage, including:

- Palm Village hardcoding
- IPL as global terminology
- Residential labels in generic components
- Palm Village colors used globally
- Palm Village logo used outside tenant context

### TASK-003
Identify existing design tokens and determine what should become centralized.

### TASK-004
Map reusable existing components before creating replacements.

### TASK-005
Document conflicts between the existing implementation and `specification.md` / `requirement.md`.

---

## Phase 1 — Global Design System

### TASK-010
Create the RuangWarga-neutral design token foundation.

Include:

- Colors
- Typography
- Spacing
- Radius
- Elevation
- Breakpoints
- Motion

### TASK-011
Create tenant theme tokens separately from global tokens.

### TASK-012
Define typography hierarchy.

### TASK-013
Remove unnecessary shadows and decorative containers.

### TASK-014
Establish responsive foundations for:

- 360
- 375
- 390
- 412
- 768
- 1024
- 1280
- 1440

---

## Phase 2 — Shared UI Primitives

### TASK-020
Build or standardize:

- Button
- IconButton
- Input
- Select
- Textarea
- Card
- Section
- Badge
- StatusBadge
- PageHeader
- Divider

### TASK-021
Build feedback components:

- Toast
- EmptyState
- Skeleton

### TASK-022
Build overlay components:

- Modal
- Drawer
- BottomSheet
- Dropdown

### TASK-023
Build data components:

- DataList
- MobileList
- Tabs
- Avatar

### TASK-024
Ensure components are tenant-neutral and configuration-driven.

---

## Phase 3 — Account Layer

### TASK-030
Redesign the account shell.

### TASK-031
Create a tenant-neutral community switcher.

### TASK-032
Redesign the account dashboard.

### TASK-033
Create tenant cards/list items that show community identity without making that identity the RuangWarga brand.

### TASK-034
Verify `/account` contains no Palm Village-specific assumptions.

---

## Phase 4 — Tenant Workspace Shell

### TASK-040
Create the tenant workspace shell.

### TASK-041
Create tenant context/header.

### TASK-042
Apply tenant logo/name/accent only inside tenant context.

### TASK-043
Create contextual tenant navigation.

### TASK-044
Make navigation responsive.

### TASK-045
Verify tenant switching does not retain stale tenant branding or terminology.

---

## Phase 5 — Dashboard

### TASK-050
Redesign citizen dashboard.

Prioritize:

1. Tenant context
2. Current obligation
3. Primary CTA
4. Quick actions
5. Recent activity
6. Community information

### TASK-051
Redesign staff dashboard.

Prioritize:

1. Critical actions
2. Operational summary
3. Pending work
4. Recent activity
5. Analytics

### TASK-052
Remove dashboard noise and unnecessary card grids.

### TASK-053
Validate the 3-second rule.

---

## Phase 6 — Billing

### TASK-060
Redesign current billing/obligation view.

### TASK-061
Make the primary billing/payment/reporting CTA prominent.

### TASK-062
Redesign billing history as secondary information.

### TASK-063
Create desktop payment matrix.

### TASK-064
Create mobile payment list/card representation.

### TASK-065
Verify no primary mobile billing flow requires horizontal scrolling.

### TASK-066
Preserve existing transfer, QRIS, receipt, verification, and payment logic.

---

## Phase 7 — Data-heavy Screens

### TASK-070
Redesign members screens.

### TASK-071
Redesign units/objects screens.

### TASK-072
Create responsive mobile list representations.

### TASK-073
Add detail drawers/bottom sheets where useful.

### TASK-074
Avoid simply shrinking desktop tables.

---

## Phase 8 — Finance

### TASK-080
Redesign expenses.

### TASK-081
Redesign expense detail.

### TASK-082
Redesign reports.

### TASK-083
Make charts responsive.

### TASK-084
Keep financial terminology tenant-contextual.

---

## Phase 9 — Settings

### TASK-090
Redesign settings information architecture.

### TASK-091
Separate account settings from tenant settings.

### TASK-092
Ensure tenant branding settings are scoped to the tenant.

### TASK-093
Ensure global settings never inherit Palm Village identity.

---

## Phase 10 — Public / Platform

### TASK-100
Redesign platform shell.

### TASK-101
Redesign subscription/platform administration views.

### TASK-102
Redesign public listing directory.

### TASK-103
Redesign public listing detail.

### TASK-104
Keep platform identity RuangWarga-neutral.

---

## Phase 11 — Tenant Adaptation

### TASK-110
Create/adapt the tenant terminology model.

### TASK-111
Support Residential / RT / RW.

### TASK-112
Support Kost.

### TASK-113
Support Arisan.

### TASK-114
Support Class.

### TASK-115
Do not duplicate the UI component system per tenant type.

---

## Phase 12 — Palm Village Validation Tenant

Palm Village is a validation tenant, not the design authority.

### TASK-120
Configure:

```text
Tenant: Palm Village
Type: Residential
Account Owner: dyudhiantoro@gmail.com
Treasurer: denmas.dyudhiantoro@gmail.com
```

### TASK-121
Verify Palm Village logo and colors appear only inside its tenant context.

### TASK-122
Verify IPL terminology appears only where residential tenant configuration requires it.

### TASK-123
Verify `/account` and `/platform` contain no Palm Village identity.

### TASK-124
Switch from Palm Village to another tenant and back.

### TASK-125
Verify branding, terminology, modules, and data context update correctly without stale state.

---

## Phase 13 — Multi-tenant Visual Validation

Simulate at least three visually different tenants:

```text
Palm Village
Residential
Green / Gold

Kost Mawar
Kost
Blue

Arisan Keluarga
Arisan
Purple
```

The application should still clearly look like RuangWarga in all three contexts.

---

## Phase 14 — QA & Polish

### TASK-140 — Responsive QA

Test:

```text
360
375
390
412
768
1024
1280
1440
```

### TASK-141 — Accessibility QA

Check:

- Keyboard navigation
- Focus states
- Contrast
- Touch targets
- Screen-reader labels
- Dialog/drawer accessibility
- Reduced motion

### TASK-142 — Regression QA

Verify:

- Authentication
- Authorization
- Tenant isolation
- Payment
- QRIS
- Transfer reporting
- Receipt handling
- Verification
- PWA behavior

### TASK-143 — Visual QA

Audit:

- Card usage
- Spacing
- Typography
- Color usage
- Navigation
- CTA hierarchy
- Mobile density
- Empty states
- Loading states

### TASK-144 — Final Tenant Leakage Audit

Search the codebase for:

- Palm Village
- IPL
- Warga
- Rumah
- hardcoded tenant colors
- hardcoded tenant logos

Every occurrence must be intentionally scoped or configurable.

---

## Implementation Rules

### Rule 1 — Source of Truth

Treat these documents as the source of truth:

```text
specification.md
requirement.md
task.md
```

### Rule 2 — Preserve Business Logic

Do not change database, authentication, RLS, payment, subscription, or tenant-isolation logic unless required by a genuine technical contradiction.

### Rule 3 — Reuse Existing Logic

Prefer refactoring existing components and logic over rebuilding functionality unnecessarily.

### Rule 4 — Tenant Neutrality

Never solve a tenant-specific problem by modifying the global RuangWarga design system.

Use:

```text
Global problem
→ Global component/token

Tenant-specific problem
→ Tenant configuration/adapter

Feature-specific problem
→ Feature component
```

### Rule 5 — Do Not Hardcode Palm Village

Palm Village must remain a configuration/validation tenant.

### Rule 6 — Do Not Redesign Everything at Once

Implement in phases and validate each major layer before proceeding.

### Rule 7 — Plan Before Large Changes

Before implementation of each phase:

1. Inspect the existing code.
2. Compare it with the specification and requirements.
3. Identify conflicts.
4. Make a short implementation plan.
5. Implement.
6. Build/typecheck/lint where available.
7. Verify affected routes and flows.
8. Report changes, regressions, and blockers.

### Rule 8 — Do Not Rewrite the Source Documents

Do not modify `specification.md`, `requirement.md`, or `task.md` unless a genuine technical contradiction is discovered.

If a contradiction exists, explain it before changing the source-of-truth documents.

## Recommended First Execution

Start with only:

```text
Phase 0
Phase 1
Phase 2
Phase 3
Phase 4
```

Do not redesign Dashboard, Billing, Reports, or feature-specific screens until the global design foundation and account/tenant shell are stable.

After Phase 0–4, perform a visual and architectural review before continuing to Phase 5.
