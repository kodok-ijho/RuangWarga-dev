# RuangWarga — UI/UX Requirements

## 1. Product Definition

The product hierarchy is:

```text
User
  ↓
Account
  ↓
Tenant
  ↓
Workspace
```

RuangWarga is the platform. A tenant is a customer/community operating inside the platform.

## 2. Priority

- P0 — Must have
- P1 — Important
- P2 — Nice to have

## 3. Requirements

### REQ-001 — Account Must Be Tenant Neutral [P0]

The account layer must not contain hardcoded tenant-specific identity, terminology, colors, or logos.

### REQ-002 — Tenant Context Must Be Explicit [P0]

Users must always be able to understand which tenant/workspace they are currently operating in.

### REQ-003 — Tenant Identity Must Be Configurable [P0]

Tenant name, logo, accent colors, and terminology must be configuration-driven.

### REQ-004 — Tenant Branding Must Not Leak [P0]

Tenant branding must not appear in global account, platform, or unrelated tenant contexts.

### REQ-005 — Global Design Tokens [P0]

Create a centralized RuangWarga design system containing:

- Color tokens
- Typography
- Spacing
- Radius
- Elevation
- Breakpoints
- Motion

### REQ-006 — Tenant Accent Must Be Scoped [P0]

Tenant accent colors may customize tenant UI but cannot override semantic success, warning, danger, or informational colors.

### REQ-007 — Shared UI Primitives [P0]

Create/reuse shared primitives for at least:

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
- DataList
- MobileList
- Drawer
- Modal
- BottomSheet
- Toast
- EmptyState
- Skeleton
- Tabs
- Dropdown
- Avatar
- Divider

### REQ-008 — Dashboard 3-second Rule [P0]

The most important current state/action must be understandable within approximately three seconds.

### REQ-009 — Citizen Dashboard Hierarchy [P0]

Citizen dashboards must prioritize:

1. Tenant context
2. Current obligation
3. Primary CTA
4. Quick actions
5. Recent activity
6. Community information

### REQ-010 — Staff Dashboard Hierarchy [P0]

Staff dashboards must prioritize:

1. Critical actions
2. Operational summary
3. Pending work
4. Recent activity
5. Analytics

### REQ-011 — Global Navigation [P0]

Global navigation must use tenant-neutral concepts such as account, communities, and discovery.

### REQ-012 — Tenant Navigation [P0]

Tenant navigation must be contextual to the active tenant and its enabled modules.

### REQ-013 — Mobile Navigation [P0]

Mobile must have no more than four primary destinations.

### REQ-014 — Current Obligation First [P0]

Billing pages must show the current obligation before historical information.

### REQ-015 — Billing CTA Visible [P0]

The primary payment/reporting action must be clearly visible without unnecessary navigation.

### REQ-016 — Billing History Secondary [P1]

History must remain accessible but must not dominate the current-obligation experience.

### REQ-017 — Desktop Payment Matrix [P1]

Desktop may use a structured payment matrix/table when it improves scanning.

### REQ-018 — Mobile Billing Alternative [P0]

Mobile billing must not require horizontal scrolling for the primary user flow.

### REQ-019 — Responsive Data [P0]

Data-heavy desktop layouts must transform into appropriate mobile patterns rather than simply shrinking.

### REQ-020 — Detail Drawer [P1]

Where appropriate, desktop and mobile detail views should use drawers or bottom sheets to preserve context.

### REQ-021 — Accessible Status [P0]

Status indicators must use icon + label + semantic color.

### REQ-022 — Empty State Structure [P0]

Empty states must communicate what, why, and next action.

### REQ-023 — Loading States [P0]

Use skeleton and inline loading where possible.

### REQ-024 — Long Forms [P1]

Long forms must be broken into meaningful sections with clear hierarchy.

### REQ-025 — Residential Terminology [P0]

Residential tenants may use terminology such as:

- Warga
- Rumah
- IPL

### REQ-026 — Kost Terminology [P0]

Kost tenants may use terminology such as:

- Penyewa
- Kamar
- Sewa

### REQ-027 — Arisan Terminology [P0]

Arisan tenants may use terminology such as:

- Anggota
- Kontribusi
- Putaran

### REQ-028 — Class Terminology [P0]

Class tenants may use terminology such as:

- Siswa
- Kelas
- Iuran

### REQ-029 — Public Listing [P1]

Public listing pages must use RuangWarga identity unless a tenant-specific public identity is intentionally configured.

### REQ-030 — Accessibility [P0]

The UI must follow WCAG AA-oriented practices.

### REQ-031 — Responsive Widths [P0]

Test at:

```text
360, 375, 390, 412, 768, 1024, 1280, 1440
```

### REQ-032 — Visual Hierarchy [P0]

Every screen should establish one primary hierarchy and one primary CTA where applicable.

### REQ-033 — Cards Must Have Meaning [P0]

Cards should represent logical objects or meaningful grouped content. Do not use cards simply to decorate every section.

### REQ-034 — Visual Restraint [P0]

Avoid:

- Excessive shadows
- Excessive borders
- Excessive rounded containers
- Excessive badges
- Excessive accent colors
- Dense dashboard grids

### REQ-035 — Performance [P1]

The redesign should not introduce unnecessary client-side complexity, duplicate components, or expensive rendering.

### REQ-036 — Business Logic Preservation [P0]

Existing business logic must remain functional unless an explicit architectural conflict is discovered.

## 4. Hard Constraints

Never:

1. Hardcode Palm Village into global UI.
2. Hardcode IPL as universal billing terminology.
3. Use Palm Village colors as RuangWarga global brand colors.
4. Assume every tenant is residential.
5. Duplicate entire UI component systems for each tenant type.
6. Solve tenant-specific requirements by modifying the global design system.

## 5. Definition of Done

The redesign is considered complete when:

- Global UI is tenant-neutral.
- Palm Village operates as configuration.
- Tenant branding is correctly scoped.
- Tenant terminology is configurable.
- Account and platform layers are neutral.
- Tenant workspace is contextual.
- Shared UI primitives are used consistently.
- Dashboard hierarchy is clear.
- Billing hierarchy is clear.
- Mobile flows work at 360px.
- Data-heavy screens have responsive representations.
- Accessibility requirements are addressed.
- Existing authentication, authorization, tenant isolation, payment, and core business flows remain intact.
- No primary mobile flow requires unnecessary horizontal scrolling.
