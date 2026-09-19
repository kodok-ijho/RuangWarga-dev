# RuangWarga — Platform UI/UX Specification

## 1. Purpose

This document defines the visual, UX, information architecture, interaction model, responsive behavior, accessibility direction, and tenant-branding boundaries for RuangWarga.

RuangWarga is an independent multi-tenant SaaS platform. Palm Village is only one tenant/customer and must never become the global product identity.

## 2. Product Model

```text
RuangWarga
├── Account
│   ├── User profile
│   ├── Owned tenants
│   └── Account settings
├── Tenant
│   ├── Identity
│   ├── Members
│   ├── Billing
│   ├── Finance
│   ├── Activities
│   └── Tenant settings
└── Platform
    ├── Subscription
    ├── Platform administration
    └── System configuration
```

Example tenant configuration:

```text
Account Owner: dyudhiantoro@gmail.com
Tenant: Palm Village
Tenant Role: Owner / Administrator
Treasurer: denmas.dyudhiantoro@gmail.com
```

This is tenant configuration, not platform identity.

## 3. Product Personality

RuangWarga should feel:

- Modern
- Clean
- Calm
- Trustworthy
- Friendly
- Professional
- Approachable
- SaaS-grade

Design direction: **Modern Community SaaS**.

Use SumoPod and Sharingan.id only as visual inspiration for principles such as hierarchy, whitespace, typography, confidence, and editorial personality. Do not clone their designs.

## 4. Global Brand vs Tenant Brand

### Global RuangWarga

The global product must have its own neutral visual identity.

Global UI must not hardcode:

- Palm Village
- IPL
- Warga
- Rumah
- Residential-specific terminology
- Palm Village colors
- Palm Village logo

### Tenant

Tenant configuration may provide:

```text
tenant.logo
tenant.name
tenant.primaryColor
tenant.secondaryColor
tenant.terminology
```

Tenant branding is scoped to the tenant workspace.

Tenant colors must not override semantic success, warning, danger, or informational colors.

## 5. Visual System

### Color Distribution

Target approximately:

- 80–90% neutral surfaces/text
- 8–15% brand/accent
- 1–5% semantic colors

### Typography

- Inter for operational UI
- Playfair Display only where a marketing/editorial heading genuinely benefits from it

### Spacing

Use a consistent scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
```

### Radius

Preferred values:

```text
6, 8, 12, 16
```

Use pills mainly for statuses, filters, and compact metadata.

### Elevation

Default to no shadow.

Use elevation only where it communicates:

- Modal
- Dropdown
- Drawer
- Floating action
- Elevated surface

Cards are not default containers. Prefer sections, whitespace, dividers, and hierarchy.

## 6. Account Layer

Account UI must remain tenant-neutral.

Examples:

- My Communities
- Manage your communities
- Account settings

The account layer lists and manages tenants without adopting a tenant's branding as the global brand.

## 7. Tenant Layer

The active tenant context must always be clear.

Tenant-specific:

- Logo
- Name
- Accent color
- Terminology
- Modules

may appear inside the tenant context.

## 8. Dashboard

### Citizen

Recommended hierarchy:

1. Tenant identity
2. Greeting/context
3. Current obligation
4. Primary CTA
5. Quick actions
6. Recent activity
7. Community information

### Staff

Recommended hierarchy:

1. Critical actions
2. Operational summary
3. Pending work
4. Recent activity
5. Analytics

The dashboard should not become a wall of cards.

## 9. Navigation

### Global

Use generic concepts such as:

- My Communities
- Discover
- Account

### Tenant

Navigation is contextual.

Example for residential:

- Overview
- Members
- Billing
- Payments
- Expenses
- Reports
- Announcements
- Activities
- Settings

### Mobile

Maximum four primary destinations.

Example:

- Home
- Billing
- Members
- More

Labels may adapt by tenant type.

## 10. Tenant-Type Model

RuangWarga must support different community types without duplicating the UI.

| Tenant Type | Members | Units / Object | Billing |
|---|---|---|---|
| Residential / RT / RW | Warga | Rumah | IPL |
| Kost | Penyewa | Kamar | Sewa |
| Arisan | Anggota | — | Kontribusi |
| Class | Siswa | Kelas | Iuran |

Terminology is configuration/content, not a separate UI system.

## 11. Billing

Billing must prioritize the current obligation.

Hierarchy:

1. Current obligation
2. Primary payment/report CTA
3. Status
4. History
5. Details

The current obligation should be understandable within approximately three seconds.

### Payment Matrix

Desktop may use a table/matrix.

Mobile must use a responsive list/card representation. Do not force users into mandatory horizontal scrolling for the primary billing flow.

## 12. Data-heavy Screens

Desktop:

- Tables
- Grids
- Charts

Mobile:

- Lists
- Object cards
- Drawers
- Bottom sheets

Avoid simply shrinking desktop tables.

## 13. Status

Status must communicate through:

- Icon
- Label
- Semantic color

Never rely on color alone.

## 14. Empty States

Every empty state should answer:

1. What is empty?
2. Why does it matter?
3. What can the user do next?

## 15. Loading

Preferred hierarchy:

1. Skeleton
2. Inline loading
3. Full-page loading only when necessary

## 16. Responsive Targets

Validate at:

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

## 17. Accessibility

Target WCAG AA-oriented implementation.

Requirements:

- Semantic HTML
- Visible focus states
- Keyboard navigation
- Touch targets >= 44px
- Accessible labels
- Accessible dialogs/drawers
- Reduced-motion support
- Sufficient contrast

## 18. Motion

Use restrained motion.

Preferred duration:

```text
150–220ms
```

Motion should communicate state and hierarchy, not decoration.

## 19. Application Layers

```text
GLOBAL
/account
/platform

TENANT
/t/:tenantId

PUBLIC
/listing
```

Global, tenant, and public contexts must remain visually and conceptually distinguishable.

## 20. Non-goals

This redesign should not unnecessarily change:

- Database structure
- Authentication
- RLS
- Payment logic
- Subscription logic
- Business rules
- Tenant isolation
- Existing API contracts

Only change underlying logic when required to support a genuine UI/UX defect or architectural contradiction.

## 21. Success Criteria

The redesign is successful when:

- Global UI is tenant-neutral.
- Account/platform pages contain no Palm Village identity.
- Palm Village works entirely as a tenant configuration.
- Tenant branding is scoped correctly.
- Tenant terminology is configurable.
- The active tenant context is obvious.
- Current obligations are visible within approximately three seconds.
- Mobile works from 360px upward.
- There is no wall of cards.
- Primary actions have clear hierarchy.
- Desktop and mobile data presentations are appropriate.
- The application feels like one cohesive SaaS product across tenant types.
