# UX Audit — Finesse Quote Portal (Structure, Navigation & Manager Dashboard)

_Mahon Consulting · Client: Finesse · 2026-07-16 · Read-only code audit of live routes and components; no files modified._

> Plain-text companion to `2026-07-16_finesse-portal-ux-structure-audit.docx`, kept in-repo so a Claude Code / engineering session can read and grep the findings directly. Grounded in the actual `src/` routing, layout shell, sidebar, dashboard variants, admin pages, and the 16-stage workflow constants.

---

## 1. Executive summary

The portal's data model is sound but the interface is organised around **database nouns, not the manager's day**. Four structural problems dominate:

1. **The admin has two competing dashboards that both under-serve him.** `/dashboard` (`AdminDashboard` in `src/app/dashboard/page.tsx`) shows vanity KPIs plus a What-If pricing toy; `/admin` (`src/app/admin/page.tsx`) shows a *second*, smaller set of KPIs (Total Users, Total Quotes, Active Blind Styles) and a *second* Recent Activity feed. Two "overview" screens, neither of which tells the manager what needs his attention today.
2. **The attention logic already exists — but only for salesmen.** `salesAttention()` in `src/app/dashboard/page.tsx` computes expiring quotes, unanswered quotes, and stale drafts and renders a "Needs attention" card on the **Sales** dashboard. The **Admin** dashboard has none of it. The manager sees averages; the salesman sees action items. That is backwards for an operational owner.
3. **Product management is noun-soup split across three differently-named admin items** — "Awning Products", "Blind Management", "Pricing" — with no parent grouping. Nothing tells a user these are one concern (the catalogue).
4. **The What-If tool is mis-placed** exactly as the client says: it's a preview-only widget occupying a third of the admin dashboard's main grid, while the real control it previews is one click away in Pricing.

Headline fixes: replace the admin KPI-and-What-If dashboard with an **operational attention queue** (reusing logic that already exists), **merge the two admin overviews**, **group the catalogue under one "Catalogue & Pricing" heading with consistent naming**, and **move What-If into the Pricing page** where the actual sliders belong.

---

## 2. Structure & IA audit

### Current navigation map (`src/components/layout/sidebar.tsx`)

| Area | Route | Roles | Purpose | Note |
|---|---|---|---|---|
| Dashboard | `/dashboard` | all | Role-aware landing | 3 variants in one file |
| Properties | `/properties` | all | Property → room → window tree | Primary object |
| Quotes | `/quotes` | all | Quote list | No expiring/attention filter |
| Style Gallery | `/gallery` | all | Browse styles | Customer-facing |
| Jobs | `/jobs` | staff | 16-stage board | Staff only |
| Admin › Overview | `/admin` | admin | KPIs + activity | **Duplicates `/dashboard`** |
| Admin › Users | `/admin/users` | admin | User management | Fine |
| Admin › Awning Products | `/admin/awning-products` | admin | Awning catalogue | Catalogue #1 |
| Admin › Blind Management | `/admin/catalog` | admin | Type→Opacity→Style→Colour + hardware rules | Catalogue #2 (route `/catalog`, label "Blind Management" — mismatch) |
| Admin › Pricing | `/admin/pricing` | admin | Global pricing config | Catalogue #3 (pricing) |
| Admin › Audit Logs | `/admin/audit-logs` | admin | Activity log | Fine |

### What's confusing, mis-grouped, or buried

- **Two overviews.** `/admin` and `/dashboard`'s admin branch both open with KPI cards + a Recent Activity list. Clicking "Overview" from the dashboard gives a *worse, thinner* version of the same idea. One must go.
- **Catalogue is fragmented and inconsistently named.** "Awning **Products**" vs "Blind **Management**" — same job, two different words. The blind route is literally `/admin/catalog`, so the internal name already knows this is the catalogue. No parent grouping ties awnings + blinds + pricing together.
- **"Overview" as a label under "Admin"** is redundant with the top-level Dashboard.
- **Product management is admin-only and flat.** Editing the catalogue is a frequent, core task for a window-treatments business, but it's buried at the bottom of an "Admin" section styled as rare configuration.

### Product-management clarity: is the grouping intuitive? No.

To "add a new blind colour" or "add an awning model and set its price", a manager must know that blinds live under **Blind Management** (`/admin/catalog`), awnings under **Awning Products** (`/admin/awning-products`), and pricing under **Pricing** (`/admin/pricing`). Three routes, three names, no shared home. Clearest IA defect after the dashboard.

### 3-click scoring

| Task | Current path | Clicks | Verdict |
|---|---|---:|---|
| Find a quote expiring this week (manager) | `/dashboard` (nothing) → Quotes → scan (no filter) → open | 2 + scan | **Fails** |
| Find a stalled job | Nothing aggregates time-in-stage; must open each job | ∞ | **Fails** |
| Advance a job stage | Jobs → expand stage section → card dropdown → pick | 4 | Borderline |
| Edit blind catalogue | Admin → Blind Management | 1–2 | OK once label known |
| Change exchange rate | Pricing → edit field → Save | ~2 | Good |

### Scorecard

| Category | Score /5 | Reason |
|---|---:|---|
| Task clarity | 2 | Admin dashboard answers "how are we doing on average?" not "what needs me today?" |
| Information hierarchy | 2 | Vanity KPIs + What-If dominate; attention items absent |
| Navigation / click-depth | 2 | Expiring quotes / stalled jobs effectively unreachable; duplicate overviews |
| Content density | 3 | Reasonable, but density spent on the wrong things |
| Visual consistency | 4 | shadcn/ui + Tailwind consistent; shared StatCard, badges, breadcrumbs |
| Component reuse | 4 | PageBreadcrumb, StatCard, QuoteStatusBadge, workflow constants centralised |
| Forms / tables / actions | 3 | Pricing form clean; quotes list lacks operational filters |
| Accessibility | 3 | Labels + focus states present; workflow colour bands carry meaning by colour alone |
| Responsiveness | 4 | Mobile drawer + calendar fallback in AppShell |
| Empty/loading/error | 3 | Empty states on lists; dashboards have no skeleton/loading |
| Implementation simplicity | 4 | Fixes are mostly re-composition of existing data |

---

## 3. What-If tool — confirmed, and where it should go

The client's instinct is correct, and the code proves it. `src/components/dashboard/what-if-panel.tsx`:

- Is explicitly **preview-only** — states "Preview only — nothing is saved." It never writes; only recomputes a sample quote in a `useMemo`.
- **Already links to `/admin/pricing`** — an "Open Pricing Settings" button.
- Occupies a full cell of the admin dashboard's primary 2-column grid (`src/app/dashboard/page.tsx`), between "Pipeline by rep" and "Recent activity" — prime real estate for a tool used maybe monthly.

**Recommendation:** Move `WhatIfPanel` onto the Pricing page (`src/app/admin/pricing/page.tsx`), beneath `PricingEditor`, inside a collapsible **"Preview impact before saving"** section (default collapsed). Co-locates the preview with the sliders that commit the change. Keep the existing `sample`/`config` props — the Pricing page already loads the full `pricing_config` row and can fetch the same recent-quote sample. Lift-and-shift, business logic (`calculateQuoteTotals`) untouched. The freed dashboard cell is absorbed by the attention queue (§5). **Effort: Small.**

---

## 4. Click-reduction list

Clicks counted against real routes. "Click 0" = visible on the landing page.

| # | Task (role) | Current | Clicks | Proposed | Clicks | Saved |
|---|---|---|---:|---|---:|---:|
| 1 | Find a quote expiring this week (manager) | Dashboard nothing → Quotes → scan → open | 2 + scan | Dashboard "Expiring ≤7 days" card → row | 1 | 1 + scan |
| 2 | Find a stalled job (manager) | Not surfaced; open jobs one by one | ∞ | Dashboard "Stalled in stage" card → job | 1 | → 1 |
| 3 | Chase a quote sent >7 days, no reply | Not on admin dashboard → Quotes → scan | 2 + scan | Dashboard "Awaiting response" card → row | 1 | 1 + scan |
| 4 | See this week's installs + readiness | Jobs-this-week KPI → calendar (no readiness) | 1 | "Install schedule" card, prerequisite-flagged | 1 | adds readiness |
| 5 | Advance a job stage (staff) | Jobs → expand section → dropdown → pick | 4 | Board opens with relevant stage expanded → pick | 3 | 1 |
| 6 | Create a quote for a new customer | Mislabelled "New Quote" → property → room → window → generate | ~6 | Chained New-Quote wizard, correctly labelled | ~5 | 1 |
| 7 | Preview pricing, then commit | Dashboard What-If → Pricing → edit → Save | 2 | Pricing → "Preview impact" → edit → Save | 2 | off daily view |
| 8 | Check the exchange rate is current | Not surfaced → Pricing → read field | 1 | Dashboard "Pricing status" card (rate + age) | 0 to see | 1 |

**Concrete clarity bug:** the "New Quote" button in `SalesDashboard` links to `/properties?new=true`, which opens the **Add Property** dialog. Labelling a property-creation entry point "New Quote" is misleading — relabel it or build the wizard.

---

## 5. Manager operational dashboard — redesign spec

The manager's daily question is *"what needs intervention now, and what's about to go wrong?"* — not *"what's my average quote value?"* Split into **Action queue** (needs me now) and **Situational awareness** (context, demoted). Every card runs on tables the app already queries — no new tables.

### Action queue — ordered by operational urgency

| Card | Shows | Data source | Trigger logic | Click-through |
|---|---|---|---|---|
| **Overdue & at-risk installs** | Job, customer, install date, stage | `jobs.scheduled_install_date`, `workflow_stage` | Install date past AND stage < `installation_complete`; OR install ≤3 days out AND prerequisite stage unmet | `/jobs/[id]` |
| **Quotes expiring ≤7 days** | Property, customer, value, days left | `quotes` + `effectiveQuoteStatus` | `effective === 'sent'` and `expires_at − now ≤ 7d` (generalises `salesAttention.expiringSoon`) | `/quotes/[id]` |
| **Awaiting response >7 days** | Property, value, days since sent, rep | `quotes.sent_at` | `effective === 'sent'` and `now − sent_at > 7d` (`salesAttention.unanswered`, ported to admin, all reps) | `/quotes/[id]` |
| **Jobs stalled in stage** | Job, current stage, days in stage | `jobs.stage_history` (jsonb) | `now − lastStageEntry.at > threshold` (start 5 business days) | `/jobs/[id]` |
| **Unsent aging drafts** | Property, rep, days as draft | `quotes` | `effective === 'draft'` and `now − created_at > 3d` (`salesAttention.drafts`, aged) | `/quotes/[id]` |

Each card shows a **count + total value-at-risk** header, top 3–5 rows, and a "view all N" deep-link into the filtered list. Empty cards show a quiet green "All clear" — don't hide them.

### Situational awareness — context, visually demoted

| Card | Shows | Click-through |
|---|---|---|
| Compact KPI strip | Pipeline (sent) $, Acceptance 90d, Quotes this month — one thin row | `/quotes?status=sent` etc. |
| Install schedule (7 days) | Dated mini-list of upcoming installs | `/jobs/calendar` |
| Workflow snapshot | 16-stage counts strip — kept, de-emphasised | `/jobs?stage=…` |
| Pipeline by rep | Existing rep chips — keep (management tool) | `/quotes?rep=…` |
| Pricing status | Exchange rate + "last changed N days ago" (`pricing_config.updated_at`) | `/admin/pricing` |
| Recent activity | Collapsed by default | `/admin/audit-logs` |

### Explicitly demoted vanity metrics

- **"Avg quote value"** (`dashboard/page.tsx`): remove from the hero row; drives no daily action. Park on a future Reports page.
- **Big hero KPI cards** (Pipeline / Acceptance / Quotes-this-month): shrink to one compact context strip.
- **What-If panel:** gone from the dashboard entirely (→ Pricing, §3).
- **`/admin` Overview KPIs** (Total Users / Total Quotes / Active Styles): delete — pure vanity counts, duplicate the dashboard.

### Do NOT invent (honest constraints)

- **"Blocked / on-hold" jobs:** the 16-stage `WORKFLOW_STAGES` has no on-hold state. Express as **stalled** (time-in-stage). An explicit hold is a data-model change for the database architect.
- **Live FX drift:** no market-rate feed exists — don't fake one. The honest low-effort version is the **age** of the rate (`pricing_config.updated_at`).
- **Low-margin quotes:** a true margin needs a landed-cost basis the schema lacks. Flag as phase-2; don't ship a misleading markup-only "margin".

### Acceptance criteria

- Every attention card resolves in ≤1 click to the specific record.
- Manager sees, without scrolling past chrome, the count needing attention + total value at risk.
- No attention state communicated by colour alone (pair every status colour with a text label — today's `WORKFLOW_STAGE_COLORS` bands are colour-only).
- Empty attention cards show explicit "all clear".
- Vanity metrics present but visually subordinate.

---

## 6. Proposed navigation / IA restructure

```
Dashboard            (operational attention queue for staff/admin)
Properties
Quotes
Jobs                 (staff)
Style Gallery
── CATALOGUE & PRICING ──   (admin — new sub-group)
   Blinds            → /admin/catalog          (relabel "Blind Management" → "Blinds")
   Awnings           → /admin/awning-products   (relabel "Awning Products" → "Awnings")
   Pricing           → /admin/pricing           (now hosts What-If)
── ADMIN ──
   Users             → /admin/users
   Audit Logs        → /admin/audit-logs
```

Key changes, all realistic against `sidebar.tsx` (which already renders a grouped section via a header + mapped array):

1. **Delete the "Overview" item and the `/admin` KPI page.** It duplicates the dashboard — `redirect('/dashboard')` or repurpose `/admin` as a settings hub. Removes the second activity feed + vanity counts. **Quick win.**
2. **Introduce a "Catalogue & Pricing" sub-group** — same header-plus-mapped-array pattern the sidebar already uses for "Admin". Gives product management one obvious home.
3. **Consistent naming:** "Blinds" and "Awnings" (parallel nouns), not "Blind Management" vs "Awning Products". Page H1s can keep fuller wording; nav labels short and parallel.
4. **Keep "Admin" for genuinely rare items** (Users, Audit Logs).

---

## 7. Prioritised recommendations

| # | Recommendation | Impact | Effort | Severity |
|---|---|:---:|:---:|:---:|
| 1 | Rebuild the admin dashboard around the action queue (Cards A–E), reusing `salesAttention`; demote KPIs to a compact strip | H | M | **Critical** |
| 2 | Surface stalled jobs using `stage_history` (time-in-stage) — highest-value new signal | H | M | **Critical** |
| 3 | Delete the `/admin` Overview duplicate; redirect to `/dashboard` or make it a settings hub | H | S | High · quick win |
| 4 | Move `WhatIfPanel` from the dashboard into `/admin/pricing` under a collapsible "Preview impact" | H | S | High · quick win |
| 5 | Group catalogue under "Catalogue & Pricing"; parallel labels Blinds / Awnings / Pricing | M | S | High · quick win |
| 6 | Add "value at risk" + deep-links to each attention card | M | S | High |
| 7 | Relabel the "New Quote" button (opens Add Property) and/or build a chained New-Quote wizard | M | M | Medium |
| 8 | Pair every workflow/status colour with a text label (colour-only today) | M | S | Medium · a11y |
| 9 | Add "expiring" / "awaiting response" saved filters to the quotes list so "view all" lands somewhere real | M | S | Medium |
| 10 | Add loading skeletons to dashboard cards; keep empty "all clear" states explicit | L | S | Low |
| 11 | Phase 2 (needs data): explicit job "hold" state; low-margin card with real cost basis; live FX-drift feed | M | L | Defer |

### First thing to ship

Replace the admin dashboard's KPI-and-What-If layout with the five-card action queue, reusing the `salesAttention` logic that already exists for salesmen and adding the `stage_history` stalled-jobs check. Bundle the three quick wins (delete the duplicate `/admin` overview, move What-If to Pricing, regroup the catalogue) in the same pass.

### Risk if ignored

The manager keeps running the business by manually scanning Quotes and opening Jobs one at a time. The two failure modes that cost money — lost deals and missed installs — stay invisible until they've already happened.

---

## Sequencing note (2026-07-16)

Implementation was intentionally parked pending the product-info / style-gallery / feature-page exercise — which the supplier-catalogue batch (commit `e199d6f`, deployed) now delivers. This audit is the baseline; the manager-dashboard redesign + nav restructure should absorb the new gallery/landing surfaces into the overall look/feel/flow rather than bolt them on. This is the natural next pickup.

## Key files referenced

- `src/components/layout/sidebar.tsx` — nav definition (§2, §6)
- `src/app/dashboard/page.tsx` — three dashboard variants; `salesAttention`, admin KPIs, What-If placement (§3, §5)
- `src/components/dashboard/what-if-panel.tsx` — preview-only tool (§3)
- `src/app/admin/page.tsx` — duplicate overview (§2, §6)
- `src/app/admin/pricing/page.tsx` + `src/components/admin/pricing-editor.tsx` — target for What-If (§3)
- `src/app/admin/catalog/page.tsx` + `src/app/admin/awning-products/page.tsx` — catalogue naming (§2, §6)
- `src/app/jobs/page.tsx`, `src/app/jobs/[id]/page.tsx`, `src/components/jobs/jobs-board-client.tsx` — job stage flow, `stage_history` (§4, §5)
- `src/app/quotes/page.tsx` — quotes list, missing operational filters (§4)
- `src/lib/constants.ts` — `WORKFLOW_STAGES`, `WORKFLOW_STAGE_ORDER`, `WORKFLOW_STAGE_COLORS` (§5, §7)
