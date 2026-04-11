'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_TEMP_CUSTOMER_PASSWORD } from '@/lib/constants'
import type { UserRole } from '@/types/database'

/**
 * Batch 3 server actions for property + customer creation.
 *
 * Security model: every action verifies the caller's session and role from
 * the cookie-scoped server client before touching any data. Input is never
 * trusted — the role claim lives only in the profiles table, not in the
 * request payload. Staff-initiated mutations that bypass the caller's own
 * RLS scope (e.g. creating an auth user, or inserting a property on behalf
 * of another user) route through the service-role admin client.
 */

// ============================================================
// Customer creation (staff only)
// ============================================================

export interface CreateCustomerInput {
  first_name: string
  last_name: string
  email: string
  contact_number: string | null
  role: 'retail_customer' | 'wholesale_customer'
}

export interface CreatedCustomer {
  id: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
}

export type CreateCustomerResult =
  | { ok: true; customer: CreatedCustomer }
  | { ok: false; error: string }

/**
 * Creates a new customer profile on behalf of a salesman or administrator.
 *
 * Flow:
 * 1. Verify the caller is authenticated and has a staff role.
 * 2. Validate input (trim, lowercase email, enforce role enum).
 * 3. Use the Supabase Admin API (service_role) to create an auth user with
 *    `email_confirm: true` so no verification email goes out, seeding the
 *    default temp password from `DEFAULT_TEMP_CUSTOMER_PASSWORD`.
 * 4. The `handle_new_user` trigger will have created the profile row from
 *    `user_metadata`. Re-read it to confirm and return it to the caller.
 * 5. Write an audit log entry attributing the creation to the staff user.
 *
 * If any step after the auth-user creation fails, the auth user is deleted
 * so we don't leave an orphan.
 */
export async function createCustomerAction(
  input: CreateCustomerInput
): Promise<CreateCustomerResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (
    !callerProfile ||
    (callerProfile.role !== 'salesman' && callerProfile.role !== 'administrator')
  ) {
    return { ok: false, error: 'Only staff can create customers' }
  }

  const first_name = input.first_name.trim()
  const last_name = input.last_name.trim()
  const email = input.email.trim().toLowerCase()
  const contact_number = input.contact_number?.trim() || null
  if (!first_name || !last_name || !email) {
    return { ok: false, error: 'First name, last name, and email are required' }
  }
  if (!email.includes('@')) {
    return { ok: false, error: 'Invalid email address' }
  }
  if (input.role !== 'retail_customer' && input.role !== 'wholesale_customer') {
    return { ok: false, error: 'Invalid customer type' }
  }

  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_TEMP_CUSTOMER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name,
      last_name,
      contact_number: contact_number ?? '',
      role: input.role,
    },
  })

  if (authError || !authData?.user) {
    return { ok: false, error: authError?.message || 'Failed to create customer' }
  }

  // The handle_new_user trigger should have created the profile row with the
  // metadata fields. Re-read it via the admin client (bypasses RLS so we
  // don't depend on the caller being able to see the newly-created row).
  const { data: newProfile, error: profileError } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !newProfile) {
    // Clean up the orphaned auth user so we don't pollute the auth schema.
    await admin.auth.admin.deleteUser(authData.user.id)
    return {
      ok: false,
      error: profileError?.message || 'Profile creation failed after auth user was created',
    }
  }

  // Audit log — attribute the creation to the staff member.
  await admin.from('audit_logs').insert({
    actor_id: user.id,
    action_type: 'customer_create',
    target_table: 'profiles',
    target_id: newProfile.id,
    change_summary: { email, role: input.role, name: `${first_name} ${last_name}` },
  })

  revalidatePath('/properties')
  revalidatePath('/admin/users')

  return {
    ok: true,
    customer: {
      id: newProfile.id,
      first_name: newProfile.first_name,
      last_name: newProfile.last_name,
      email: newProfile.email,
      role: newProfile.role as UserRole,
    },
  }
}

// ============================================================
// Property creation
// ============================================================

export interface CreatePropertyInput {
  name: string
  address: string | null
  /** The customer this property belongs to. Staff pass the target customer's id; customers pass their own. */
  user_id: string
}

export type CreatePropertyResult =
  | { ok: true; property_id: string }
  | { ok: false; error: string }

/**
 * Creates a property and records who created it.
 *
 * `user_id` is the owner of the property (always a customer).
 * `created_by` is always the authenticated caller — either the customer
 * themselves or the staff member acting on their behalf. Customers may only
 * create properties for themselves; staff may create for any customer.
 */
export async function createPropertyAction(
  input: CreatePropertyInput
): Promise<CreatePropertyResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return { ok: false, error: 'Profile not found' }

  const isStaff = profile.role === 'salesman' || profile.role === 'administrator'
  if (!isStaff && input.user_id !== user.id) {
    return { ok: false, error: 'You can only create properties for your own account' }
  }

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Property name is required' }
  const address = input.address?.trim() || null

  const { data: property, error } = await supabase
    .from('properties')
    .insert({
      user_id: input.user_id,
      created_by: user.id,
      name,
      address,
    })
    .select('id')
    .single()

  if (error || !property) {
    return { ok: false, error: error?.message || 'Failed to create property' }
  }

  // Log staff-initiated creation to the activity log. Customer self-creation
  // is intentionally not logged — it's high-volume and low-signal.
  if (isStaff) {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      actor_id: user.id,
      action_type: 'property_create',
      target_table: 'properties',
      target_id: property.id,
      change_summary: { name, owner_id: input.user_id },
    })
  }

  revalidatePath('/properties')

  return { ok: true, property_id: property.id }
}
