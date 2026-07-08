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
- Batch 7 (2026-07-07) — blind option hierarchy rework (Type → Opacity → Style → Colour, plus per-Type Valance/Finisher), implemented per the client-approved spec. **Migrations 00015 + 00016 + 00017 all APPLIED to live Supabase and the app DEPLOYED to production** (https://finesse-quote-portal.vercel.app, Vercel CLI, 2026-07-07 evening). Live seed verified: 6 types / 15 opacities / 12 styles / 0 colours / 14 valances / 12 hardware rules / max width 228″. **Still uncommitted** — Mark has not asked for a commit yet; the deployed build came from the working tree. Details in the change log.
- Batch 6 (2026-07-07) — client-feedback quick wins from the Mike demo review, implemented and deployed with Batch 7 above. Details in the change log. The full feedback triage lives at `..\outputs\2026-07-07_finesse-client-feedback-backlog.md`; the glossary draft for Mike at `..\outputs\2026-07-07_finesse-glossary-draft.md` / `.docx`.
- Batch 5 (2026-07-07) — design doc v2 implemented in full: WS1 cleanup & hardening, WS2 role dashboards + mobile shell, WS3 style gallery & visual quoting, WS4 quote lifecycle + jobs & scheduling. Migrations 00009–00014 applied to live Supabase (plus the previously-missed 00005 nullable product_id fix). Demo dataset seeded for client review (`scripts/seed-demo.ts`). Details in the change log.
- Batch 1 — Rename `/dashboard` → `/properties` (routes, nav, redirects, links). Strip exchange-rate / duty / shipping / labour rows from quote detail page and PDF. Convert Property list cards and Grand Total to TTD display.
- Batch 2 — Schema migrations applied to the live Supabase project (`vcnakuehawpkzzuzkixb`). TypeScript types, admin managers, register page, and quote-engine import updated to match. Salesman reseller-discount logic removed. Pricing editor gained retail / wholesale markup fields. Audit-log UI relabelled to "Actor" / "Activity".
- Batch 3 — Admin/salesman customer-creation flow. New `src/app/properties/actions.ts` with two server actions (`createCustomerAction` via service_role, `createPropertyAction` via authenticated server client). `PropertyList` rewritten as a multi-step dialog with customer picker + inline new-customer form for staff. Add-Property button unhidden for everyone (staff routes through picker; customers route direct to property form). Properties page server component fetches the customer list when staff is viewing.

**In progress**: (none — awaiting Mark's QA of Batch 6, then apply migration 00015, commit, deploy)

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

Batch 8 (2026-07-08: hierarchy-as-product + quantities + 16-stage workflow + select sweep + demo reseed — see change log) is applied (migrations 00019 + 00020), demo-reseeded, and deployed to https://finesse-quote-portal.vercel.app. Blind pricing now lives per-style in Blind Management with **placeholder donor pricing** — Mike must set real per-style component prices there. Awaiting Mark's QA of this round. Earlier context: Batch 7 shipped 2026-07-07 as `83e78f1`; migrations 00015–00018 applied the same day.

Batch 7 specifics to QA (now live): the six seeded Types only have real Opacity/Style data for Horizontal, Dune, and Cellular — Sliding Panel, Roller Shade, and Neolux Shade show "options pending" past Opacity (no Styles seeded) and every Style has zero Colours seeded (all TBD per the source doc). Mike enters all of that through **Admin → Blind Management**'s new drill-down editor (Type → its Opacities/Valances → Opacity's Styles → Style's Colours), which replaced the flat `catalog-manager.tsx`. The old `shade_types`/`styles`/`colours` tables are renamed to `legacy_shade_types`/`legacy_styles`/`legacy_colours` (never dropped) — `products.shade_types/styles/colours` still read from them for the admin Product Manager's make/model tagging (now labelled legacy/reference-only in that form), since products aren't linked to the new hierarchy yet.

Next session should: (a) get Mark's QA verdict on Batch 6 + 7 together (esp. the rebuilt gallery quote-from-style flow, the landing-page marketing imagery, and the new Blind Management drill-down), (b) send Mike the glossary draft (`..\outputs\2026-07-07_finesse-glossary-draft.docx`) for verification, (c) get Mike started entering the TBD Styles/Colours in Blind Management, (d) pick up Batch 8 (size thresholds / hardware factors) once Mark green-lights.

Waiting on the user for: Batch 6 + 7 QA on production (Mark will check the next deployment for the KPI-card + configurator fixes — already live); decision on building the Blind Type-only filter panel now vs waiting for product↔hierarchy linkage (Batch 9); Batch 8–12 prioritisation; Mike's hardware-threshold posted note + motorization threshold (received/implemented) + hardware-tier pricing (still TBD) + the TBD Style/Colour data for Sliding Panel/Roller Shade/Neolux Shade and every Colour (Mike enters via Blind Management once live); markup/formula confirmation; token rotation (two GitHub PATs + one Supabase PAT, still unrotated). Demo logins unchanged (`Finesse4Blinds!`; `demo.sales@` / `demo.retail@` / `demo.wholesale@finessett.com`); demo reseed via `npx tsx scripts/seed-demo.ts`.

## 6. Change log

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

### 2026-04-11 — Batch 3: admin/salesman customer-creation flow

Created `src/app/properties/actions.ts` with two server actions:
- `createCustomerAction(input)` — staff-only. Authenticates the caller via the cookie-scoped server client, verifies salesman/administrator role, uses the service-role admin client to call `auth.admin.createUser({ email_confirm: true, password: 'Finesse4Blinds!', user_metadata: { first_name, last_name, contact_number, role } })`. The `handle_new_user` trigger creates the profile row from the metadata; the action re-reads the profile via the admin client (bypasses RLS) to confirm. If the profile read fails, the orphaned auth user is deleted so we don't pollute `auth.users`. Writes an audit_logs entry attributing the creation to the staff member, then revalidates `/properties` and `/admin/users`.
- `createPropertyAction(input)` — open to anyone authenticated. For staff, creates a property for any customer (`user_id` set to the picked customer's id). For customers, only for themselves (enforced server-side, not trusting client input). Always sets `created_by` to the authenticated caller. Staff-initiated creations are audit-logged; customer self-creation is not (high-volume, low-signal). Revalidates `/properties`.

Rewrote `src/components/properties/property-list.tsx` as a multi-step dialog:
- State machine via a `DialogMode` union: `closed | new-pick-customer | new-create-customer | new-property | edit-property`
- Staff path: `?new=true` lands on `new-pick-customer` → either pick an existing customer from a `Select` or click "Create New Customer" → fills a compact 5-field form (first name, last name, email, contact, retail/wholesale) → submit calls `createCustomerAction` → toast confirms temp password → auto-advances to `new-property` with the new customer pre-selected → submit calls `createPropertyAction`.
- Customer path: `?new=true` lands directly on `new-property` with `selectedCustomerId = userId`. Same final submit flow.
- Edit path unchanged (direct browser-client update via RLS).
- Delete path unchanged (direct browser-client delete via RLS).
- The property-list card layout, filtering, and TTD display are unchanged from Batch 1.

Updated `src/app/properties/page.tsx`:
- Fetches the list of retail + wholesale customers when the viewer is staff, ordered by last_name. Passes them to `PropertyList` as a `customers` prop.
- Passes a new `isStaff` prop derived from the role helper `isStaffRole()` (added in Batch 2's types file).
- Removed the `!isAdmin` gate around the Add Property button. Everyone sees it; staff get the picker, customers go straight to the form. **This closes the original "missing Add Property button on Dashboard" bug that started this entire session.**

Security notes: the server action verifies the caller's role from the profiles table rather than trusting any client-provided role. The service-role key is only used for the two operations that genuinely require it (creating an auth user and post-creation profile verification). All other reads/writes go through the cookie-scoped server client and are protected by the RLS policies added in Batch 2. Type-check and lint both clean on all Batch 3 files.

### 2026-04-11 — Batch 2: schema migration for customer types + staff model

Added two migration files:
- `00007_add_customer_type_enum_values.sql` — `alter type user_role add value` for `retail_customer` and `wholesale_customer`. Separate file because Postgres can't USE a new enum value in the same transaction that added it.
- `00008_customer_types_and_quote_enhancements.sql` — the bulk of the changes: backfill all existing `customer` profiles to `retail_customer`; update the `handle_new_user` trigger default; add `retail_markup_pct` (40 default) and `wholesale_markup_pct` (20 default) to `pricing_config`; add `created_by uuid not null references profiles(id)` to `properties` and `quotes` (backfilled from `user_id` first, then set NOT NULL); add `notes jsonb not null default '[]'` to `quotes`; add `excluded_components text[] not null default '{}'` to `windows`; rename `audit_logs.admin_user_id` to `actor_id`; rework RLS on `properties` / `rooms` / `windows` / `quotes` / `quote_line_items` / `audit_logs` so salesmen have the same access as administrators (separate `_staff` policies alongside the existing `_own` policies). Kept `default_markup_pct`, `reseller_discount_pct`, `duty_percent`, `shipping_fee_ttd`, `labor_cost_ttd`, and `exchange_rate` in the DB — Batch 4 will remove the unused ones and the Purchasing Module will use the rest.

TypeScript side: rewrote `src/types/database.ts` (new `UserRole` union, added `isStaffRole` / `isCustomerRole` helpers, added `QuoteNote` shape, added `created_by` / `notes` / `excluded_components` / `retail_markup_pct` / `wholesale_markup_pct` / `actor_id` fields). Updated `constants.ts` (new `USER_ROLES` array, new `ROLE_LABELS`, new `DEFAULT_TEMP_CUSTOMER_PASSWORD = 'Finesse4Blinds!'`). Simplified the public `registerSchema` to drop the role field entirely — self-registration always creates a retail customer now. Extended `pricingConfigSchema` with the two new markup rates. Updated the sidebar's `roles:` arrays. Rewrote the register page with the role picker removed. Updated `user-manager.tsx` throughout (role colors now 4 entries, counts collapse retail+wholesale into a single "Customers" stat, filter dropdown and edit dialog both offer all 4 roles, audit_logs insert now writes `actor_id`). Updated every `supabase.from('audit_logs').insert({ admin_user_id: ... })` call site to use `actor_id` (catalog-manager, awning-product-manager, pricing-editor, user-manager). Relabeled the audit-log viewer UI from "Admin" → "Actor" / "Activity". Updated the admin audit-logs page title to "Activity Log". Removed the unused `userRole` parameter from `calculateQuoteTotals` and deleted the salesman-specific reseller-discount branch (salesmen are staff, not a discounted customer tier). Updated the one call site in `src/app/api/quotes/calculate/route.ts` to match. Pricing editor form gained retail / wholesale markup fields at the top and moved the legacy `default_markup_pct` / `reseller_discount_pct` to the bottom marked as legacy. Duty / shipping relabeled "Purchasing only" to signal they're not in customer-facing quotes. Type-check clean; only pre-existing lint issues remain (unrelated to Batch 2).

### 2026-04-11 — Batch 1: rename + hide internal financial details

Renamed the `/dashboard` route to `/properties` throughout the app — nav label, logo link, all `<Link>`s, middleware `protectedPaths` and redirects, auth login/callback fallbacks, admin layout redirect, back links, and the new-property dialog query-string flow. Sidebar active-state logic was also tightened (the old guard excluded `/dashboard` from `startsWith` matching, which broke once nested routes like `/properties/[id]/rooms/...` became important).

Hid the rows the user called out as customer-inappropriate from the quote detail page and the PDF: exchange-rate row, duty row, shipping row, labour row, and the "Components Subtotal (USD)" / "+ Markup" / "Converted to TTD" rows of the grand-total breakdown. Kept the Installation row and the Reseller Discount row for now; both are covered by Batch 4's engine rewrite. The Property list cards now compute a rough TTD estimate (pre-markup, using `pricing_config.exchange_rate`) and label it "Est. Property Total". The staleness warning text was also scrubbed of "exchange rate / markup / duty" references.

Intentionally left for later: per-room table per-component USD breakdown columns (Cassette / Tube / Rail / ...), admin `/admin/pricing` editor (still shows all fields so future Purchasing Module has data), admin Add Property button (requires Batch 3's customer picker before it's safe to enable).

## 7. Open questions / waiting on

- **From Mike (2026-07-07 review)**: (1) ~~hardware-threshold posted note~~ ✅ received & implemented (migration 00016); (2) ~~motorization threshold~~ ✅ resolved — motor above 120″ blind width; (3) **pricing for the hardware tiers** (USD per tube size per inch; fixed cost per VTX 15/20/30 and motor) — rules are cost-neutral until supplied; (4) which products are Roller Shade vs Neolux (interim `blind_type` tags on 5 seed products are our guesses — admin-editable in Admin > Products); (5) style + colour matrices for Sliding Panel, Roller Shade, Neolux (and colours per style everywhere) — **no longer blocks dev work**, Batch 7 shipped the schema/UI for this and Mike can hand-enter the TBD ranges directly in Admin > Blind Management once 00017 is applied; (6) glossary verification (draft v2 in `..\outputs\`); (7) deposit rules + invoicing approach for the Batch 11 workflow; (8) whether Horizontal's "Yes/No" Valance is a literal flag or shorthand for a finisher to be named later (seeded as two Valance option rows per the spec's stated assumption — flag if wrong).
- **Secrets hygiene**: `..\info.md` (client folder, Dropbox-synced) holds the live Supabase DB password, secret key, and service-role key in plaintext — move to a secrets manager / `.env.local` and rotate.
- **Pending token rotations** (see `~/.claude/projects/C--Projects-Claude-AddOns/memory/pending_token_rotations.md`): two GitHub PATs and one Supabase PAT exposed in chat in prior sessions. User has NOT yet rotated them. Any MCP reconfig (Supabase MCP → Finesse project ref, GitHub MCP → new PAT) is blocked until rotation.
- **Vercel MCP auth**: user confirmed Vercel deployment but hasn't confirmed whether the Vercel MCP is authed for this account. Ask with `/mcp` before any deploy-related work.
- **Retail / wholesale markup defaults**: what are the actual numbers? Placeholder 40% / 20% until user confirms.
- **Commit cadence**: user hasn't specified whether they want a commit per batch or per logical change within a batch. Default: one commit per completed batch, conventional-commits format, staged by Claude but committed by user (never auto-commit without explicit request).
