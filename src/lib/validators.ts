import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

/**
 * Public self-registration schema. Always creates a retail customer —
 * wholesale customers and salesmen are created by staff from inside the app.
 */
export const registerSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string(),
}).refine(data => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const propertySchema = z.object({
  name: z.string().min(1, 'Property name is required'),
  address: z.string().optional(),
})

export const roomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
})

export const windowSchema = z.object({
  name: z.string().min(1, 'Window name is required'),
  width_inches: z.coerce.number().positive('Width must be positive'),
  height_inches: z.coerce.number().positive('Height must be positive'),
  depth_inches: z.coerce.number().positive('Depth must be positive').optional().nullable(),
  mount_type: z.enum(['inside', 'outside']),
  has_blind: z.boolean().default(true),
  has_awning: z.boolean().default(false),
})

export const windowConfigSchema = z.object({
  product_id: z.string().uuid('Select a product'),
  shade_type: z.string().min(1, 'Select a shade type'),
  style: z.string().min(1, 'Select a style'),
  colour: z.string().min(1, 'Select a colour'),
})

export const productSchema = z.object({
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  shade_types: z.array(z.string()).min(1, 'At least one shade type required'),
  styles: z.array(z.string()).min(1, 'At least one style required'),
  colours: z.array(z.string()).min(1, 'At least one colour required'),
})

export const componentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  unit: z.enum(['per_inch', 'per_sq_inch', 'fixed']),
  usd_price: z.coerce.number().nonnegative('Price must be non-negative'),
})

export const pricingConfigSchema = z.object({
  exchange_rate: z.coerce.number().positive(),
  reseller_discount_pct: z.coerce.number().min(0).max(100),
  default_markup_pct: z.coerce.number().min(0).max(100),
  retail_markup_pct: z.coerce.number().min(0).max(100),
  wholesale_markup_pct: z.coerce.number().min(0).max(100),
  labor_cost_ttd: z.coerce.number().nonnegative(),
  installation_cost_ttd: z.coerce.number().nonnegative(),
  duty_percent: z.coerce.number().min(0).max(100),
  shipping_fee_ttd: z.coerce.number().nonnegative(),
  max_window_width_in: z.coerce.number().positive(),
  max_window_height_in: z.coerce.number().positive(),
  min_window_size_in: z.coerce.number().positive(),
  quote_validity_days: z.coerce.number().int().positive(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type PropertyInput = z.infer<typeof propertySchema>
export type RoomInput = z.infer<typeof roomSchema>
export type WindowInput = z.infer<typeof windowSchema>
export type WindowConfigInput = z.infer<typeof windowConfigSchema>
export type ProductInput = z.infer<typeof productSchema>
export type ComponentInput = z.infer<typeof componentSchema>
export type PricingConfigInput = z.infer<typeof pricingConfigSchema>
