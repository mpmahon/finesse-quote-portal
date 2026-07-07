/**
 * Demo data seeder — client-review dataset (2026-07-07).
 *
 * Creates demo users (salesman + retail + wholesale customers), configured
 * properties/rooms/windows, and quotes in every lifecycle status, with jobs
 * spread across the board and the install calendar. All money is computed
 * through the real quote engine so totals match card estimates to the cent.
 *
 * Idempotent: demo properties are recreated from scratch each run (their
 * rooms/windows/quotes/jobs are deleted first). Run with:
 *   npx tsx scripts/seed-demo.ts
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import {
  calculateAwningLineItem,
  calculateLineItem,
  calculateQuoteTotals,
} from '../src/lib/quote-engine'
import type { PricingParams } from '../src/lib/quote-engine'
import type { AwningProduct, Component, MountType, UserRole } from '../src/types/database'

// ---------------------------------------------------------------- env/client
const envFile = path.join(__dirname, '..', '.env.local')
const env: Record<string, string> = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
const dateAhead = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
const dateAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10)

function die(msg: string, error?: unknown): never {
  console.error(`FATAL: ${msg}`, error ?? '')
  process.exit(1)
}

// ---------------------------------------------------------------- users
async function ensureUser(
  email: string,
  first: string,
  last: string,
  role: UserRole,
  contact: string
): Promise<string> {
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Finesse4Blinds!',
    email_confirm: true,
    user_metadata: { first_name: first, last_name: last, contact_number: contact, role },
  })
  if (error || !data?.user) die(`create user ${email}`, error)
  console.log(`created user ${email} (${role})`)
  return data.user.id
}

// ---------------------------------------------------------------- windows
interface DemoWindow {
  name: string
  width: number
  height: number
  depth?: number
  mount: MountType
  product?: string          // "Make Model" key for a blind
  shade_type?: string
  style?: string
  colour?: string
  awning?: string           // "Make Model" key for an awning
  awning_colour?: string
  excluded?: string[]
}

interface DemoRoom { name: string; windows: DemoWindow[] }

async function recreateProperty(
  ownerId: string,
  createdBy: string,
  name: string,
  address: string,
  rooms: DemoRoom[],
  productIds: Map<string, { id: string; components: Component[] }>,
  awningIds: Map<string, AwningProduct>
): Promise<string> {
  // Wipe any previous copy of this demo property (cascades rooms/windows/quotes/jobs).
  const { data: prior } = await admin.from('properties').select('id').eq('name', name)
  for (const p of prior ?? []) {
    await admin.from('jobs').delete().eq('property_id', p.id)
    await admin.from('quotes').delete().eq('property_id', p.id)
    await admin.from('properties').delete().eq('id', p.id)
  }

  const { data: property, error } = await admin
    .from('properties')
    .insert({ user_id: ownerId, created_by: createdBy, name, address })
    .select('id')
    .single()
  if (error || !property) die(`create property ${name}`, error)

  for (const room of rooms) {
    const { data: roomRow, error: roomError } = await admin
      .from('rooms')
      .insert({ property_id: property.id, name: room.name })
      .select('id')
      .single()
    if (roomError || !roomRow) die(`create room ${room.name}`, roomError)

    for (const w of room.windows) {
      const product = w.product ? productIds.get(w.product) : undefined
      if (w.product && !product) die(`unknown product ${w.product}`)
      const awning = w.awning ? awningIds.get(w.awning) : undefined
      if (w.awning && !awning) die(`unknown awning ${w.awning}`)

      const { error: winError } = await admin.from('windows').insert({
        room_id: roomRow.id,
        name: w.name,
        width_inches: w.width,
        height_inches: w.height,
        depth_inches: w.depth ?? null,
        mount_type: w.mount,
        has_blind: !!w.product,
        has_awning: !!w.awning,
        product_id: product?.id ?? null,
        shade_type: w.shade_type ?? null,
        style: w.style ?? null,
        colour: w.colour ?? null,
        awning_product_id: awning?.id ?? null,
        awning_colour: w.awning_colour ?? null,
        excluded_components: w.excluded ?? [],
      })
      if (winError) die(`create window ${w.name}`, winError)
    }
  }

  console.log(`created property ${name} (${rooms.length} rooms)`)
  return property.id
}

// ---------------------------------------------------------------- quotes
interface QuoteScenario {
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  createdDaysAgo: number
  sentDaysAgo?: number
  acceptedDaysAgo?: number
  declinedDaysAgo?: number
  declineReason?: string
  /** Days from creation until expiry (validity window). */
  validityDays?: number
  notes?: { id: string; text: string; show_on_pdf: boolean }[]
  job?: {
    status: 'pending' | 'measure' | 'fabricate' | 'install' | 'complete' | 'on_hold'
    scheduledDate?: string
    installNotes?: string
    assignees?: string[]
  }
}

async function createQuote(
  propertyId: string,
  ownerId: string,
  ownerRole: UserRole,
  createdBy: string,
  acceptedBy: string | null,
  pricing: PricingParams,
  scenario: QuoteScenario
): Promise<string> {
  // Load the property's windows with product data, same shape as the route.
  const { data: windows, error: winError } = await admin
    .from('windows')
    .select(`
      id, name, width_inches, height_inches, mount_type,
      has_blind, has_awning,
      product_id, shade_type, style, colour,
      awning_product_id, awning_colour, excluded_components,
      rooms!inner(name, property_id),
      products(id, make, model, components(*)),
      awning_products(*)
    `)
    .eq('rooms.property_id', propertyId)
  if (winError || !windows?.length) die(`load windows for quote`, winError)

  interface Row {
    id: string
    name: string
    width_inches: number
    height_inches: number
    mount_type: MountType
    has_blind: boolean
    has_awning: boolean
    product_id: string | null
    shade_type: string | null
    style: string | null
    colour: string | null
    awning_product_id: string | null
    awning_colour: string | null
    excluded_components: string[]
    rooms: { name: string } | { name: string }[]
    products: { components: Component[] } | null
    awning_products: AwningProduct | null
  }
  const roomName = (w: Row) => {
    const r = Array.isArray(w.rooms) ? w.rooms[0] : w.rooms
    return r?.name ?? ''
  }

  const lineItems: Record<string, unknown>[] = []
  const priceable: { costs: { line_total_usd: number } }[] = []

  for (const w of windows as unknown as Row[]) {
    let hasLine = false
    if (w.has_blind && w.product_id && w.products) {
      const r = calculateLineItem(
        { width_inches: Number(w.width_inches), height_inches: Number(w.height_inches), mount_type: w.mount_type as MountType },
        w.products.components,
        w.excluded_components || []
      )
      priceable.push({ costs: { line_total_usd: r.costs.line_total_usd } })
      lineItems.push({
        window_id: w.id, product_id: w.product_id, awning_product_id: null, line_type: 'blind',
        room_name: roomName(w), window_name: w.name,
        blind_width: r.blind_width, blind_height: r.blind_height,
        fabric_area: r.fabric_area, chain_length: r.chain_length,
        shade_type: w.shade_type, style: w.style, colour: w.colour,
        ...r.costs,
      })
      hasLine = true
    }
    if (w.has_awning && w.awning_product_id && w.awning_products) {
      const r = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
      priceable.push({ costs: { line_total_usd: r.costs.line_total_usd } })
      lineItems.push({
        window_id: w.id, product_id: null, awning_product_id: w.awning_product_id, line_type: 'awning',
        room_name: roomName(w), window_name: w.name,
        blind_width: r.awning_width, blind_height: r.awning_depth,
        fabric_area: r.material_area, chain_length: 0,
        shade_type: null, style: null, colour: w.awning_colour,
        cassette_cost: r.costs.frame_cost, tube_cost: 0, bottom_rail_cost: 0, chain_cost: 0,
        fabric_cost: r.costs.material_cost, fixed_costs: r.costs.fixed_cost,
        line_total_usd: r.costs.line_total_usd,
      })
      hasLine = true
    }
    if (!hasLine) {
      lineItems.push({
        window_id: w.id, product_id: null, awning_product_id: null, line_type: 'zero',
        room_name: roomName(w), window_name: w.name,
        blind_width: Number(w.width_inches), blind_height: Number(w.height_inches),
        fabric_area: 0, chain_length: 0, shade_type: null, style: null, colour: null,
        cassette_cost: 0, tube_cost: 0, bottom_rail_cost: 0, chain_cost: 0,
        fabric_cost: 0, fixed_costs: 0, line_total_usd: 0,
      })
    }
  }

  const totals = calculateQuoteTotals(priceable, pricing, ownerRole)
  const createdAt = daysAgo(scenario.createdDaysAgo)
  const validity = scenario.validityDays ?? 14
  const expiresAt = new Date(new Date(createdAt).getTime() + validity * DAY).toISOString()

  const { data: quote, error: quoteError } = await admin
    .from('quotes')
    .insert({
      user_id: ownerId,
      created_by: createdBy,
      property_id: propertyId,
      status: scenario.status,
      currency: 'TTD',
      exchange_rate: pricing.exchange_rate,
      markup_percent: totals.markup_pct,
      discount_percent: 0,
      duty_percent: 0,
      shipping_fee_ttd: 0,
      labor_cost_ttd: pricing.labor_ttd,
      installation_cost_ttd: pricing.installation_ttd,
      subtotal_usd: totals.subtotal_usd,
      total_ttd: totals.grand_total_ttd,
      notes: scenario.notes ?? [],
      created_at: createdAt,
      expires_at: expiresAt,
      sent_at: scenario.sentDaysAgo !== undefined ? daysAgo(scenario.sentDaysAgo) : null,
      accepted_at: scenario.acceptedDaysAgo !== undefined ? daysAgo(scenario.acceptedDaysAgo) : null,
      accepted_by: scenario.acceptedDaysAgo !== undefined ? acceptedBy : null,
      declined_at: scenario.declinedDaysAgo !== undefined ? daysAgo(scenario.declinedDaysAgo) : null,
      decline_reason: scenario.declineReason ?? null,
    })
    .select('id')
    .single()
  if (quoteError || !quote) die('create quote', quoteError)

  const { error: liError } = await admin
    .from('quote_line_items')
    .insert(lineItems.map(li => ({ ...li, quote_id: quote.id })))
  if (liError) die('create line items', liError)

  if (scenario.job) {
    const { data: job, error: jobError } = await admin
      .from('jobs')
      .insert({
        quote_id: quote.id,
        property_id: propertyId,
        status: scenario.job.status,
        scheduled_install_date: scenario.job.scheduledDate ?? null,
        install_notes: scenario.job.installNotes ?? null,
        created_by: createdBy,
      })
      .select('id')
      .single()
    if (jobError || !job) die('create job', jobError)
    for (const assignee of scenario.job.assignees ?? []) {
      await admin.from('job_assignments').insert({ job_id: job.id, assignee_id: assignee })
    }
  }

  console.log(`quote ${scenario.status} — TTD $${totals.grand_total_ttd.toFixed(2)} (${priceable.length} lines)${scenario.job ? ` + job ${scenario.job.status}` : ''}`)
  return quote.id
}

// ---------------------------------------------------------------- main
async function main() {
  // Users
  const ravi = await ensureUser('demo.sales@finessett.com', 'Ravi', 'Persad', 'salesman', '+1 868 555 0101')
  const anita = await ensureUser('demo.retail@finessett.com', 'Anita', 'Ramkissoon', 'retail_customer', '+1 868 555 0202')
  const dave = await ensureUser('demo.wholesale@finessett.com', 'Dave', 'Boodoo', 'wholesale_customer', '+1 868 555 0303')

  // Catalog
  const { data: products } = await admin.from('products').select('id, make, model, components(*)')
  const productIds = new Map<string, { id: string; components: Component[] }>()
  for (const p of products ?? []) {
    productIds.set(`${p.make} ${p.model}`, { id: p.id, components: (p.components ?? []) as Component[] })
  }
  const { data: awnings } = await admin.from('awning_products').select('*')
  const awningIds = new Map<string, AwningProduct>()
  for (const a of (awnings ?? []) as AwningProduct[]) {
    awningIds.set(`${a.make} ${a.model}`, a)
  }

  const { data: config } = await admin.from('pricing_config').select('*').eq('id', 1).single()
  if (!config) die('pricing config missing')
  const pricing: PricingParams = {
    exchange_rate: Number(config.exchange_rate),
    retail_markup_pct: Number(config.retail_markup_pct),
    wholesale_markup_pct: Number(config.wholesale_markup_pct),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
  }

  // ---- Anita (retail) — Maraval residence
  const ramkissoon = await recreateProperty(anita, ravi,
    'Ramkissoon Residence', '12 Saddle Road, Maraval',
    [
      {
        name: 'Living Room',
        windows: [
          { name: 'Bay Window', width: 72, height: 60, mount: 'outside', product: 'Luxaflex Silhouette', shade_type: 'light filtering', style: 'silhouette', colour: 'pearl white' },
          { name: 'Side Window', width: 36, height: 48, depth: 3, mount: 'inside', product: 'Luxaflex Silhouette', shade_type: 'translucent', style: 'premium', colour: 'cream' },
        ],
      },
      {
        name: 'Master Bedroom',
        windows: [
          { name: 'Master Window', width: 60, height: 48, depth: 3.5, mount: 'inside', product: 'Norman Woodlore', shade_type: 'room darkening', style: 'cordless', colour: 'cherry', excluded: ['cassette'] },
          { name: 'Bathroom Window', width: 24, height: 30, depth: 3, mount: 'inside', product: 'Finesse Budget Roller', shade_type: 'light filtering', style: 'economy', colour: 'white' },
        ],
      },
      {
        name: 'Kitchen',
        windows: [
          { name: 'Kitchen Window', width: 48, height: 36, mount: 'outside', product: 'Levolor Fabric Roller', shade_type: 'blackout', style: 'textured', colour: 'graphite', awning: 'Sunbrella Canvas Classic', awning_colour: 'forest green' },
          { name: 'Pantry Window', width: 20, height: 24, mount: 'outside' }, // future opportunity — zero-cost line
        ],
      },
    ],
    productIds, awningIds
  )

  // ---- Dave (wholesale) — office fit-out
  const pricePlaza = await recreateProperty(dave, ravi,
    'Price Plaza Office Fit-out', 'Unit 24, Price Plaza, Chaguanas',
    [
      {
        name: 'Reception',
        windows: [
          { name: 'Storefront Left', width: 84, height: 72, mount: 'outside', product: 'Graber Commercial Blackout', shade_type: 'solar', style: 'standard', colour: 'grey' },
          { name: 'Storefront Right', width: 84, height: 72, mount: 'outside', product: 'Graber Commercial Blackout', shade_type: 'solar', style: 'standard', colour: 'grey' },
        ],
      },
      {
        name: 'Boardroom',
        windows: [
          { name: 'Boardroom Window', width: 96, height: 54, depth: 4, mount: 'inside', product: 'Hunter Douglas Duette', shade_type: 'blackout', style: 'standard', colour: 'slate' },
        ],
      },
      {
        name: 'Open Office',
        windows: [
          { name: 'East Window 1', width: 48, height: 48, depth: 3, mount: 'inside', product: 'Levolor Fabric Roller', shade_type: 'light filtering', style: 'standard', colour: 'white' },
          { name: 'East Window 2', width: 48, height: 48, depth: 3, mount: 'inside', product: 'Levolor Fabric Roller', shade_type: 'light filtering', style: 'standard', colour: 'white' },
          { name: 'East Window 3', width: 48, height: 48, depth: 3, mount: 'inside', product: 'Levolor Fabric Roller', shade_type: 'light filtering', style: 'standard', colour: 'white' },
        ],
      },
    ],
    productIds, awningIds
  )

  // ---- Anita's quotes
  await createQuote(ramkissoon, anita, 'retail_customer', ravi, anita, pricing, {
    status: 'accepted', createdDaysAgo: 10, sentDaysAgo: 10, acceptedDaysAgo: 6,
    notes: [
      { id: 'note_demo_1', text: 'Includes free removal of existing venetian blinds.', show_on_pdf: true },
      { id: 'note_demo_2', text: 'Customer prefers installation on a weekday morning.', show_on_pdf: false },
    ],
    job: { status: 'install', scheduledDate: dateAhead(2), installNotes: 'Ladder needed for the bay window. Park in the driveway.', assignees: [ravi] },
  })
  await createQuote(ramkissoon, anita, 'retail_customer', ravi, anita, pricing, {
    status: 'accepted', createdDaysAgo: 45, sentDaysAgo: 44, acceptedDaysAgo: 40,
    job: { status: 'complete', scheduledDate: dateAgo(4), installNotes: 'Completed — customer very happy.', assignees: [ravi] },
  })
  await createQuote(ramkissoon, anita, 'retail_customer', ravi, anita, pricing, {
    status: 'sent', createdDaysAgo: 2, sentDaysAgo: 2,
    notes: [{ id: 'note_demo_3', text: 'Revised quote — kitchen awning added as requested.', show_on_pdf: true }],
  })
  await createQuote(ramkissoon, anita, 'retail_customer', ravi, anita, pricing, {
    status: 'sent', createdDaysAgo: 30, sentDaysAgo: 30, validityDays: 14, // expired 16 days ago
  })

  // ---- Dave's quotes
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, {
    status: 'sent', createdDaysAgo: 12, sentDaysAgo: 12, validityDays: 14, // expires in ~2 days → "needs attention"
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, {
    status: 'draft', createdDaysAgo: 0,
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, {
    status: 'declined', createdDaysAgo: 15, sentDaysAgo: 15, declinedDaysAgo: 8,
    declineReason: 'Budget approval pushed to next quarter — revisit in October.',
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, {
    status: 'accepted', createdDaysAgo: 9, sentDaysAgo: 9, acceptedDaysAgo: 5,
    job: { status: 'fabricate', scheduledDate: dateAhead(8), installNotes: 'Fabrication in progress — commercial blackout rollers.', assignees: [ravi] },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, {
    status: 'accepted', createdDaysAgo: 3, sentDaysAgo: 3, acceptedDaysAgo: 1,
    job: { status: 'pending', assignees: [] },
  })

  // A little activity-feed colour
  await admin.from('audit_logs').insert([
    { actor_id: ravi, action_type: 'quote_sent', target_table: 'quotes', change_summary: { demo: true } },
    { actor_id: ravi, action_type: 'quote_accepted', target_table: 'quotes', change_summary: { demo: true } },
    { actor_id: ravi, action_type: 'job_scheduled', target_table: 'jobs', change_summary: { demo: true } },
  ])

  console.log('\nDemo data ready.')
  console.log('Logins (password Finesse4Blinds!):')
  console.log('  Salesman:  demo.sales@finessett.com')
  console.log('  Retail:    demo.retail@finessett.com')
  console.log('  Wholesale: demo.wholesale@finessett.com')
}

main().catch(e => die('unhandled', e))
