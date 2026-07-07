export const USER_ROLES = [
  'retail_customer',
  'wholesale_customer',
  'salesman',
  'administrator',
] as const
export const MOUNT_TYPES = ['inside', 'outside'] as const
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
}

/** Default temp password assigned to admin/salesman-created customer accounts. Customers are expected to change it on first login. */
export const DEFAULT_TEMP_CUSTOMER_PASSWORD = 'Finesse4Blinds!'
