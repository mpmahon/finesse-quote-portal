export type UserRole =
  | 'retail_customer'
  | 'wholesale_customer'
  | 'salesman'
  | 'administrator'
/** 'undecided' is treated as outside-mount for dimension/costing purposes (see quote-engine.ts) and rendered with a muted "mount TBD" note. */
export type MountType = 'inside' | 'outside' | 'undecided'
export type UnitType = 'per_inch' | 'per_sq_inch' | 'fixed'
/** 'final' is a legacy alias migrated to 'sent'; never write it. 'expired' is derived at read time from expires_at while sent. */
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'final'
export type JobStatus = 'pending' | 'measure' | 'fabricate' | 'install' | 'complete' | 'on_hold'

/**
 * Batch 11 — the client's 16-stage order workflow (migration 00020),
 * replacing `JobStatus` as the source of truth for the jobs board and the
 * job-detail stepper. Order is defined by {@link WORKFLOW_STAGES} in
 * constants.ts, not by declaration order here.
 */
export type WorkflowStage =
  | 'request_received'
  | 'site_visit_done'
  | 'quote_complete'
  | 'quote_sent'
  | 'follow_up'
  | 'job_approved'
  | 'internal_order'
  | 'stock_check'
  | 'fabrication_scheduled'
  | 'production_complete'
  | 'installation_scheduled'
  | 'invoice_created'
  | 'invoice_sent'
  | 'installation_complete'
  | 'payment_follow_up'
  | 'after_sales_follow_up'

/** One entry in a job's `stage_history` append-only audit trail (migration 00020). */
export interface StageHistoryEntry {
  stage: WorkflowStage
  at: string
  actor_id: string
}

/**
 * Effective lifecycle status for display and transition checks: a 'sent'
 * quote past its expires_at reads as 'expired' without any cron; legacy
 * 'final' rows read as 'sent'.
 */
export function effectiveQuoteStatus(quote: {
  status: QuoteStatus
  expires_at: string | null
}): Exclude<QuoteStatus, 'final'> {
  const status = quote.status === 'final' ? 'sent' : quote.status
  if (status === 'sent' && quote.expires_at && new Date(quote.expires_at) < new Date()) {
    return 'expired'
  }
  return status
}

/** True when the role is a staff member (not a customer). */
export function isStaffRole(role: UserRole): boolean {
  return role === 'salesman' || role === 'administrator'
}

/** True when the role is any kind of customer. */
export function isCustomerRole(role: UserRole): boolean {
  return role === 'retail_customer' || role === 'wholesale_customer'
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  email: string
  contact_number: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Property {
  id: string
  user_id: string
  /** The profile id of whoever created the property (customer themselves, or a salesman/admin acting on their behalf). Used for the staff activity report. */
  created_by: string
  name: string
  address: string | null
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  property_id: string
  name: string
  /** Wholesale room-quantity multiplier (e.g. hotel: one room config x 40 identical rooms). Default 1 = no multiplier. */
  quantity: number
  created_at: string
}

export interface Product {
  id: string
  make: string
  model: string
  shade_types: string[]
  styles: string[]
  colours: string[]
  /**
   * Client blind-type tag ('roller_shade' | 'neolux' for now, see
   * {@link BLIND_TYPES} in constants.ts) — drives width-based hardware
   * sizing via {@link HardwareSizeRule}. Null when untagged (pre-Batch-7
   * taxonomy, or a product this table's rules don't apply to).
   */
  blind_type: string | null
  /** Public URL of the product photo (product-images storage bucket). */
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AwningProduct {
  id: string
  make: string
  model: string
  depth_inches: number
  frame_unit_price_usd: number
  material_unit_price_usd: number
  fixed_cost_usd: number
  colours: string[]
  /** Public URL of the product photo (product-images storage bucket). */
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Component {
  id: string
  product_id: string
  name: string
  unit: UnitType
  usd_price: number
  created_at: string
  updated_at: string
}

export interface Window {
  id: string
  room_id: string
  name: string
  /** Optional free-text notes about the window (e.g. "faces the pool, arched top"). */
  description: string | null
  width_inches: number
  height_inches: number
  depth_inches: number | null
  mount_type: MountType
  has_blind: boolean
  has_awning: boolean
  product_id: string | null
  /**
   * Batch 7: for windows configured after the blind hierarchy rework, this
   * holds the {@link BlindType} name (e.g. "Roller Shade"). Windows
   * configured before Batch 7 keep their historical flat shade-type value
   * (e.g. "blackout") untouched — same column, semantic change only.
   */
  shade_type: string | null
  style: string | null
  colour: string | null
  /** Batch 7: {@link BlindOpacity} name, dependent on `shade_type` (Type). Null for pre-Batch-7 windows and for Types/Opacities with no configured opacity yet. */
  opacity: string | null
  /** Batch 7: {@link BlindValance} name, dependent on `shade_type` (Type) — a parallel attribute, not part of the Opacity -> Style -> Colour chain. Null when not selected. */
  valance: string | null
  awning_product_id: string | null
  awning_colour: string | null
  /** Hardware component names (from `components.name`) that have been unchecked for this window's blind. Empty array = all hardware included. */
  excluded_components: string[]
  /** Identical-window quantity multiplier within its room (e.g. 3 matching windows in the same room). Default 1 = no multiplier. Combines with the room's own `quantity` at quote time. */
  quantity: number
  created_at: string
  updated_at: string
}

/** A single note attached to a quote. Multiple notes per quote; each can be individually flagged to render (or hide) on the PDF. */
export interface QuoteNote {
  id: string
  text: string
  show_on_pdf: boolean
}

export interface Quote {
  id: string
  user_id: string
  /** The profile id of whoever generated the quote. Customers create quotes for themselves; staff create quotes on behalf of a customer. Used for activity reports. */
  created_by: string
  property_id: string
  status: QuoteStatus
  currency: string
  exchange_rate: number
  markup_percent: number
  discount_percent: number
  duty_percent: number
  shipping_fee_ttd: number
  labor_cost_ttd: number
  installation_cost_ttd: number
  subtotal_usd: number
  total_ttd: number
  /** Free-text notes attached to the quote. See {@link QuoteNote}. */
  notes: QuoteNote[]
  created_at: string
  expires_at: string | null
  /** Lifecycle stamps (WS4). */
  sent_at: string | null
  accepted_at: string | null
  accepted_by: string | null
  declined_at: string | null
  decline_reason: string | null
}

export interface Job {
  id: string
  /** Nullable since Batch 11 (migration 00020) — a walk-in/staff-created order can exist before any quote (workflow stages 1-5). */
  quote_id: string | null
  /** Nullable since Batch 11 — populated once a property is picked; a fresh request may start with only a customer. */
  property_id: string | null
  /** Batch 11 — the customer this order is for. Backfilled from the linked quote for pre-Batch-11 rows; always set going forward (either from the accepted quote or the New Order dialog). */
  customer_id: string | null
  /** Legacy 6-value lifecycle field, kept for backward compatibility. No longer driven by the UI — see `workflow_stage`. */
  status: JobStatus
  /** Batch 11 — the client's 16-stage order workflow; the source of truth for the jobs board and detail stepper. See {@link WorkflowStage}. */
  workflow_stage: WorkflowStage
  /** Batch 11 — append-only audit trail of workflow_stage transitions. See {@link StageHistoryEntry}. */
  stage_history: StageHistoryEntry[]
  scheduled_install_date: string | null
  install_notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface JobAssignment {
  id: string
  job_id: string
  assignee_id: string
  role: string
  created_at: string
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  window_id: string
  product_id: string | null
  awning_product_id: string | null
  line_type: 'blind' | 'awning' | 'zero'
  room_name: string
  window_name: string
  blind_width: number
  blind_height: number
  fabric_area: number
  chain_length: number
  shade_type: string | null
  style: string | null
  colour: string | null
  /** Batch 7: {@link BlindOpacity} name snapshotted at quote-generation time. Null for awning/zero lines or pre-Batch-7 blind lines. */
  opacity: string | null
  /** Batch 7: {@link BlindValance} name snapshotted at quote-generation time. Null for awning/zero lines or when no valance was selected. */
  valance: string | null
  cassette_cost: number
  tube_cost: number
  bottom_rail_cost: number
  chain_cost: number
  fabric_cost: number
  fixed_costs: number
  line_total_usd: number
  /** Snapshot of the width-based hardware rule applied at quote-generation time. Null for awning/zero lines, or blind lines whose product has no blind_type / no matching rule. */
  hardware_spec: HardwareSpec | null
  /** Effective unit multiplier snapshotted at generation time: window_quantity x room_quantity. Drives the displayed/multiplied price on quote detail + PDF. */
  quantity: number
  /** The owning room's `quantity` at generation time. */
  room_quantity: number
  /** The window's own `quantity` at generation time. */
  window_quantity: number
  created_at: string
}

/**
 * A width-based hardware sizing rule for Roller Shade / Neolux blind types
 * (Batch 7 pre-work, client-supplied thresholds). Matched by `blind_type` +
 * the fabricated blind width (see `calculateBlindDimensions` in
 * quote-engine.ts) to determine the required tube size and control type,
 * with optional cost overrides that are cost-neutral (null) until the
 * client confirms upcharge pricing.
 */
export interface HardwareSizeRule {
  id: string
  blind_type: string
  /** Inclusive lower bound of the fabricated blind width, in inches. */
  min_width_in: number
  /** Inclusive upper bound of the fabricated blind width, in inches. */
  max_width_in: number
  tube_size: string
  control_type: string
  is_motorized: boolean
  /** USD per-inch tube price override. Replaces the product's tube component price for the matched range when set; null = no cost impact (seeded state). */
  tube_usd_per_inch_override: number | null
  /** Fixed USD control cost added to the line item's fixed_costs when set; null = no cost impact (seeded state). */
  control_fixed_usd: number | null
  created_at: string
  updated_at: string
}

/**
 * Snapshot of the hardware rule resolved for a blind line — either live in
 * the configurator or persisted on a quote line item at generation time.
 * Null (via `resolveHardwareSpec` in quote-engine.ts) when the product has
 * no `blind_type` or no rule matches the blind's blind_type.
 */
export interface HardwareSpec {
  tube_size: string
  control_type: string
  is_motorized: boolean
  blind_type: string
  rule_id: string
}

export interface PricingConfig {
  id: number
  exchange_rate: number
  /** Markup applied to retail customer quotes. Not shown to the customer. */
  retail_markup_pct: number
  /** Markup applied to wholesale customer quotes. Not shown to the customer. */
  wholesale_markup_pct: number
  labor_cost_ttd: number
  installation_cost_ttd: number
  duty_percent: number
  shipping_fee_ttd: number
  max_window_width_in: number
  max_window_height_in: number
  min_window_size_in: number
  quote_validity_days: number
  updated_at: string
}

/** Row shape shared by the legacy flat lookup tables (`legacy_shade_types` / `legacy_styles` / `legacy_colours`, renamed from `shade_types`/`styles`/`colours` in Batch 7). Superseded by the {@link BlindType} hierarchy for all customer/salesperson-facing selection; kept only for historical data and the admin Product Manager's make/model tagging. */
export interface CatalogItem {
  id: string
  name: string
  /** Optional hex colour (legacy_colours only) for swatch chips and the window diagram. */
  hex_code?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Batch 7 — the dependent blind option hierarchy replacing the flat
 * `shade_types`/`styles`/`colours` vocabulary: Type -> Opacity -> Style ->
 * Colour, plus Valance/Finisher keyed off Type only (a parallel attribute,
 * not part of that chain). See `src/lib/blind-hierarchy.ts` for the fetch +
 * traversal helpers and
 * `..\resources\2026-07-07_blind-hierarchy-spec.md` for the design spec.
 */
interface BlindHierarchyNode {
  id: string
  name: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** Root of the blind hierarchy (e.g. "Roller Shade", "Cellular"). Six seeded. */
export type BlindType = BlindHierarchyNode

/** Opacity level, scoped to a single {@link BlindType} (e.g. "Sheer", "Blackout"). */
export interface BlindOpacity extends BlindHierarchyNode {
  type_id: string
}

/** Style level, scoped to a single {@link BlindOpacity} (e.g. "Faux wood", "Aurora"). This is the level that carries pricing — see {@link BlindStyleComponent} — and, since the removal of the separate Product Management feature, the style photo. */
export interface BlindStyle extends BlindHierarchyNode {
  opacity_id: string
  /** Public URL of the style photo (product-images storage bucket), shown in the Style Gallery and the admin editor. Null until an admin uploads one. */
  image_url: string | null
}

/**
 * Per-style pricing component (blind pricing moved from `products`/
 * `components` to the hierarchy — client directive 2026-07-07/08: "the
 * structure we have created in Blind Management is what we sell"). Same
 * {name, unit, usd_price} shape as the legacy {@link Component}, so it
 * satisfies the quote engine's `PricedComponent` contract identically —
 * the pure engine never needs to know which table a row came from.
 */
export interface BlindStyleComponent {
  id: string
  style_id: string
  name: string
  unit: UnitType
  usd_price: number
  created_at: string
  updated_at: string
}

/** Colour level, scoped to a single {@link BlindStyle}. Optional hex for swatch chips — none seeded yet (all TBD). */
export interface BlindColour extends BlindHierarchyNode {
  style_id: string
  hex_code: string | null
}

/** Valance/Finisher option, scoped to a single {@link BlindType} — parallel to the Opacity -> Style -> Colour chain, not part of it. */
export interface BlindValance extends BlindHierarchyNode {
  type_id: string
}

export interface AuditLog {
  id: string
  /** Profile id of whoever performed the action (salesman or administrator). Renamed from admin_user_id in Batch 2. */
  actor_id: string
  action_type: string
  target_table: string | null
  target_id: string | null
  change_summary: Record<string, unknown> | null
  created_at: string
}
