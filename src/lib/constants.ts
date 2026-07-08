export const USER_ROLES = [
  'retail_customer',
  'wholesale_customer',
  'salesman',
  'administrator',
] as const
export const MOUNT_TYPES = ['inside', 'outside', 'undecided'] as const

/**
 * Standard room names found in most residential/commercial properties.
 * Populates the room dropdown on create/edit; selecting the sentinel
 * "Other…" value reveals a free-text input for a custom name. Only the
 * resolved string is ever written to `rooms.name` — the sentinel itself
 * is never persisted.
 */
export const STANDARD_ROOMS = [
  'Kitchen',
  'Living Room',
  'Dining Room',
  'Master Bedroom',
  'Bedroom 2',
  'Bedroom 3',
  'Bathroom',
  'Office / Study',
  'Porch / Patio',
  'Laundry',
  'Garage',
  'Hallway',
] as const

/** Sentinel Select value that reveals the custom room-name input. Never written to the DB. */
export const OTHER_ROOM_VALUE = '__other__'
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const
export const JOB_STATUSES = ['pending', 'measure', 'fabricate', 'install', 'complete', 'on_hold'] as const

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  final: 'Sent', // legacy alias
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  measure: 'Measure',
  fabricate: 'Fabricate',
  install: 'Install',
  complete: 'Complete',
  on_hold: 'On Hold',
}

export const ROLE_LABELS: Record<string, string> = {
  retail_customer: 'Retail Customer',
  wholesale_customer: 'Wholesale Customer',
  salesman: 'Salesman',
  administrator: 'Administrator',
}

export const MOUNT_TYPE_LABELS: Record<string, string> = {
  inside: 'Inside Mount',
  outside: 'Outside Mount',
  undecided: "Undecided / Don't Know",
}

/** Default temp password assigned to admin/salesman-created customer accounts. Customers are expected to change it on first login. */
export const DEFAULT_TEMP_CUSTOMER_PASSWORD = 'Finesse4Blinds!'

/**
 * Client blind-type taxonomy tags (Batch 7 pre-work — minimal, forward-
 * compatible with the full Type -> Opacity -> Style -> Colour -> Valance
 * rework). Drives width-based hardware sizing via `hardware_size_rules`.
 */
export const BLIND_TYPES = ['roller_shade', 'neolux'] as const

export const BLIND_TYPE_LABELS: Record<string, string> = {
  roller_shade: 'Roller Shade',
  neolux: 'Neolux Shade',
}

/**
 * Batch 7 — maps a {@link BlindType} hierarchy node's `name` (e.g. "Roller
 * Shade") to the `products.blind_type` tag slug used for width-based
 * hardware sizing (`BLIND_TYPES` above). Only the two Types with tagged
 * products so far are mapped; every other Type has no product-line mapping
 * yet, so the window configurator shows all products unfiltered with a
 * muted "mapping pending" note for those.
 */
export const BLIND_TYPE_NAME_TO_PRODUCT_SLUG: Record<string, (typeof BLIND_TYPES)[number]> = {
  'Roller Shade': 'roller_shade',
  'Neolux Shade': 'neolux',
}
