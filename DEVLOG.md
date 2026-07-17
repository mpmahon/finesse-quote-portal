# Finesse Quote Portal — Development Journal

Single source of truth for design, architecture, and current state. Read this at the start of every session on this project.

## 1. Stack & deployment

- **Framework**: Next.js 16.2.3 (App Router) + React 19.2.4
- **Language**: TypeScript 5 (strict)
- **Styling**: Tailwind CSS v4 + shadcn/ui + `@base-ui/react`
- **Forms**: `react-hook-form` + `zod`
- **Data**: Supabase (Postgres + Auth + RLS)
  - Client: `@supabase/ssr` (server client for RSC/route handlers/middleware) + `@supabase/supabase-js` (browser client)
  - Project ref: `vcnakuehawpkzzuzkixb`
  - Migrations live at `supabase/migrations/` and are forward-only, numbered sequentially
- **PDF**: `@react-pdf/renderer` (quote PDFs)
- **Hosting**: Vercel
- **Repo**: `github.com/mpmahon/finesse-quote-portal` (main branch)
- **Currency**: TTD is the display default. Component cost prices are stored in USD in the DB and converted at display time using `pricing_config.exchange_rate`. The customer never sees USD or the exchange rate.
- **IMPORTANT**: `AGENTS.md` at the project root notes that Next.js 16 has breaking changes vs training-data Next. Always consult `node_modules/next/dist/docs/` before writing server actions, route handlers, or middleware code you haven't recently seen.

## 2. Architecture at a glance

### Route layout

```
src/app/
├── page.tsx                    # marketing landing
├── auth/
│   ├── login/                  # passwordless via Supabase
│   └── callback/                # OAuth + magic link callback
├── properties/                 # customer + salesman + admin home (renamed from /dashboard in Batch 1)
│   ├── page.tsx                # list all visible properties
│   ├── layout.tsx              # sidebar + shell
│   └── [id]/
│       ├── page.tsx            # rooms for a property
│       └── rooms/[roomId]/
│           ├── page.tsx        # windows for a room
│           └── windows/[windowId]/
│               └── page.tsx    # window configurator (blinds + awnings)
├── quotes/
│   ├── page.tsx                # list visible quotes
│   └── [id]/page.tsx           # quote detail (summary, per-room tables, grand total, PDF button)
├── admin/                      # administrator-only (middleware-guarded)
│   ├── page.tsx                # overview
│   ├── users/                  # role management
│   ├── products/               # blind products
│   ├── awning-products/
│   ├── catalog/                # shade_types / styles / colours
│   ├── pricing/                # pricing_config editor
│   └── audit-logs/
└── api/
    └── quotes/calculate/       # server-side quote total recalculation endpoint
```

### Data flow

Server components fetch via `createClient()` (server Supabase client) → RLS scopes what the signed-in user can see. Mutations from the browser go through the browser client (`createClient` from `@/lib/supabase/client`) and also rely on RLS. The quote engine (`src/lib/quote-engine.ts`) is a pure function library — it takes a window config + component rows and returns costs. No DB access inside the engine.

### Middleware

`middleware.ts` handles: auth gate for `/properties`, `/quotes`, `/admin`; admin role gate for `/admin/*`; signed-in-user redirect off `/auth/*`. The auth-cookie refresh pattern uses `@supabase/ssr`'s `createServerClient` with the `getAll`/`setAll` cookie bridge — don't touch this unless you know what you're doing.

## 3. Design decisions

- **2026-04-11 — Currency strategy**: store component costs in USD (source of truth from suppliers), display everything customer-facing in TTD using `pricing_config.exchange_rate`. Rules out: storing dual currencies, requiring an FX service. Accepts: manual exchange rate maintenance by admin.
- **2026-04-11 — Markup strategy**: single markup field replaced by `retail_markup_pct` and `wholesale_markup_pct`, applied based on the customer's role. Markup is applied silently — the customer sees a single per-window total with no breakdown. Rules out: showing "subtotal + markup" style pricing. Planned for Batch 4.
- **2026-04-11 — Role model**: four roles — `retail_customer`, `wholesale_customer`, `salesman`, `administrator`. Salesmen are internal Finesse staff; they can see and edit all properties/quotes (not scoped to their own creations) and can create customers. Salesmen have no access to pricing edits, user management, catalog/product edits, or audit log edits. Customers see only their own properties/quotes. All staff actions are tracked in an activity log (Batch 2).
- **2026-04-11 — Hardware exclusion state**: stored per-window on the `windows` table as `excluded_components text[]`. Persists across quote regenerations. A small muted note on both the window view and quote ("Cassette not included") reflects the exclusion. Batch 4.
- **2026-04-11 — Quote notes**: stored as `jsonb` array on the `quotes` table (each note: `{id, text, show_on_pdf}`). Multiple notes per quote, each with its own "show on PDF" toggle. Rules out: a separate `quote_notes` table (overkill for expected volume). Batch 4.
- **2026-04-11 — Duty / shipping / exchange-rate display**: hidden entirely from customer-facing quote UI and PDF. Columns remain in the DB (`quotes.duty_percent`, `shipping_fee_ttd`, `exchange_rate`) because they will be needed when the Purchasing Module is built later. Batch 1 complete.
- **2026-04-11 — Labour**: stays in the DB, rolled into the per-window line total silently (not shown as a separate row to the customer). Batch 4.
- **2026-04-11 — Admin-creates-customer flow**: Supabase Admin API (service_role) invoked from a server action, creates the auth user with `email_confirm: true` and the default temp password `Finesse4Blinds!`. The customer can log in and change their password. No email verification step. Batch 3.

## 4. Current stage

**Done**:
- Supplier layer (2026-07-16/17) — supplier catalogue (migration `00021`, Vertilux/Loman/Mitjavila scraped into our own style/colour hierarchy) is **APPLIED and DEPLOYED** (commit `e199d6f`). Built on top of it: a full Supplier Administration module — cost capture + allocation (migration `00022`, incl. the `reassign_primary_source` RPC, 3 partial unique indexes, `supplier_products` cost columns, `supplier_links.quantity_per`/`is_primary_source`) — is now **FULLY LIVE**. `00022` was applied to production Supabase (`vcnakuehawpkzzuzkixb`) by Mark via the SQL Editor and verified live via MCP; this session's atomic-switch improvement was committed as `5f5befd` and deployed to production (Vercel `dpl_9HQ9jTxd7AVtMrhnekABuT4b7eTD`, aliased to https://finesse-quote-portal.vercel.app). Confirmed both `kramnoham@gmail.com` and `mahon627@gmail.com` carry `administrator` role — the earlier access confusion was never a permissions problem, the module just hadn't shipped. Still open: not pushed to GitHub (blocked on rotating 2 GitHub PATs) and whether supplier cost should ever feed customer-facing quote pricing (undecided, `quote-engine.ts` untouched). Details in the change log.
- Batch 7 (2026-07-07) — blind option hierarchy rework (Type → Opacity → Style → Colour, plus per-Type Valance/Finisher), implemented per the client-approved spec. **Migrations 00015 + 00016 + 00017 all APPLIED to live Supabase and the app DEPLOYED to production** (https://finesse-quote-portal.vercel.app, Vercel CLI, 2026-07-07 evening). Live seed verified: 6 types / 15 opacities / 12 styles / 0 colours / 14 valances / 12 hardware rules / max width 228″. **Still uncommitted** — Mark has not asked for a commit yet; the deployed build came from the working tree. Details in the change log.
- Batch 6 (2026-07-07) — client-feedback quick wins from the Mike demo review, implemented and deployed with Batch 7 above. Details in the change log. The full feedback triage lives at `..\outputs\2026-07-07_finesse-client-feedback-backlog.md`; the glossary draft for Mike at `..\outputs\2026-07-07_finesse-glossary-draft.md` / `.docx`.
- Batch 5 (2026-07-07) — design doc v2 implemented in full: WS1 cleanup & hardening, WS2 role dashboards + mobile shell, WS3 style gallery & visual quoting, WS4 quote lifecycle + jobs & scheduling. Migrations 00009–00014 applied to live Supabase (plus the previously-missed 00005 nullable product_id fix). Demo dataset seeded for client review (`scripts/seed-demo.ts`). Details in the change log.
- Batch 1 — Rename `/dashboard` → `/properties` (routes, nav, redirects, links). Strip exchange-rate / duty / shipping / labour rows from quote detail page and PDF. Convert Property list cards and Grand Total to TTD display.
- Batch 2 — Schema migrations applied to the live Supabase project (`vcnakuehawpkzzuzkixb`). TypeScript types, admin managers, register page, and quote-engine import updated to match. Salesman reseller-discount logic removed. Pricing editor gained retail / wholesale markup fields. Audit-log UI relabelled to "Actor" / "Activity".
- Batch 3 — Admin/salesman customer-creation flow. New `src/app/properties/actions.ts` with two server actions (`createCustomerAction` via service_role, `createPropertyAction` via authenticated server client). `PropertyList` rewritten as a multi-step dialog with customer picker + inline new-customer form for staff. Add-Property button unhidden for everyone (staff routes through picker; customers route direct to property form). Properties page server component fetches the customer list when staff is viewing.

**In progress**: The Supplier Administration module is live — nothing left blocking it. Remaining follow-ups: push local `main` (now at `5f5befd`) to GitHub once the 2 GitHub PATs are rotated; decide whether supplier cost should ever feed customer-facing quote pricing (still undecided). Also still outstanding: Mark's QA verdict on Batches 6–8 in production, then apply migration 00015, commit, deploy.

**Next up**: Batches 8–12 from the feedback backlog (`..\outputs\2026-07-07_finesse-client-feedback-backlog.md`) — 8: size thresholds / oversized filtering / hardware factors (blocked on Mike's posted note + motorization threshold — the hardware-tier pricing itself is still TBD, see open questions); 9: blind filter + multi-option quotes with price ranges; 10: wholesale room-quantity quoting; 11: 16-status order workflow; 12: supplier Catalogue (brochure PDFs). Also still open from Batch 7: linking `products` to the new hierarchy (deferred — see spec open question 2) once Mike's Style/Colour data is in; Batch 7's own "config (mount/recess depths, size limits)" half wasn't in this pass's brief — check with Mark whether that's folded into Batch 8 or still pending. All need Mark's go — they reshape the data model.

**Superseded (old Batch 4 list, largely absorbed by Batch 5/WS1)**:
1. Rewrite `calculateQuoteTotals` to apply `retail_markup_pct` or `wholesale_markup_pct` based on the target customer's role, roll labour into each line item's total, and apply installation only when the customer is `retail_customer`.
2. Update `calculateLineItem` to accept an `excluded_components` array and skip unchecked hardware in both the cost calculation and the component list.
3. Window configurator UI: list each hardware component as a checkbox, default all checked, persist the unchecked set to `windows.excluded_components`.
4. Window / room / property navigation: small muted footnote when any hardware is excluded ("Cassette, tube not included").
5. Quote detail + PDF: the same footnote on any line item whose window has exclusions.
6. Quote notes editor: multi-note list with per-note `show_on_pdf` toggle, writing to `quotes.notes` jsonb.
7. PDF: render only the notes with `show_on_pdf: true`.
8. Purge the per-component USD breakdown column (Cassette / Tube / Rail / Chain / Fabric / Fixed) from the quote detail table and the PDF table. Customer sees one TTD total per window.
9. Drop (or ignore) legacy `default_markup_pct` and `reseller_discount_pct` once nothing reads them. Do NOT drop `duty_percent`, `shipping_fee_ttd`, `labor_cost_ttd`, `exchange_rate` — those stay in the DB for the future Purchasing Module.

**Deferred**:
- Unused `products` prop in `src/components/windows/window-list.tsx` (pre-existing, not Batch-2/3-induced). (The old `catalog-manager.tsx` lint deferral above is resolved — that file was deleted in Batch 7, replaced by the hierarchy manager.)
- Linking `products` to the new blind hierarchy (spec open question 2) — deferred until Mike's Style/Colour data is complete. Until then the window configurator filters products by Type only for Roller Shade/Neolux Shade (the two Types with `blind_type`-tagged products); every other Type shows the full catalog with a "mapping pending" note.

## 5. Handover point

**2026-07-17 (latest).** The Supplier Administration module (`/admin/suppliers`
route, supplier + product + allocation managers, sidebar entry, read-only
reference-cost line on the blind style editor, and migration
`00022_supplier_cost_and_allocation.sql`) is **FULLY LIVE in production**.
`00022` (adds `supplier_products` cost/currency/unit-of-measure/price-timestamp
columns, `supplier_links.quantity_per` + `is_primary_source`, three partial
unique indexes enforcing one primary source per blind style/colour/awning
target, and the `reassign_primary_source()` security-definer RPC for atomic
primary-source switching) was applied to live Supabase (`vcnakuehawpkzzuzkixb`)
by Mark via the SQL Editor and verified live via MCP: all 4 `supplier_products`
cost columns present, all 3 `supplier_links` columns present, the RPC exists,
all 3 primary-source unique indexes present, data intact (3 suppliers, 71
supplier_products, 272 supplier_links). This session's atomic-switch
improvement (the RPC, the `supplier-link-manager.tsx` refactor, and
delete-confirmation warnings in the supplier/product managers) was committed as
`5f5befd` ("fix(suppliers): make primary-source switching atomic", 5 files) and
deployed to production — Vercel deployment `dpl_9HQ9jTxd7AVtMrhnekABuT4b7eTD`,
READY, aliased to https://finesse-quote-portal.vercel.app. Production build
compiled `/admin/suppliers`, TypeScript passed, and the route was verified
reachable (`/admin/suppliers` → 200 → redirect to `/auth/login`, i.e. route
exists and is admin-gated as designed). Confirmed via a live query that both
`kramnoham@gmail.com` and `mahon627@gmail.com` carry `administrator` role —
record this as the resolved root cause: admin access was never the blocker,
the module simply hadn't been deployed to production before.

Only two follow-ups remain on this module: (1) push local `main` (now at
`5f5befd`, ahead of `origin/main`) to GitHub — blocked on rotating the 2 GitHub
PATs; (2) the still-unmade design decision on whether supplier cost should ever
feed customer-facing quote pricing — `quote-engine.ts` remains deliberately
untouched, supplier cost stays reference/reporting only until Mark decides.

Also still open: Supabase DB password unrotated (see §7/pending rotations). A
UX structure/usability audit was produced 2026-07-16
(`outputs/2026-07-16_finesse-portal-ux-structure-audit.docx`) — implementation
(action-queue admin dashboard, move What-If into Pricing, "Catalogue & Pricing"
nav group) **shipped this session as UX Phase 1** — see the change log. Phase 2
items (saved "expiring/awaiting/stalled" quote & job filters, explicit job hold
state, real-margin card, live FX drift) remain deferred.

Batches 5–8 (role dashboards, style gallery, quote lifecycle/jobs, blind
hierarchy, quantities, 16-stage workflow) are live in production as of
2026-07-08 — full detail in the change log below. Outstanding from that work:
Mike still needs to enter the TBD Style/Colour data and per-style component
prices in Blind Management, and price the hardware-size tiers; markup %
defaults (currently 40/20 placeholder) need confirming; Batches 9–12 (blind
filter panel, wholesale room-quantity quoting, workflow polish, supplier
brochure catalogue) await Mark's prioritisation.

Demo logins unchanged (`Finesse4Blinds!`; `demo.sales@` / `demo.retail@` /
`demo.wholesale@finessett.com`); demo reseed via `npx tsx scripts/seed-demo.ts`.

## 6. Change log

### 2026-07-17 — UX Phase 1: action-queue dashboard, nav regroup, What-If moved (+ supplier dialog fix)

Implemented Phase 1 of the 2026-07-16 UX structure audit (audit §3/§5/§6/§7 items 1–5 + 8), and separately fixed a supplier-dialog layout defect Mark reported.

**Supplier allocation dialog fix** (deployed `dpl_C2i59DPin…`, committed separately). The Allocations dialog and the reverse Sourcing-Lookup rendered fixed multi-column shadcn `<Table>`s whose `overflow-auto` wrapper forced horizontal scroll once long "Type → Opacity → Style → Colour" target paths appeared — clipping Qty/Unit, Colour Code, Source and the actions off-screen. Replaced both with a wrapping flex-row layout (target path wraps; meta cluster flows beneath on narrow widths) and widened the host dialog to `w-[95vw] max-w-4xl`. `supplier-link-manager.tsx`, `supplier-allocation-lookup.tsx`, `supplier-product-manager.tsx`.

**UX Phase 1** (deployed `dpl_63F9vwTWWsy…`, aliased live). New `src/lib/attention.ts` — five pure, `now`-injected trigger helpers (`expiringQuotes` ≤7d, `awaitingResponse` >7d, `agingDrafts` >3d, `stalledJobs` >5d time-in-stage from `stage_history` excluding the terminal stage, `atRiskInstalls` overdue/at-risk) with `src/lib/attention.test.ts` (22 tests, TDD-first; suite now 63/63). `AdminDashboard` (`src/app/dashboard/page.tsx`) rebuilt around a five-card **action queue** (count + value-at-risk, ≤1-click to record, explicit "All clear" empties) via new `src/components/dashboard/attention-card.tsx`; KPI row demoted to a compact strip ("Avg quote value" dropped); 16-stage workflow strip de-emphasised + given a colour-band legend (a11y); pipeline-by-rep kept; Recent Activity collapsed into `<details>`. `salesAttention` refactored onto the shared helpers. `WhatIfPanel` removed from the dashboard and moved to `/admin/pricing` under a collapsible "Preview impact before saving" `<details>` (`calculateQuoteTotals` untouched). `/admin` (`src/app/admin/page.tsx`) now `redirect('/dashboard')` — duplicate overview deleted. Sidebar (`src/components/layout/sidebar.tsx`) regrouped: **Admin** = Users + Audit Logs; new **Catalogue & Pricing** = Blinds/Awnings/Suppliers/Pricing. `src/lib/constants.ts` gained `WORKFLOW_STAGE_BAND_LABELS`/`bandForStage()` for the colour-band a11y label. Constraints honoured: no `on_hold` invented (stalled = time-in-stage), no supplier cost in the engine, no 00022 columns on the dashboard. Verified: tsc + lint clean, 63/63 vitest, Vercel remote build green. **Value-at-risk on job cards** = linked quote `total_ttd` (pre-quote jobs 0). **Deferred (audit item 9):** stalled/install "view all" links point at the base `/jobs` / `/jobs/calendar` (no pre-filtered view exists yet).

### 2026-07-17 — Supplier Administration module: applied, committed, deployed (FULLY LIVE)

Closed out the module from the entry directly below. Mark applied migration
`00022_supplier_cost_and_allocation.sql` to production Supabase
(`vcnakuehawpkzzuzkixb`) via the SQL Editor; verified live via MCP — all 4
`supplier_products` cost/currency/unit-of-measure/price-timestamp columns
present, both `supplier_links.quantity_per`/`is_primary_source` columns
present, `reassign_primary_source()` RPC exists, all 3 partial unique primary-
source indexes present, data intact (3 suppliers, 71 supplier_products, 272
supplier_links). This session's uncommitted work (the RPC, the atomic-swap
refactor in `supplier-link-manager.tsx`, delete-confirmation warnings) was
committed as **`5f5befd`** ("fix(suppliers): make primary-source switching
atomic", 5 files) and deployed via `vercel --prod` — deployment
`dpl_9HQ9jTxd7AVtMrhnekABuT4b7eTD`, READY, aliased to
https://finesse-quote-portal.vercel.app. Production build compiled
`/admin/suppliers` clean, TypeScript passed. Verified reachable post-deploy:
`/admin/suppliers` 200→redirect to `/auth/login` (route exists, admin-gated),
`/` 200, an unknown route 404.

Also confirmed via a live query that both `kramnoham@gmail.com` and
`mahon627@gmail.com` are `administrator` role (2 admins total) — resolves the
open question from the entry below about whether Mark's account actually had
admin access. It did; the module just hadn't been deployed yet. That's the
root cause of the earlier "can't see Suppliers" confusion, not a permissions
gap.

Still open, unchanged: nothing pushed to `origin/main` (local `main` is at
`5f5befd`, ahead of GitHub — blocked on rotating the 2 GitHub PATs); the
design decision on whether supplier cost should ever feed customer-facing
quote pricing is still Mark's to make — `quote-engine.ts` untouched, supplier
cost remains reference/reporting only.

### 2026-07-17 — Supplier Administration module built (migration 00022 + `/admin/suppliers` UI, code-complete, NOT applied/committed)

Diagnosed the gap first: the supplier layer added in migration 00021
(`suppliers`/`supplier_products`/`supplier_links`, populated with Vertilux/Loman/
Mitjavila) had **zero application UI** — no admin screen read or wrote those
tables — and `supplier_products` had no cost/price column at all. Mark/Mike had
no way to view supplier products, allocate them to the sales structure, or store
supplier unit costs. Mark approved the "Full module" scope.

**Migration `00022_supplier_cost_and_allocation.sql` — written, NOT applied**
(blocked on the expired Supabase access token). Adds: `supplier_products.cost_price
numeric(10,4)` + `currency` + `unit_of_measure` + `price_updated_at` (trigger-
stamped); `supplier_links.quantity_per` + `is_primary_source` + `updated_at`;
three partial unique indexes enforcing one `is_primary_source` per
`blind_style_id`/`blind_colour_id`/`awning_product_id` (with a backfill demotion
pass + a `DO`-block assertion); and a `security definer` RPC
`public.reassign_primary_source(old_id, new_id)` that atomically demotes/promotes
primary source, gated to administrators via `get_user_role()`. No
`supplier_product_prices` history table — deferred as overkill for now.

**App layer** (typecheck + lint clean; **not committed, not deployed**): new
route `/admin/suppliers` + components `supplier-manager`, `supplier-product-manager`
(inline-editable cost prices), `supplier-link-manager` (allocation, uses the RPC
for atomic primary-source switching), `supplier-target-picker` (cascading Type →
Opacity → Style → Colour / Awning), `supplier-allocation-lookup` (reverse
style-centric view); new `src/lib/supplier-links.ts`. `src/components/layout/
sidebar.tsx` gets a "Suppliers" nav item (Truck icon, between Blind Management
and Pricing, administrator-only). `blind-style-editor.tsx` +
`blind-hierarchy-manager.tsx` + `/admin/catalog/page.tsx` get a **read-only**
"Reference Supplier Cost (Admin Only)" line on the style editor (primary-source
supplier cost × `quantity_per`), explicitly labelled as never feeding customer
quotes. `quote-engine.ts` deliberately untouched — supplier cost is
reference/reporting only this pass.

Reviewed at 8.5/10; security/data-boundary confirmed (supplier identity + cost
stay staff-only, admin routes server-gated). One Important finding — non-atomic
primary-source switching — fixed via the `reassign_primary_source` RPC above.

**Design decision (2026-07-17)**: supplier cost is decoupled from customer quote
pricing by choice this pass — it's reference/reporting data only. Wiring
supplier cost into customer-facing pricing (margin checks, cost×markup
suggestions) is a separate, explicit decision Mark has not yet made. Rules out
silently blending procurement cost into quote math until he decides.

**Correction to my own diagnosis this session**: the change-log entry immediately
above reads as a from-scratch build, but the base module (migration 00022 +
`/admin/suppliers` UI) was in fact **already built and committed on 2026-07-16
(`7e1472e`)** — verified against git, not the DEVLOG. A stale working-tree DEVLOG
(Dropbox regression) omitted `7e1472e`, causing the mis-diagnosis. Net of THIS
session vs `7e1472e` (all uncommitted): only the `reassign_primary_source` RPC in
00022, the atomic-swap refactor in `supplier-link-manager.tsx`, and delete-confirm
warnings in the supplier / product managers. 00022 remains unapplied; nothing new
deployed. The 2026-07-16 entry below is accurate and was NOT wrong about being
committed.

### 2026-07-16 — Supplier cost capture + allocation (migration 00022, committed `7e1472e`, ⚠ NOT APPLIED)

Follow-on to 00021. Adds procurement-cost data + costing-grade allocation to the
supplier layer, plus an admin Suppliers UI. Schema: `supplier_products` gains
`cost_price`/`currency`/`unit_of_measure`/`price_updated_at`; `supplier_links`
gains `quantity_per` + `is_primary_source`. New: `/admin/suppliers` page +
supplier manager/link/product/target-picker/allocation-lookup components +
`src/lib/supplier-links.ts`; sidebar gains a "Suppliers" nav item; `database.ts`
extended. **Explicitly out of scope**: wiring supplier `cost_price` into the
customer-facing quote engine — the `PricedComponent` contract (`quote-engine.ts`)
still reads only `blind_style_components`/`components` (the deliberate
sales-price / procurement-cost separation since 00019).

### 2026-07-16 — Supplier catalogue batch shipped + Supabase API-key rotation

**Batch ship.** The 2026-07-16 supplier-catalogue batch (scrape Vertilux/Loman/
Mitjavila into OUR hierarchy → 44 styles / 222 colours, staff-only supplier
layer, rebuilt Style Gallery with Type→Opacity filters + search + per-type
feature banners, public teaser landing page) was verified and shipped. Migration
`00021` was already applied to live Supabase (not re-applied). Verified: eslint
clean, 41/41 vitest, production build green, `/` + `/gallery` smoke-tested
against live data, and a brand-leak scan confirming Vertilux/Loman/Mitjavila
appear only in `migration 00021` + `resources/supplier-scrapes/` (never
client-facing). Committed as **`e199d6f`** (one commit, per Mark — also folded in
password-recovery hardening that shared the working tree: recovery-amr middleware
gate, OAuth callback error surfacing, `scripts/gen-recovery-link.mjs`). The UX
audit `.docx` was intentionally left untracked. Deployed to production via
`vercel --prod` (deployment `73ly5nuiq` and, earlier, `atunn2xy1`). **Not pushed
to `origin/main`** — local `main` is ahead of GitHub.

**API-key rotation.** Vercel flagged `SUPABASE_SERVICE_ROLE_KEY` as
readable-plaintext ("Needs Attention"). The live keys were legacy `eyJ…` JWTs
(anon + service_role), which can't be individually revoked. Migrated to the new
key system: `.env.local` + Vercel updated to `sb_publishable_` / `sb_secret_`
(same var names, marked Sensitive in Vercel), verified locally (admin `listUsers`
+ publishable login/RLS) and in prod (new publishable key confirmed baked into
the client bundle; `/` + `/auth/login` 200), then **disabled the legacy anon +
service_role keys** — invalidating the previously-exposed service_role JWT.
`info.md` redacted. `@supabase/supabase-js ^2.103.0` supports the new keys, so no
code changes were needed. DB password + PAT rotations remain open (see §7).

### 2026-07-08 — Self-service password reset (deployed, `dfe6934`)

Mark got locked out (no reset feature existed). Immediate fix: admin-API password reset to the standard temp password. Feature: "Forgot password?" on login → /auth/forgot-password (neutral response, no account enumeration; Supabase built-in mailer — rate-limited on the current plan) → emailed link → /auth/reset-password (PKCE code exchange with implicit-flow fallback, expired-link state) → updateUser + redirect to /dashboard. ⚠ Requires `https://finesse-quote-portal.vercel.app/auth/reset-password` in Supabase Auth → URL Configuration → Redirect URLs (dashboard-only setting) — untestable until added. Note: reset link must be opened in the same browser the request was made from (PKCE verifier cookie).

### 2026-07-08 — Batch 8: hierarchy-as-product, quantities, 16-stage workflow, select sweep, demo reseed

Client directives from the second QA round: Blind Management IS the product (no separate Product Management / Make & Model), wholesale needs room/window quantity multipliers, the 16-stage order workflow must show on the jobs board + admin dashboard, the Add-Property customer picker showed a UUID, and demo data should be rebuilt on the new structure.

**Pricing move (migration 00019, applied).** New `blind_style_components` (same shape as `components`; engine consumes either via the structural `PricedComponent` type). Every style seeded from the Luxaflex Roller donor blueprint — **placeholder pricing, Mike adjusts per style** in Blind Management's new per-style editor (photo upload + component CRUD, audit-logged). Configurator lost the Make/Model select; hardware size rules rekey off the Type name; gallery cards are now Styles; admin blind Products page deleted (Awning Products stays); quote staleness now watches `blind_style_components.updated_at` too. `products`/`components` tables kept as legacy.

**Quantities (00019).** `rooms.quantity` + `windows.quantity` (default 1) with tooltips and ×N badges; effective units = room × window quantity; labour/installation scale per unit; snapshots on quote_line_items (`quantity`/`room_quantity`/`window_quantity`); quote detail + PDF show ×N. Engine suite extended to 41 tests.

**16-stage workflow (migration 00020, applied).** `jobs.workflow_stage` (text + CHECK, 16 snake_case stages, order lives in `WORKFLOW_STAGES`), `stage_history` jsonb, nullable `quote_id`/`property_id` + new `customer_id` so pre-quote orders (stages 1–5) exist — staff "New Order" dialog creates them at request_received. Board groups by stage (collapsible, `?stage=` deep links); job detail gets the 16-stage stepper + history; accept-quote starts jobs at job_approved; send-quote best-effort advances/links a matching pre-quote job. Admin dashboard's pipeline strip replaced by the 16-stage workflow strip. RLS on jobs/job_assignments rebuilt (drop-all-then-recreate; verified against 00012 — customer read parity kept, incl. assignments on own jobs). Old `status` column retained (calendar still reads it — flagged for cleanup).

**Select-label sweep (the recurring UUID bug, hopefully final).** Every `SelectValue` in the repo audited; explicit render-function children added to all value≠label selects: property-list customer picker (the screenshotted bug) + customer-type, window mount type, room standard-list ("Other…" sentinel), blind-style-editor unit selects, user-manager role filter + editor, audit-log action filter, quotes status filter. Already-safe: configurator hierarchy selects, jobs/gallery/new-order selects (built with the pattern).

**Demo reseed (`scripts/seed-demo.ts` rewritten + run).** All old properties/quotes/jobs wiped (client-approved), reseeded on the new structure at runtime-resolved hierarchy names: Maraval Residence (retail, 6 varied windows incl. 110″ VTX 30 roller, 130″ motorized Neolux, undecided mount, description, exclusion) and Price Plaza Hotel (wholesale: Standard King ×40, Junior Suite ×8, Lobby with 150″ motorized roller); 13 engine-accurate quotes across the lifecycle; 11 jobs spanning the 16 stages incl. 2 pre-quote orders; 2 assignments for Ravi.

Session note: a Dropbox cloud-provider outage mid-session stalled one build and killed another (recovered after a Dropbox restart; quirks memory updated). Verified clean: tsc, 41/41 tests, lint.

### 2026-07-07 — TBD placeholders (migration 00018, applied)

Per Mark: every TBD hierarchy node got one clearly-temporary child so the full chain is testable before Mike's data entry — `T_Standard` style under each of the 10 style-less opacities (Sliding Panel ×4, Roller Shade ×4, Neolux ×2) and `T_White` (#F5F5F5) colour under all 22 styles. `T_` prefix marks them for rename/replace in Blind Management; sort_order 999 keeps them below real entries; leftovers auditable via `name like 'T\_%'`. Applied live and verified (22 styles / 22 colours, none orphaned). DB-only — no redeploy needed.

### 2026-07-07 — Batch 7 hotfix after Mark's production QA

Three fixes, redeployed same evening: (1) the configurator's Opacity/Style/Valance selects displayed raw UUIDs — the Base UI `SelectValue` label-registry pitfall again; the three selects added after Type/Product were missing the explicit render-function child that maps id → name (all five now use it). Save path was never affected — it always resolved names before writing, and a live-DB scan confirmed zero UUID-contaminated `windows` rows. (2) Opacity/Valance row overlapped at narrow widths — unqualified `grid-cols-2` + `w-fit` select triggers blown wide by the UUID text; now `grid-cols-1 sm:grid-cols-2` with `w-full` triggers. (3) Admin dashboard KPI cards were uneven — `StatCard` only rendered the sub-label when present; the slot now always renders (nbsp placeholder), cards stretch `h-full`, and the two money KPIs use a new `formatTtd()` helper (`src/lib/format.ts`, thousands separators — other bare `toFixed()` TTD call sites left as-is, candidates for a later sweep).

Also from this QA round: Mark expected the left-hand blind-selection filter on the configurator — that's Batch 9 (multi-select filter + multi-option quotes with price ranges) and depends on linking priced products to the new hierarchy, which itself waits on Mike's TBD style/colour entry. Explicitly communicated as sequenced, not missed.

### 2026-07-07 — Batch 7: blind option hierarchy (Type → Opacity → Style → Colour + Valance)

Implements `..\resources\2026-07-07_blind-hierarchy-spec.md` (client-approved same day) — replaces the flat, independent `shade_types`/`styles`/`colours` lookup tables with the client's real dependent structure. Migration `00017_blind_hierarchy.sql` (**written, NOT applied**):

- Five new tables — `blind_types`, `blind_opacities` (FK type_id), `blind_styles` (FK opacity_id), `blind_colours` (FK style_id, + hex_code), `blind_valances` (FK type_id, parallel to the Opacity→Style→Colour chain) — same RLS pattern as the old lookup tables (read-authenticated / write-admin), indexed on every FK, `set_updated_at` trigger. Seeded exactly per the spec's table (6 types / 15 opacities / 12 styles / 0 colours / 14 valances — the spec's prose says "13" valances but its own table lists 14; the table is authoritative, documented in a SQL comment), counts asserted in a `DO` block that raises (rolling back the whole migration) on any mismatch. Nothing seeded under TBD nodes — Sliding Panel/Roller Shade/Neolux styles and every colour are for Mike to enter via Blind Management.
- Old tables renamed (never dropped): `shade_types`→`legacy_shade_types`, `styles`→`legacy_styles`, `colours`→`legacy_colours`, RLS policies renamed alongside, behaviour unchanged.
- New snapshot columns: `windows.opacity/valance`, `quote_line_items.opacity/valance`. `windows.shade_type/style/colour` keep their column names but a **semantic change** going forward: new windows store the hierarchy Type/Style/Colour *names* there (not the old flat vocabulary); historical values on existing rows are untouched. `products.shade_types/styles/colours` and product-to-hierarchy linking are explicitly untouched/deferred (spec open question 2).

App layer: `src/types/database.ts` gained `BlindType/Opacity/Style/Colour/Valance` row types and `opacity`/`valance` on `Window`/`QuoteLineItem`. New `src/lib/blind-hierarchy.ts` — `fetchBlindHierarchy()` (5 parallel selects, sort_order-then-name ordered, `activeOnly` toggle) plus `opacitiesForType`/`stylesForOpacity`/`coloursForStyle`/`valancesForType` and `findXByName` resolvers (used to walk a window's stored name strings back to hierarchy ids on the configurator's initial load).

`WindowConfigurator` rewritten: cascading Type → Opacity → Style → Colour selects (ids in local state, not names, since the same name can recur under different parents) plus a Valance/Finisher select sourced by Type, each child resetting when its parent changes; empty child lists show a muted "options pending — add in Blind Management" hint and don't block save (nullable). A level is only save-required when its parent actually has options — TBD levels are skippable. The product (make/model) select now sits below the hierarchy pickers and filters to the chosen Type's tagged products when a mapping exists (`BLIND_TYPE_NAME_TO_PRODUCT_SLUG` in constants.ts — currently only Roller Shade/Neolux Shade have tagged products); other Types show the full catalog with a "mapping pending" note. Gallery-style-query hints (legacy free-text shade type/style/colour) are resolved against the hierarchy by exact name match and silently dropped on a miss. Quote detail, PDF, the jobs detail page, and the room window-list cards all surface Opacity and Valance alongside Style/Colour where present.

Admin: `catalog-manager.tsx` deleted, replaced by `blind-hierarchy-manager.tsx` (drill-down selection state) + `blind-hierarchy-level.tsx` (generic reusable CRUD list — add/rename/deactivate/delete/reorder, audit-logged, used for all 5 levels) on `/admin/catalog` ("Blind Management"). Admin Product Manager and Awning Product Manager re-pointed at the renamed `legacy_*` tables (unchanged behaviour otherwise; Product Manager's shade-type/style/colour tagging is now labelled legacy/reference-only). Gallery filter panel replaced: the old Shade Type/Style/Colour selects are gone, replaced by a single Blind Type filter (`products.blind_type` slug → hierarchy Type name, with an "Other / Unmapped" bucket for untagged products and an "Awning" bucket) — colour swatch chips on cards are unchanged.

Every old-vocabulary read-site was grepped and migrated (`from('shade_types'|'styles'|'colours')` — none remain; `.shade_types/.styles/.colours` on `products` intentionally untouched). `npm test` (31/31), `npx tsc --noEmit`, and `npm run lint` all clean.

### 2026-07-07 — Width-based hardware support rules (Roller Shade & Neolux)

Mike's posted-note thresholds arrived (`..\resources\converted_handwritten_table.xlsx`): tube diameter + control type by blind width, motorized above 120″, 228″ fabrication max. Implemented as **migration `00016_hardware_size_rules.sql` (written, NOT applied — apply together with 00015)**:

- `hardware_size_rules` table (RLS read-authenticated / write-admin), seeded with the 6 tiers × roller_shade/neolux: ≤84″ → 1 1/4″/VTX 15; 85–108 → 1 1/2″/VTX 20; 109–120 → 1 3/4″/VTX 30; 121–144 → 2″/Motor; 145–180 → 2 1/2″/Motor; 181–228 → 3 1/4″/Motor. Rows carry nullable cost overrides (`tube_usd_per_inch_override`, `control_fixed_usd`) — **seeded null, so quotes are cost-neutral until Mike prices the tiers**.
- `products.blind_type` (interim tag ahead of the Batch 7 taxonomy): 5 roller-named seed products tagged `roller_shade` (incl. one judgment call, Graber Commercial Blackout); cellular/sheer/slat products left null for admin tagging.
- `quote_line_items.hardware_spec` jsonb snapshot (spec frozen at quote time so rule edits don't drift history); `pricing_config.max_window_width_in` raised 180 → 228.

Engine: `resolveHardwareSpec()` + optional `hardwareRule` param on `calculateLineItem` (backward-compatible; overrides apply only when non-null). Matching is gap-proof: smallest tier whose max covers the width — fractional widths (1/8″ measurements, e.g. 84.5″) roll UP to the heavier tier rather than falling between whole-inch ranges (bug caught in review, regression-tested). Test suite now 31 passing.

UI: configurator shows a live "Support hardware" line (tube · control), amber motorized callout, and a save-blocking error past 228″; quote detail shows a muted spec note + Motorized badge; PDF gets a "(Motorized)" suffix. Admin Blind Management gained a Hardware Size Rules editor (inline CRUD, audit-logged) and a Blind Type select on the product form (product-manager also gained audit logging it was missing).

### 2026-07-07 — Batch 6: client-feedback quick wins (Mike demo review)

Three parallel workstreams off the client feedback (full triage: `..\outputs\2026-07-07_finesse-client-feedback-backlog.md`).

**WS-A — labels, nav, branding, cost visibility.** Sidebar footer and admin user-manager now render roles via the shared `ROLE_LABELS` map (no more `retail_customer` underscores anywhere client-facing). New shared `PageBreadcrumb` (`src/components/layout/page-breadcrumb.tsx`, on the shadcn breadcrumb primitive) wired into property → room → window and both quotes pages; trail includes the property owner's name for staff viewers; old "Back to X" links removed as redundant. Admin "Catalog" relabelled **Blind Management** (route path `/admin/catalog` unchanged; "Catalogue" is reserved for the future supplier-brochure library — Batch 12). Favicon replaced with the Finesse logo (`src/app/icon.png`, App Router file convention; `favicon.ico` deleted). Landing page: `Banner.jpg` hero background + "Recent Installations" gallery strip from 5 marketing photos (`public/images/marketing/`). USD component cost breakdown in the window configurator tightened from staff to **administrator-only** — salesmen now see marked-up TTD retail pricing like customers.

**WS-B — room/window forms + migration 00015 (NOT applied).** Room name is now a Select of `STANDARD_ROOMS` (12 options) with "Other…" → free text (stored in the same `rooms.name`). Window dialog gained the company-policy callout (number windows from left-most, clockwise), an optional `description` field (new nullable column in 00015, shown on cards and configurator), and measurement guidance (nearest 1/8″; width 20–98″ standard / >98″ oversized; height 20–120″) — dimension input `step` tightened to 0.125; the pricing_config-driven zod limits from WS1 untouched. Mount type: new `undecided` enum value + form default flipped to `outside`; `WindowDiagram` renders undecided as outside geometry with an amber "Mount TBD" caption; quote engine needs no change (only `'inside'` is special-cased). Root layout gained `TooltipProvider`; info-icon tooltips on the new fields.

**WS-C — gallery "Quote from style" rebuilt.** The feature was a stub (linked to `/properties?new=true`, dropped the selection). Now: new `QuoteFromStyleDialog` (gallery-owned; picks customer → shows that customer's **existing properties** or creates new) and `src/lib/gallery-style-query.ts` carrying the chosen style via query params through property → room → window → configurator, where it pre-selects product/style/colour as a fallback only (never overwrites an already-configured window). The customer-shows-as-a-number-after-Back bug was Base UI's `Select.Value` label registry — fixed with an explicit render-function child, same as the configurator's own selects. Non-gallery flow verified unchanged (all new params default to empty).

Combined `npx tsc --noEmit` + eslint clean. Nothing committed/deployed; 00015 pending apply.

### 2026-07-07 — Batch 5: design doc v2 (WS1–WS4) + demo data

**WS1 — Cleanup & hardening.** Migration `00009`: customers lost all direct INSERT/UPDATE on `quotes`/`quote_line_items` (server-authoritative money); salesmen gained profile reads (`profiles_select_staff`, fixing the Batch-3 customer picker for salesmen); legacy `default_markup_pct`/`reseller_discount_pct` dropped. Quote notes now save through `updateQuoteNotesAction` (whitelists the `notes` column). PDF route renders the quote **owner's** identity (not the viewer's) and wraps rendering in try/catch. Pricing editor rewritten on react-hook-form + `pricingConfigSchema` (no NaN can reach the DB). Window dimension limits from `pricing_config` enforced in the window form (zod) and server-side in `/api/quotes/calculate`. The three divergent estimate loops replaced by `src/lib/estimates.ts` — card estimates now match generated quotes to the cent and use the property owner's markup tier; all card estimates display TTD only (the room/window USD leaks are gone). `expires_at` honours `quote_validity_days`. Vitest added (`npm test`) with a 14-test engine suite locking the canonical formulas. Lint clean; `tsconfig.tsbuildinfo` deleted; `catalog-manager` static-component fix; `window-list` unused prop removed.

**WS2 — Role dashboards + mobile shell.** `/dashboard` renders by role: Customer (hero cards, awaiting-response panel, gallery CTA), Sales (pipeline strip by status with tap-through to filtered quote lists, quick actions, needs-attention, upcoming installs), Admin (KPI row, pipeline by rep, jobs summary, activity feed, what-if pricing sliders from the old prototype). All authed layouts share `ShellLayout`/`AppShell`: fixed sidebar ≥lg, hamburger + sheet drawer below. Login/callback/middleware redirects now land on `/dashboard`; the old `next.config.ts` 308s removed.

**WS3 — Style gallery & visual quoting.** Migration `00010`: `image_url` on products/awning_products, `hex_code` on colours, public `product-images` storage bucket (admin-only write). Migration `00013`: catalog enriched from the old build — 6 new blind products with full component blueprints, 2 Sunbrella awnings, catalog vocabulary + swatch hexes. `/gallery`: filterable grid (shade type/style/colour) with images, swatches, and "from ~TTD" pricing for a 36×48 window computed through the real engine (customer-tier aware). Configurator upgraded: colour swatch chips, live TTD estimate per keystroke, derived-dimension badges, parametric SVG `WindowDiagram` (inside/outside mount visualised) reused on quote detail and job detail; the USD component breakdown is staff-only. Admin product managers gained photo upload.

**WS4 — Quote lifecycle + jobs.** Migrations `00011`/`00012`: `quote_status` extended (draft/sent/accepted/declined; legacy `final` data-migrated to `sent`), lifecycle stamp columns, `jobs` + `job_assignments` tables with staff-CRUD/customer-read RLS. Transitions are server actions only (`sendQuoteAction`, `acceptQuoteAction`, `declineQuoteAction`) — every transition audit-logged; 'expired' derived at read time from `expires_at`. Staff-created quotes start as `draft` with a Send Quote + Copy Link step; customer self-generated quotes go straight to `sent`. **Accepting a quote auto-creates its job** (`pending`). `/jobs`: status-grouped board with per-card status dropdown + assignee filter; `/jobs/[id]`: quote link, customer info, window list with diagrams, status stepper, install date + notes, assignee management; `/jobs/calendar`: CSS-grid week view. Quote detail and list show colour-coded status chips; customers get Accept/Decline on sent quotes.

**Fixes & housekeeping.** Live DB was missing local migration `00005` (`quote_line_items.product_id` NOT NULL would have broken awning/zero-cost quotes) — applied. `00014` pins `search_path` on `set_updated_at`/`get_user_role` per Supabase advisors. `middleware.ts` unused-var warning fixed (cookie bridge behaviour unchanged).

**Demo data** (`scripts/seed-demo.ts`, idempotent): demo salesman Ravi Persad, retail customer Anita Ramkissoon (Maraval residence, 3 rooms, 6 windows incl. an awning and a zero-cost "future opportunity" window), wholesale customer Dave Boodoo (Price Plaza office fit-out, 3 rooms, 6 windows). Nine engine-accurate quotes across every lifecycle status and four jobs (pending / fabricate / install scheduled this week / complete last week) with assignments — the pipeline, board, and calendar all demo convincingly.

## Change log (pre-Batch 5)

Archived to `DEVLOG-archive.md` (Batches 1–3, 2026-04-11) to keep this file
under ~400 lines.

## 7. Open questions / waiting on

- **Supplier Administration module (2026-07-17)**: ~~apply migration 00022 + deploy~~ ✅ done — 00022 applied to production, module committed (`5f5befd`) and deployed, live at `/admin/suppliers`. Two items remain: (1) **push to GitHub** — local `main` is ahead of `origin/main`, blocked on rotating the 2 GitHub PATs; (2) **decision pending**: should supplier cost feed customer-facing quote pricing (margin checks, cost×markup suggestions)? Not yet decided — module currently keeps supplier cost as reference/reporting only.
- **From Mike (2026-07-07 review)**: (1) ~~hardware-threshold posted note~~ ✅ received & implemented (migration 00016); (2) ~~motorization threshold~~ ✅ resolved — motor above 120″ blind width; (3) **pricing for the hardware tiers** (USD per tube size per inch; fixed cost per VTX 15/20/30 and motor) — rules are cost-neutral until supplied; (4) which products are Roller Shade vs Neolux (interim `blind_type` tags on 5 seed products are our guesses — admin-editable in Admin > Products); (5) style + colour matrices for Sliding Panel, Roller Shade, Neolux (and colours per style everywhere) — **no longer blocks dev work**, Batch 7 shipped the schema/UI for this and Mike can hand-enter the TBD ranges directly in Admin > Blind Management once 00017 is applied; (6) glossary verification (draft v2 in `..\outputs\`); (7) deposit rules + invoicing approach for the Batch 11 workflow; (8) whether Horizontal's "Yes/No" Valance is a literal flag or shorthand for a finisher to be named later (seeded as two Valance option rows per the spec's stated assumption — flag if wrong).
- **Secrets hygiene** (updated 2026-07-16): Supabase project API keys migrated to the new key system — legacy `anon` + `service_role` JWTs **DISABLED**; app now uses `sb_publishable_` (browser) + `sb_secret_` (server) via the SAME env var names (`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`). Secret key stored in `.env.local` + Vercel (marked **Sensitive**); `..\info.md` redacted (live secrets removed). **Still to rotate**: the Supabase Postgres **DB password** (was in `info.md`, still live — used only for direct migration connections, not app runtime).
- **Pending token rotations** (see `~/.claude/projects/C--Projects-Claude-AddOns/memory/pending_token_rotations.md`): the Supabase account PAT was rotated 2026-07-17 (new PAT, `supabase-finesse` MCP server added pinned to `vcnakuehawpkzzuzkixb`, verified working). Still open — Supabase DB password and two GitHub PATs exposed in chat in prior sessions. GitHub MCP/push is blocked until those rotate. The project API-key rotation above is DONE.
- **Vercel MCP auth**: user confirmed Vercel deployment but hasn't confirmed whether the Vercel MCP is authed for this account. Ask with `/mcp` before any deploy-related work.
- **Retail / wholesale markup defaults**: what are the actual numbers? Placeholder 40% / 20% until user confirms.
- **Commit cadence**: user hasn't specified whether they want a commit per batch or per logical change within a batch. Default: one commit per completed batch, conventional-commits format, staged by Claude but committed by user (never auto-commit without explicit request).
