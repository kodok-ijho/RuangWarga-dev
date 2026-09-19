# RuangWarga UI/UX Redesign Specification

## 1. Overview

RuangWarga is a neighborhood/community utility application. The application contains resident-facing and administrative functionality such as IPL payment reporting, payment status, resident directory, financial information, QRIS/payment workflows, announcements, and related community features.

The purpose of this specification is to establish a unified UI/UX direction for the existing RuangWarga frontend.

This is a **UI/UX modernization project**, not a business-logic rewrite.

The target experience is:

> **Clean, slim, modern, calm, trustworthy, lightweight, and highly understandable.**

The interface should make complexity in the underlying system feel simple to the user.

---

## 2. Product Design Philosophy

### 2.1 Core principle

> **Show the user what they need to know, then what they need to do.**

Every important screen should make these questions obvious:

1. Where am I?
2. What is important?
3. What can I do?
4. What is the current status?
5. What should I do next?

### 2.2 Visual direction

RuangWarga should feel like a polished modern utility/mobile product rather than:

- an enterprise administration system
- a traditional government portal
- a generic dashboard template
- a visually heavy SaaS application

Use:

- restrained visual hierarchy
- generous but efficient whitespace
- strong typography
- compact information presentation
- subtle borders
- restrained shadows
- consistent spacing
- clear semantic colors
- lightweight interactions

Avoid:

- excessive gradients
- excessive glassmorphism
- excessive rounded cards
- decorative blobs
- excessive shadows
- unnecessary illustrations
- excessive animation
- oversized hero sections
- visual noise

---

## 3. UX Principles

### 3.1 Clarity over decoration

Visual elements must have a purpose.

If removing an element does not reduce comprehension or functionality, consider removing it.

### 3.2 Less text, more meaning

Prefer:

`September 2026 · Rp150.000 · Lunas`

over a paragraph explaining the same information.

Use:

- numbers
- labels
- status indicators
- icons
- short contextual descriptions
- clear actions

### 3.3 Progressive disclosure

Do not expose every available piece of information at once.

Use three information levels:

**Level 1 — Critical**
- current payment status
- amount
- outstanding balance
- primary action
- important announcements

**Level 2 — Useful**
- payment date
- payment method
- period
- supporting information

**Level 3 — Detail**
- transaction metadata
- audit information
- reference IDs
- technical details

Level 3 should normally appear in detail views, drawers, dialogs, or expandable sections.

### 3.4 One dominant purpose per screen

Each screen should have one primary user goal.

Examples:

- Dashboard → understand current household status
- IPL → pay/report IPL
- Payment history → review previous payments
- Residents → find a resident/house
- Finance → understand financial condition
- Announcements → understand current community information

---

## 4. Information Architecture

Navigation should be based on **user goals**, not internal database terminology.

Prefer:

- Home
- IPL
- Warga
- Keuangan
- Info

over:

- Transaction Management
- Resident Master Data
- Payment Reconciliation
- Financial Administration

Role-based navigation should be applied where appropriate.

Residents should not be exposed to administrative navigation they cannot use.

---

## 5. Dashboard Specification

The dashboard is the primary orientation point.

Priority order:

1. Current IPL status
2. Primary action
3. Important announcement
4. Quick access
5. Secondary information

The dashboard should not become a collection of unrelated metric cards.

Conceptual example:

```text
Selamat pagi, Dhani

IPL September
Rp150.000
Belum dibayar

[ Bayar IPL ]

Pengumuman
2 informasi baru

Akses cepat
Warga · Keuangan · Riwayat
```

The actual content must follow the existing application's data and permissions.

---

## 6. IPL / Payment Specification

Payment-related screens must prioritize:

1. Current period
2. Amount
3. Status
4. Primary action
5. Payment method
6. Relevant detail

A payment status should be understandable immediately without reading a paragraph.

Examples:

- `✓ Lunas`
- `• Menunggu`
- `! Belum bayar`
- `× Gagal`

Color must not be the only mechanism for communicating status.

---

## 7. Resident Directory Specification

The resident directory should optimize for finding people/houses quickly.

Prioritize:

- house/address identifier
- resident/contact name
- relevant contact information
- search
- useful filters

Avoid exposing unnecessary personal information.

On mobile, avoid dense desktop tables when a compact list/card pattern provides better usability.

---

## 8. Financial / Administrative Screens

Administrative screens can contain more information than resident screens, but they must still follow information hierarchy.

Use:

- compact tables
- strong number alignment
- meaningful column selection
- filtering only where useful
- clear totals
- progressive disclosure for detailed transaction data

Do not expose every database column simply because it exists.

---

## 9. Forms

Forms should minimize cognitive load.

Rules:

- request only necessary information
- use sensible defaults
- validate inline
- provide concise errors
- use correct input types
- group related fields
- avoid unnecessary confirmation steps
- automatically determine values where possible

Error messages should tell users what to do next.

Bad:

`Invalid input`

Better:

`Masukkan nominal pembayaran.`

---

## 10. Empty States

Empty states must explain the state and, when appropriate, provide the next action.

Bad:

`No data`

Better:

`Belum ada pembayaran`

Optional contextual action:

`[ Bayar IPL ]`

---

## 11. Loading & Feedback

Loading states should be lightweight.

Use skeletons only where they improve perceived continuity.

Prefer:

- local loading indicators
- optimistic updates where safe
- preserving existing content during refresh
- non-blocking feedback

Avoid full-screen blocking loaders for small operations.

---

## 12. Responsive Design

Mobile is the primary design target.

Minimum viewport validation:

- 360px
- 375px
- 390px
- 412px

Secondary:

- 768px
- 1024px
- 1440px

The interface must not introduce unnecessary horizontal scrolling.

Tap targets must remain comfortable on touch devices.

---

## 13. Typography

Typography must establish hierarchy without excessive sizing.

Suggested hierarchy:

- page title
- section title
- primary value
- supporting information
- metadata

Large typography should be reserved for important numbers or key information.

---

## 14. Color System

Use a restrained neutral base.

Semantic colors:

- Success → green
- Warning → amber
- Error → red
- Information → blue

Semantic colors must communicate meaning, not decoration.

Status must remain understandable when viewed without color.

---

## 15. Components

Reusable components should be preferred over page-specific implementations.

Candidate primitives:

- Button
- IconButton
- Input
- Select
- Badge
- Status
- Card
- Section
- DataRow
- EmptyState
- LoadingState
- Dialog
- Drawer
- Table
- MobileList
- PageHeader
- BottomNavigation / Navigation

Do not create a component abstraction solely for abstraction's sake.

If the same visual/interaction pattern occurs three or more times, evaluate whether it should become reusable.

---

## 16. Design Tokens

Use a compact spacing scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48`

Avoid arbitrary spacing values where a token can be used.

Centralize:

- colors
- typography
- spacing
- border radius
- borders
- shadows
- breakpoints
- component dimensions

---

## 17. Animation

Animation should communicate:

- state changes
- navigation
- hierarchy
- interaction feedback

Avoid decorative animation.

Animations must be subtle and must respect:

`prefers-reduced-motion`

---

## 18. Performance Requirements

UI improvements must not materially degrade performance.

Before adding a dependency, determine whether existing CSS, React, browser APIs, or installed project dependencies can solve the problem.

Avoid adding libraries for:

- a single icon
- a single animation
- one simple component
- decorative effects

Avoid unnecessary:

- client-side rendering
- re-renders
- large assets
- JavaScript bundles
- network requests
- duplicated data fetching

---

## 19. Accessibility

Maintain:

- semantic HTML
- keyboard navigation
- visible focus states
- accessible labels
- appropriate ARIA attributes
- adequate contrast
- screen-reader-friendly status information
- accessible interactive states

Do not sacrifice accessibility for visual minimalism.

---

## 20. Business Logic Protection

The redesign must preserve:

- API contracts
- database behavior
- authentication
- authorization
- payment logic
- IPL calculations
- QRIS/payment logic
- transaction states
- resident data behavior
- financial calculations

Business logic changes are out of scope unless explicitly required.

---

## 21. Quality Gate

A screen is not considered complete until it passes:

### Clarity
Can a new user understand the screen within approximately 3 seconds?

### Efficiency
Can the primary task be completed with minimal interaction?

### Density
Can unnecessary visible UI/text be removed?

### Hierarchy
Is the most important information visually dominant?

### Consistency
Does it follow the shared design system?

### Mobile
Does it work naturally at 360px width?

### Performance
Did the redesign avoid unnecessary rendering, assets, dependencies, and requests?

### Accessibility
Can users understand and operate the interface using accessible interaction patterns?

---

## 22. Definition of "Modern"

For this project, modern means:

- clear hierarchy
- restrained visual language
- excellent spacing
- strong typography
- fast interaction
- predictable navigation
- low cognitive load
- consistent components

It does **not** mean:

- gradients everywhere
- glassmorphism everywhere
- giant text
- giant cards
- excessive animation
- decorative effects

---

## 23. Final Product Principle

> **The UI should disappear; the task should remain.**

Users should think about their neighborhood, payments, information, and community—not about how to operate RuangWarga.
