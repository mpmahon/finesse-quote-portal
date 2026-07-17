# Finesse Quote Portal — DEVLOG archive

Older change-log entries, moved out of `DEVLOG.md` to keep it under ~400
lines. Same content, just archived — nothing here is stale or superseded
unless the main DEVLOG says so.

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
