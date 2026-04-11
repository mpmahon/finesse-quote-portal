export const USER_ROLES = [
  'retail_customer',
  'wholesale_customer',
  'salesman',
  'administrator',
] as const
export const MOUNT_TYPES = ['inside', 'outside'] as const
export const QUOTE_STATUSES = ['draft', 'final', 'expired'] as const

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
