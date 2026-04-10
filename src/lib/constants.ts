export const USER_ROLES = ['customer', 'salesman', 'administrator'] as const
export const MOUNT_TYPES = ['inside', 'outside'] as const
export const QUOTE_STATUSES = ['draft', 'final', 'expired'] as const

export const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  salesman: 'Salesman',
  administrator: 'Administrator',
}

export const MOUNT_TYPE_LABELS: Record<string, string> = {
  inside: 'Inside Mount',
  outside: 'Outside Mount',
}
