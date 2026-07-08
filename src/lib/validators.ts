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
  /** Optional free-text notes (e.g. "faces the pool, arched top"). Empty string is normalised to null before it reaches the DB. */
  description: z.string().max(1000, 'Description is too long').optional().nullable(),
  width_inches: z.coerce.number().positive('Width must be positive'),
  height_inches: z.coerce.number().positive('Height must be positive'),
  depth_inches: z.coerce.number().positive('Depth must be positive').optional().nullable(),
  mount_type: z.enum(['inside', 'outside', 'undecided']),
  has_blind: z.boolean().default(true),
  has_awning: z.boolean().default(false),
})

/** Dimension limits sourced from pricing_config. */
export interface WindowLimits {
  min_window_size_in: number
  max_window_width_in: number
  max_window_height_in: number
}

/**
 * Window schema with pricing_config dimension limits applied (WS1 §5.4).
 * Used by both the window form (client) and /api/quotes/calculate (server)
 * so out-of-range windows can never reach a quote.
 */
export function windowSchemaWithLimits(limits: WindowLimits) {
  return windowSchema.extend({
    width_inches: z.coerce
      .number()
      .min(limits.min_window_size_in, `Width must be at least ${limits.min_window_size_in}"`)
      .max(limits.max_window_width_in, `Width cannot exceed ${limits.max_window_width_in}"`),
    height_inches: z.coerce
      .number()
      .min(limits.min_window_size_in, `Height must be at least ${limits.min_window_size_in}"`)
      .max(limits.max_window_height_in, `Height cannot exceed ${limits.max_window_height_in}"`),
  })
}

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

/**
 * Pricing config form schema. Plain z.number() (not coerce) so the RHF
 * resolver types line up — the editor registers inputs with
 * `valueAsNumber: true`, and an emptied field becomes NaN, which fails
 * validation instead of reaching the database (WS1 §5.3).
 */
const requiredNumber = z
  .number({ error: 'Enter a number' })
  .refine(n => !Number.isNaN(n), 'Enter a number')

export const pricingConfigSchema = z.object({
  exchange_rate: requiredNumber.refine(n => n > 0, 'Exchange rate must be positive'),
  retail_markup_pct: requiredNumber.refine(n => n >= 0 && n <= 100, 'Must be 0–100'),
  wholesale_markup_pct: requiredNumber.refine(n => n >= 0 && n <= 100, 'Must be 0–100'),
  labor_cost_ttd: requiredNumber.refine(n => n >= 0, 'Must be 0 or more'),
  installation_cost_ttd: requiredNumber.refine(n => n >= 0, 'Must be 0 or more'),
  duty_percent: requiredNumber.refine(n => n >= 0 && n <= 100, 'Must be 0–100'),
  shipping_fee_ttd: requiredNumber.refine(n => n >= 0, 'Must be 0 or more'),
  max_window_width_in: requiredNumber.refine(n => n > 0, 'Must be positive'),
  max_window_height_in: requiredNumber.refine(n => n > 0, 'Must be positive'),
  min_window_size_in: requiredNumber.refine(n => n > 0, 'Must be positive'),
  quote_validity_days: requiredNumber.refine(n => Number.isInteger(n) && n > 0, 'Whole number of days'),
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
