export type UserRole =
  | 'retail_customer'
  | 'wholesale_customer'
  | 'salesman'
  | 'administrator'
export type MountType = 'inside' | 'outside'
export type UnitType = 'per_inch' | 'per_sq_inch' | 'fixed'
export type QuoteStatus = 'draft' | 'final' | 'expired'

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
  created_at: string
}

export interface Product {
  id: string
  make: string
  model: string
  shade_types: string[]
  styles: string[]
  colours: string[]
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
  width_inches: number
  height_inches: number
  depth_inches: number | null
  mount_type: MountType
  has_blind: boolean
  has_awning: boolean
  product_id: string | null
  shade_type: string | null
  style: string | null
  colour: string | null
  awning_product_id: string | null
  awning_colour: string | null
  /** Hardware component names (from `components.name`) that have been unchecked for this window's blind. Empty array = all hardware included. */
  excluded_components: string[]
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
  cassette_cost: number
  tube_cost: number
  bottom_rail_cost: number
  chain_cost: number
  fabric_cost: number
  fixed_costs: number
  line_total_usd: number
  created_at: string
}

export interface PricingConfig {
  id: number
  exchange_rate: number
  reseller_discount_pct: number
  default_markup_pct: number
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

export interface CatalogItem {
  id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
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
