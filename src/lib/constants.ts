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

/**
 * Batch 11 — the client's 16-stage order workflow (migration 00020), the
 * single source of truth for stage order everywhere it matters: jobs-board
 * grouping, the job-detail stepper, and the admin dashboard workflow strip.
 * Array index IS the canonical stage order — see `WORKFLOW_STAGE_ORDER`
 * for an O(1) lookup.
 */
export const WORKFLOW_STAGES = [
  'request_received',
  'site_visit_done',
  'quote_complete',
  'quote_sent',
  'follow_up',
  'job_approved',
  'internal_order',
  'stock_check',
  'fabrication_scheduled',
  'production_complete',
  'installation_scheduled',
  'invoice_created',
  'invoice_sent',
  'installation_complete',
  'payment_follow_up',
  'after_sales_follow_up',
] as const

/** O(1) stage -> position lookup, derived from {@link WORKFLOW_STAGES}. */
export const WORKFLOW_STAGE_ORDER: Record<string, number> = Object.fromEntries(
  WORKFLOW_STAGES.map((s, i) => [s, i])
)

/**
 * Full labels in the client's exact wording (order-workflow spec,
 * 2026-07-08). Used on the job-detail stepper and stage-history list where
 * there's room for the fuller description of what each stage means.
 */
export const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  request_received: 'Request Received / Site Visit Scheduled',
  site_visit_done: 'Site Visit Done (Quotation Request Form)',
  quote_complete: 'Quote Complete',
  quote_sent: 'Quote Sent',
  follow_up: 'Follow Up',
  job_approved: 'Job Approved — Written Confirmation + Deposit, Payment Verified',
  internal_order: 'Internal Order Created & Assigned',
  stock_check: 'Stock Check — Double-Check Stock, Follow Up with Customer',
  fabrication_scheduled: 'Fabrication Scheduled',
  production_complete: 'Production Complete — QA Done and Signed',
  installation_scheduled: 'Installation / Delivery / Collection Scheduled',
  invoice_created: 'Invoice Created',
  invoice_sent: 'Invoice Sent (Day Before Installation)',
  installation_complete: 'Installation Complete (QA Form Signed by Customer)',
  payment_follow_up: 'Payment Follow-Up — Proof of Receipt, Payment Verified',
  after_sales_follow_up: 'After-Sales Follow-Up (1 Month)',
}

/** Short labels for tight UIs — board columns, dashboard tiles, dropdowns. */
export const WORKFLOW_STAGE_SHORT_LABELS: Record<string, string> = {
  request_received: 'Request Received',
  site_visit_done: 'Site Visit Done',
  quote_complete: 'Quote Complete',
  quote_sent: 'Quote Sent',
  follow_up: 'Follow Up',
  job_approved: 'Job Approved',
  internal_order: 'Internal Order',
  stock_check: 'Stock Check',
  fabrication_scheduled: 'Fabrication Scheduled',
  production_complete: 'Production Complete',
  installation_scheduled: 'Install Scheduled',
  invoice_created: 'Invoice Created',
  invoice_sent: 'Invoice Sent',
  installation_complete: 'Install Complete',
  payment_follow_up: 'Payment Follow-Up',
  after_sales_follow_up: 'After-Sales',
}

/**
 * Stage -> Tailwind badge colour classes, following the same
 * neutral/in-progress/success convention as `QuoteStatusBadge`'s internal
 * `STATUS_STYLES`: the first 5 stages (pre-sale pipeline, before a job is
 * approved) are neutral slate, the next 8 (approved through installation
 * prep — the "production" span) are amber, and the last 3 (post-install)
 * are green. Derived from `WORKFLOW_STAGES` position rather than a
 * hand-maintained duplicate list, so adding/reordering stages can't drift
 * out of sync with the colour bands.
 */
export const WORKFLOW_STAGE_COLORS: Record<string, string> = Object.fromEntries(
  WORKFLOW_STAGES.map((stage, i) => [
    stage,
    i < 5
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : i < 13
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ])
)

/**
 * Pre-quote stages (1-5) — a job can exist here before any quote is
 * attached. Used to best-effort match a pre-quote job when a quote is sent
 * for the same customer/property (see `sendQuoteAction`).
 */
export const PRE_QUOTE_WORKFLOW_STAGES: readonly string[] = WORKFLOW_STAGES.slice(0, 5)
