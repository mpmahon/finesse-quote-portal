export type UserRole = 'customer' | 'salesman' | 'administrator'
export type MountType = 'inside' | 'outside'
export type UnitType = 'per_inch' | 'per_sq_inch' | 'fixed'
export type QuoteStatus = 'draft' | 'final' | 'expired'

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
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  user_id: string
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
  created_at: string
  expires_at: string | null
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  window_id: string
  product_id: string
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
  admin_user_id: string
  action_type: string
  target_table: string | null
  target_id: string | null
  change_summary: Record<string, unknown> | null
  created_at: string
}
