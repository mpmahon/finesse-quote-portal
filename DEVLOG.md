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
- Batch 1 — Rename `/dashboard` → `/properties` (routes, nav, redirects, links). Strip exchange-rate / duty / shipping / labour rows from quote detail page and PDF. Convert Property list cards and Grand Total to TTD display.
- Batch 2 — Schema migrations applied to the live Supabase project (`vcnakuehawpkzzuzkixb`). TypeScript types, admin managers, register page, and quote-engine import updated to match. Salesman reseller-discount logic removed. Pricing editor gained retail / wholesale markup fields. Audit-log UI relabelled to "Actor" / "Activity".
- Batch 3 — Admin/salesman customer-creation flow. New `src/app/properties/actions.ts` with two server actions (`createCustomerAction` via service_role, `createPropertyAction` via authenticated server client). `PropertyList` rewritten as a multi-step dialog with customer picker + inline new-customer form for staff. Add-Property button unhidden for everyone (staff routes through picker; customers route direct to property form). Properties page server component fetches the customer list when staff is viewing.

**In progress**: (none — awaiting user QA of Batch 3)

**Next up (Batch 4 — quote engine rewrite + hardware checkboxes + notes)**:
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
- Standalone cleanup — pre-existing ESLint errors in `src/components/admin/catalog-manager.tsx` (nested `CatalogSection` component defined inside the parent render function; needs lifting outside per `react-hooks/static-components`) and unused `products` prop in `src/components/windows/window-list.tsx`. Neither is Batch-2/3-induced.

## 5. Handover point

Batches 1, 2, and 3 are done. Migrations `00007` and `00008` are applied in the live Supabase project. `SUPABASE_SERVICE_ROLE_KEY` is set in both `.env.local` and the Vercel project env. Retail / wholesale markup defaults are 40% / 20% (editable by admin via `/admin/pricing`).

Next session should: (a) wait for the user's QA feedback on Batch 3 (the Add Property flow with customer picker + inline new-customer form for staff; the original "missing Add Property button" bug should now be closed), (b) when the user greenlights Batch 4, start with the quote engine rewrite — `src/lib/quote-engine.ts` `calculateLineItem` + `calculateQuoteTotals` — because that's the foundation the hardware-checkbox UI and the notes editor both depend on, and (c) revisit `node_modules/next/dist/docs/` if any new Next 16 patterns come up.

Waiting on the user for: QA of Batch 3 (log in as each role, try creating a customer + property, check the Activity Log for the audit entries) and confirmation to start Batch 4. Also worth asking: should the "Create New Customer" form surface the temp password so the salesman can write it down / text it to the customer? Right now it toasts once ("Created … — temp password: Finesse4Blinds!") but the message disappears quickly.

## 6. Change log

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

- **Pending token rotations** (see `~/.claude/projects/C--Projects-Claude-AddOns/memory/pending_token_rotations.md`): two GitHub PATs and one Supabase PAT exposed in chat in prior sessions. User has NOT yet rotated them. Any MCP reconfig (Supabase MCP → Finesse project ref, GitHub MCP → new PAT) is blocked until rotation.
- **Vercel MCP auth**: user confirmed Vercel deployment but hasn't confirmed whether the Vercel MCP is authed for this account. Ask with `/mcp` before any deploy-related work.
- **Retail / wholesale markup defaults**: what are the actual numbers? Placeholder 40% / 20% until user confirms.
- **Commit cadence**: user hasn't specified whether they want a commit per batch or per logical change within a batch. Default: one commit per completed batch, conventional-commits format, staged by Claude but committed by user (never auto-commit without explicit request).
