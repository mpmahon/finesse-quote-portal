/**
 * Demo data seeder — client-review dataset (2026-07-08, blind-hierarchy +
 * 16-stage workflow rewrite).
 *
 * Creates demo users (salesman + retail + wholesale customers), configured
 * properties/rooms/windows driven entirely by the LIVE blind hierarchy
 * (Type -> Opacity -> Style -> Colour, + per-Type Valance), and quotes in
 * every lifecycle status, with jobs spread across the 16-stage order
 * workflow (migration 00020). All money is computed through the real quote
 * engine (`src/lib/quote-engine.ts`) using the same per-style pricing
 * (`blind_style_components`) and hardware-tier resolution
 * (`hardware_size_rules`) as `/api/quotes/calculate`, so totals match what a
 * real "Generate Quote" click would produce.
 *
 * Nothing here hardcodes a hierarchy id — every blind selection is resolved
 * by NAME against the hierarchy fetched at runtime (`fetchBlindHierarchy`),
 * so the script survives Mike's ongoing edits in Admin > Blind Management.
 * If a name this script expects (e.g. a Style under an Opacity) has been
 * renamed or removed, the script dies loudly rather than silently seeding
 * an unpriceable window.
 *
 * Idempotent: each demo customer's properties/quotes/jobs are wiped and
 * recreated from scratch every run (`wipeCustomerData`), relying on the
 * FK cascade chain properties -> rooms/windows/quotes -> quote_line_items/
 * jobs -> job_assignments. Run with:
 *   npx tsx scripts/seed-demo.ts
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import {
  calculateAwningLineItem,
  calculateBlindDimensions,
  calculateLineItem,
  calculateQuoteTotals,
  resolveHardwareSpec,
} from '../src/lib/quote-engine'
import type { PricingParams } from '../src/lib/quote-engine'
import {
  fetchBlindHierarchy,
  componentsForStyle,
  findTypeByName,
  findOpacityByName,
  findStyleByName,
  findColourByName,
  findValanceByName,
  resolveStyleId,
} from '../src/lib/blind-hierarchy'
import type { BlindHierarchy } from '../src/lib/blind-hierarchy'
import { BLIND_TYPE_NAME_TO_PRODUCT_SLUG, WORKFLOW_STAGES, WORKFLOW_STAGE_ORDER } from '../src/lib/constants'
import type {
  AwningProduct,
  BlindType,
  BlindOpacity,
  BlindStyle,
  BlindColour,
  BlindValance,
  HardwareSizeRule,
  JobStatus,
  MountType,
  QuoteNote,
  StageHistoryEntry,
  UserRole,
  WorkflowStage,
} from '../src/types/database'

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

/** Logs a fatal error and exits the process — used for any condition that would otherwise leave a half-seeded, inconsistent demo dataset. */
function die(msg: string, error?: unknown): never {
  console.error(`FATAL: ${msg}`, error ?? '')
  process.exit(1)
}

// ---------------------------------------------------------------- users
/**
 * Ensures a demo auth user + profile exists, creating it via the Admin API
 * if missing. Idempotent — returns the existing profile id on a re-run
 * rather than erroring on a duplicate email.
 */
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

/**
 * Wipes a demo customer's entire property/quote/job history so the seeder
 * can recreate it from scratch. Relies on the FK cascade chain
 * properties -> rooms/windows/quotes -> quote_line_items/jobs ->
 * job_assignments (see migrations 00001/00012/00020) to clean up everything
 * anchored to a property; the explicit `jobs.customer_id` delete catches
 * pre-quote orders that have no property yet (workflow stages 1-2) and
 * would otherwise survive the property wipe.
 */
async function wipeCustomerData(customerId: string): Promise<void> {
  await admin.from('jobs').delete().eq('customer_id', customerId)
  await admin.from('properties').delete().eq('user_id', customerId)
}

// ---------------------------------------------------------------- blind selection
/** One window's blind selection, expressed as hierarchy NAMES (never ids) — resolved against the live hierarchy at seed time via {@link resolveBlindSelection}. */
interface BlindSelection {
  typeName: string
  opacityName: string
  styleName: string
  colourName: string
  valanceName?: string
}

interface ResolvedBlindSelection {
  type: BlindType
  opacity: BlindOpacity
  style: BlindStyle
  colour: BlindColour
  valance: BlindValance | null
}

/**
 * Resolves a demo window's hierarchy selection (Type/Opacity/Style/Colour/
 * Valance names) against the LIVE hierarchy fetched at runtime, dying loudly
 * if any link doesn't exist. This is what keeps the seed script honest
 * against Mike's ongoing Blind Management edits rather than silently
 * writing an orphaned name string the engine can never price.
 */
function resolveBlindSelection(hierarchy: BlindHierarchy, sel: BlindSelection): ResolvedBlindSelection {
  const type = findTypeByName(hierarchy, sel.typeName)
  if (!type) die(`blind type not found in live hierarchy: "${sel.typeName}"`)
  const opacity = findOpacityByName(hierarchy, type.id, sel.opacityName)
  if (!opacity) die(`opacity not found under "${sel.typeName}": "${sel.opacityName}"`)
  const style = findStyleByName(hierarchy, opacity.id, sel.styleName)
  if (!style) die(`style not found under "${sel.typeName}" / "${sel.opacityName}": "${sel.styleName}"`)
  const colour = findColourByName(hierarchy, style.id, sel.colourName)
  if (!colour) die(`colour not found under style "${sel.styleName}": "${sel.colourName}"`)
  const valance = sel.valanceName ? findValanceByName(hierarchy, type.id, sel.valanceName) : null
  if (sel.valanceName && !valance) die(`valance not found under "${sel.typeName}": "${sel.valanceName}"`)
  return { type, opacity, style, colour, valance }
}

// ---------------------------------------------------------------- windows/rooms/properties
interface DemoWindow {
  name: string
  /** Optional free-text notes (Batch 6's `windows.description`). */
  description?: string
  width: number
  height: number
  depth?: number
  mount: MountType
  /** Identical-window multiplier within its room (`windows.quantity`). Default 1. */
  quantity?: number
  /** Present for a blind window; absent for a bare/"future opportunity" window (zero-cost quote line). */
  blind?: BlindSelection
  /** Hardware component names to pre-exclude (`windows.excluded_components`), e.g. `['cassette']`. */
  excluded?: string[]
  /** Awning product key ("Make Model") into the awning lookup map — awnings still come from `awning_products`, unaffected by the blind hierarchy rework. */
  awning?: string
  awningColour?: string
}

interface DemoRoom {
  name: string
  /** Wholesale room-quantity multiplier (`rooms.quantity`). Default 1. */
  quantity?: number
  windows: DemoWindow[]
}

/**
 * Creates a property with its rooms and windows, resolving every window's
 * blind selection against the live hierarchy (`resolveBlindSelection`) and
 * its awning (if any) against the awning product map. Blind pricing no
 * longer comes from `products`/`components` (Batch 11 Part 1) — windows are
 * written with `product_id: null` and the Type/Opacity/Style/Colour/Valance
 * NAMES the quote engine resolves back to a Style's `blind_style_components`
 * at quote-generation time.
 */
async function recreateProperty(
  ownerId: string,
  createdBy: string,
  name: string,
  address: string,
  rooms: DemoRoom[],
  hierarchy: BlindHierarchy,
  awningIds: Map<string, AwningProduct>
): Promise<string> {
  const { data: property, error } = await admin
    .from('properties')
    .insert({ user_id: ownerId, created_by: createdBy, name, address })
    .select('id')
    .single()
  if (error || !property) die(`create property ${name}`, error)

  let windowCount = 0
  for (const room of rooms) {
    const { data: roomRow, error: roomError } = await admin
      .from('rooms')
      .insert({ property_id: property.id, name: room.name, quantity: room.quantity ?? 1 })
      .select('id')
      .single()
    if (roomError || !roomRow) die(`create room ${room.name}`, roomError)

    for (const w of room.windows) {
      const resolved = w.blind ? resolveBlindSelection(hierarchy, w.blind) : null
      const awning = w.awning ? awningIds.get(w.awning) : undefined
      if (w.awning && !awning) die(`unknown awning product "${w.awning}"`)

      const { error: winError } = await admin.from('windows').insert({
        room_id: roomRow.id,
        name: w.name,
        description: w.description ?? null,
        width_inches: w.width,
        height_inches: w.height,
        depth_inches: w.depth ?? null,
        mount_type: w.mount,
        has_blind: !!resolved,
        has_awning: !!awning,
        product_id: null,
        shade_type: resolved?.type.name ?? null,
        opacity: resolved?.opacity.name ?? null,
        style: resolved?.style.name ?? null,
        colour: resolved?.colour.name ?? null,
        valance: resolved?.valance?.name ?? null,
        awning_product_id: awning?.id ?? null,
        awning_colour: w.awningColour ?? null,
        excluded_components: w.excluded ?? [],
        quantity: w.quantity ?? 1,
      })
      if (winError) die(`create window ${w.name}`, winError)
      windowCount++
    }
  }

  console.log(`created property "${name}" (${rooms.length} rooms, ${windowCount} windows)`)
  return property.id
}

// ---------------------------------------------------------------- workflow helpers
/**
 * Maps a 16-stage `workflow_stage` down to the legacy 6-value `jobs.status`
 * enum, which migration 00020 keeps writable for backward compatibility —
 * `/jobs/calendar` still reads it. Mirrors the inverse of that migration's
 * own `status` -> `workflow_stage` backfill.
 */
function legacyStatusForStage(stage: WorkflowStage): JobStatus {
  switch (stage) {
    case 'request_received':
    case 'site_visit_done':
    case 'quote_complete':
    case 'quote_sent':
    case 'follow_up':
    case 'job_approved':
    case 'internal_order':
      return 'pending'
    case 'stock_check':
      return 'measure'
    case 'fabrication_scheduled':
    case 'production_complete':
      return 'fabricate'
    case 'installation_scheduled':
    case 'invoice_created':
    case 'invoice_sent':
      return 'install'
    case 'installation_complete':
    case 'payment_follow_up':
    case 'after_sales_follow_up':
      return 'complete'
  }
}

/**
 * Builds a plausible append-only `stage_history` for a job that has
 * progressed linearly from `request_received` up to `finalStage`, with
 * timestamps spread evenly between `endDaysAgo + spanDays` days ago (when
 * the job started) and `endDaysAgo` days ago (when it reached `finalStage`,
 * the last entry). Demo-only shortcut — in the real app, stages are
 * recorded one at a time by `advanceJobStage` (`src/lib/jobs.ts`) as staff
 * actually move a job.
 */
function buildStageHistory(
  finalStage: WorkflowStage,
  actorId: string,
  endDaysAgo: number,
  spanDays: number
): StageHistoryEntry[] {
  const endIdx = WORKFLOW_STAGE_ORDER[finalStage]
  const stages = WORKFLOW_STAGES.slice(0, endIdx + 1) as WorkflowStage[]
  const n = stages.length
  return stages.map((stage, i) => {
    const stepsFromEnd = n - 1 - i
    const daysAgoAtStage = endDaysAgo + (n > 1 ? (spanDays * stepsFromEnd) / (n - 1) : 0)
    return { stage, at: daysAgo(Math.round(daysAgoAtStage)), actor_id: actorId }
  })
}

// ---------------------------------------------------------------- quotes
interface JobScenario {
  finalStage: WorkflowStage
  /** How many days ago the job reached `finalStage` (drives `buildStageHistory` and the job's implicit "current" timestamp). */
  endDaysAgo: number
  /** How many days before `endDaysAgo` the job started (`request_received`); the intervening stages are spread evenly across this span. */
  spanDays: number
  scheduledDate?: string
  installNotes?: string
  assignees?: string[]
}

interface QuoteScenario {
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  createdDaysAgo: number
  sentDaysAgo?: number
  acceptedDaysAgo?: number
  declinedDaysAgo?: number
  declineReason?: string
  /** Days from creation until expiry (validity window). */
  validityDays?: number
  notes?: QuoteNote[]
  job?: JobScenario
}

/**
 * Generates one engine-accurate quote for a property — mirrors
 * `src/app/api/quotes/calculate/route.ts` line-for-line (same
 * `calculateLineItem`/`calculateAwningLineItem`/`calculateQuoteTotals`
 * calls, same width-based hardware-spec resolution via
 * `resolveHardwareSpec`, same room x window quantity snapshotting) so demo
 * totals match what a real "Generate Quote" click would produce. Also
 * creates the scenario's job (if any), stamped with a synthetic
 * `stage_history` via {@link buildStageHistory}.
 */
async function createQuote(
  propertyId: string,
  ownerId: string,
  ownerRole: UserRole,
  createdBy: string,
  acceptedBy: string | null,
  pricing: PricingParams,
  hierarchy: BlindHierarchy,
  hardwareRules: HardwareSizeRule[],
  scenario: QuoteScenario
): Promise<string> {
  const { data: windows, error: winError } = await admin
    .from('windows')
    .select(`
      id, name, width_inches, height_inches, mount_type,
      has_blind, has_awning,
      shade_type, style, colour, opacity, valance,
      awning_product_id, awning_colour, excluded_components, quantity,
      rooms!inner(name, property_id, quantity),
      awning_products(*)
    `)
    .eq('rooms.property_id', propertyId)
  if (winError || !windows?.length) die('load windows for quote', winError)

  interface Row {
    id: string
    name: string
    width_inches: number
    height_inches: number
    mount_type: MountType
    has_blind: boolean
    has_awning: boolean
    shade_type: string | null
    style: string | null
    colour: string | null
    opacity: string | null
    valance: string | null
    awning_product_id: string | null
    awning_colour: string | null
    excluded_components: string[]
    quantity: number
    rooms: { name: string; quantity: number } | { name: string; quantity: number }[]
    awning_products: AwningProduct | null
  }
  const getRoom = (w: Row): { name: string; quantity: number } => {
    const r = Array.isArray(w.rooms) ? w.rooms[0] : w.rooms
    return { name: r?.name ?? '', quantity: r?.quantity ?? 1 }
  }

  const lineItems: Record<string, unknown>[] = []
  const priceable: { costs: { line_total_usd: number }; units: number }[] = []

  for (const w of windows as unknown as Row[]) {
    const room = getRoom(w)
    const windowQuantity = Math.max(1, w.quantity)
    const roomQuantity = Math.max(1, room.quantity)
    const units = windowQuantity * roomQuantity
    let hasLine = false

    if (w.has_blind && w.style) {
      const windowConfig = {
        width_inches: Number(w.width_inches),
        height_inches: Number(w.height_inches),
        mount_type: w.mount_type,
      }
      const styleId = resolveStyleId(hierarchy, { shadeType: w.shade_type, opacity: w.opacity, style: w.style })
      const components = componentsForStyle(hierarchy, styleId)

      // Width-based hardware sizing (Batch 7 pre-work, rekeyed off the Type
      // name since blind pricing no longer flows through a tagged product —
      // Batch 11 Part 1).
      const blindWidth = calculateBlindDimensions(windowConfig).blind_width
      const hardwareSlug = w.shade_type ? BLIND_TYPE_NAME_TO_PRODUCT_SLUG[w.shade_type] : undefined
      const { spec: hardware_spec } = resolveHardwareSpec(hardwareSlug ?? null, blindWidth, hardwareRules)
      const matchedRule = hardware_spec
        ? hardwareRules.find(r => r.id === hardware_spec.rule_id) ?? null
        : null

      const r = calculateLineItem(windowConfig, components, w.excluded_components || [], matchedRule)
      priceable.push({ costs: { line_total_usd: r.costs.line_total_usd }, units })
      lineItems.push({
        window_id: w.id, product_id: null, awning_product_id: null, line_type: 'blind',
        room_name: room.name, window_name: w.name,
        blind_width: r.blind_width, blind_height: r.blind_height,
        fabric_area: r.fabric_area, chain_length: r.chain_length,
        shade_type: w.shade_type, style: w.style, colour: w.colour,
        opacity: w.opacity, valance: w.valance,
        hardware_spec, quantity: units, room_quantity: roomQuantity, window_quantity: windowQuantity,
        ...r.costs,
      })
      hasLine = true
    }

    if (w.has_awning && w.awning_product_id && w.awning_products) {
      const r = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
      priceable.push({ costs: { line_total_usd: r.costs.line_total_usd }, units })
      lineItems.push({
        window_id: w.id, product_id: null, awning_product_id: w.awning_product_id, line_type: 'awning',
        room_name: room.name, window_name: w.name,
        blind_width: r.awning_width, blind_height: r.awning_depth,
        fabric_area: r.material_area, chain_length: 0,
        shade_type: null, style: null, colour: w.awning_colour, opacity: null, valance: null,
        hardware_spec: null, quantity: units, room_quantity: roomQuantity, window_quantity: windowQuantity,
        cassette_cost: r.costs.frame_cost, tube_cost: 0, bottom_rail_cost: 0, chain_cost: 0,
        fabric_cost: r.costs.material_cost, fixed_costs: r.costs.fixed_cost,
        line_total_usd: r.costs.line_total_usd,
      })
      hasLine = true
    }

    if (!hasLine) {
      priceable.push({ costs: { line_total_usd: 0 }, units })
      lineItems.push({
        window_id: w.id, product_id: null, awning_product_id: null, line_type: 'zero',
        room_name: room.name, window_name: w.name,
        blind_width: Number(w.width_inches), blind_height: Number(w.height_inches),
        fabric_area: 0, chain_length: 0, shade_type: null, style: null, colour: null,
        opacity: null, valance: null, hardware_spec: null,
        quantity: units, room_quantity: roomQuantity, window_quantity: windowQuantity,
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
    const stage = scenario.job.finalStage
    const { data: job, error: jobError } = await admin
      .from('jobs')
      .insert({
        quote_id: quote.id,
        property_id: propertyId,
        customer_id: ownerId,
        status: legacyStatusForStage(stage),
        workflow_stage: stage,
        stage_history: buildStageHistory(stage, createdBy, scenario.job.endDaysAgo, scenario.job.spanDays),
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

  console.log(`  quote ${scenario.status} — TTD $${totals.grand_total_ttd.toFixed(2)} (${priceable.length} lines)${scenario.job ? ` + job @ ${scenario.job.finalStage}` : ''}`)
  return quote.id
}

/**
 * Creates a pre-quote order — a walk-in/inbound request that exists before
 * any quote (and possibly before any property) is on file, covering
 * workflow stages 1-2 (`request_received`, `site_visit_done`). `quote_id`
 * and `property_id` are nullable since migration 00020 for exactly this
 * case; `customer_id` is the anchor `chk_jobs_has_anchor` falls back to.
 */
async function createPreQuoteJob(
  customerId: string,
  createdBy: string,
  propertyId: string | null,
  stage: WorkflowStage,
  endDaysAgo: number,
  spanDays: number
): Promise<void> {
  const { error } = await admin.from('jobs').insert({
    quote_id: null,
    property_id: propertyId,
    customer_id: customerId,
    status: legacyStatusForStage(stage),
    workflow_stage: stage,
    stage_history: buildStageHistory(stage, createdBy, endDaysAgo, spanDays),
    created_by: createdBy,
  })
  if (error) die(`create pre-quote job (${stage})`, error)
  console.log(`  pre-quote job — ${stage}`)
}

// ---------------------------------------------------------------- main
async function main() {
  console.log('Seeding Finesse demo data (blind hierarchy + 16-stage workflow)...\n')

  // Users
  const ravi = await ensureUser('demo.sales@finessett.com', 'Ravi', 'Persad', 'salesman', '+1 868 555 0101')
  const anita = await ensureUser('demo.retail@finessett.com', 'Anita', 'Ramkissoon', 'retail_customer', '+1 868 555 0202')
  const dave = await ensureUser('demo.wholesale@finessett.com', 'Dave', 'Boodoo', 'wholesale_customer', '+1 868 555 0303')

  // Idempotent recreate: wipe each demo customer's properties/quotes/jobs
  // before rebuilding (cascade chain does the heavy lifting — see
  // `wipeCustomerData`).
  await wipeCustomerData(anita)
  await wipeCustomerData(dave)

  // Live blind hierarchy + hardware rules + pricing config, fetched at
  // runtime — never hardcoded, so this script survives Mike's Blind
  // Management edits. `activeOnly: false` mirrors the API route's
  // quote-generation fetch (an already-saved window's style must still
  // resolve even if since deactivated).
  const hierarchy = await fetchBlindHierarchy(admin, { activeOnly: false })
  const { data: hardwareRulesData } = await admin.from('hardware_size_rules').select('*')
  const hardwareRules = (hardwareRulesData ?? []) as HardwareSizeRule[]

  const { data: config } = await admin.from('pricing_config').select('*').eq('id', 1).single()
  if (!config) die('pricing config missing')
  const pricing: PricingParams = {
    exchange_rate: Number(config.exchange_rate),
    retail_markup_pct: Number(config.retail_markup_pct),
    wholesale_markup_pct: Number(config.wholesale_markup_pct),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
  }

  // Awnings still come from `awning_products` (untouched by the blind
  // hierarchy rework — only the blind pricing source moved).
  const { data: awnings } = await admin.from('awning_products').select('*')
  const awningIds = new Map<string, AwningProduct>()
  for (const a of (awnings ?? []) as AwningProduct[]) {
    awningIds.set(`${a.make} ${a.model}`, a)
  }

  console.log(
    `Live hierarchy: ${hierarchy.types.length} types / ${hierarchy.opacities.length} opacities / ` +
    `${hierarchy.styles.length} styles / ${hierarchy.colours.length} colours / ${hierarchy.valances.length} valances / ` +
    `${hierarchy.styleComponents.length} priced style-component rows / ${hardwareRules.length} hardware rules\n`
  )

  // ---- Retail: Anita — Maraval Residence ----
  // 3 rooms, 6 windows: a Dune, a Cellular blackout, a Horizontal, a Roller
  // Shade at 110" (falls in the 109-120" VTX 30 tier), a Neolux at 130"
  // (falls in the 121-144" tier — motorized), plus one bare "future
  // opportunity" window (zero-cost quote line). One window carries a
  // description; one has mount 'undecided'; one demonstrates a hardware
  // exclusion (cassette unchecked).
  const maraval = await recreateProperty(
    anita, ravi, 'Maraval Residence', '12 Saddle Road, Maraval',
    [
      {
        name: 'Living Room',
        windows: [
          {
            name: 'Bay Window', width: 72, height: 60, mount: 'outside',
            description: 'South-facing bay window, morning sun — client wants full privacy but soft light.',
            blind: { typeName: 'Dune', opacityName: 'Full Privacy', styleName: 'Aurora', colourName: 'T_White', valanceName: 'Fabric Pelmet' },
          },
          {
            name: 'Picture Window', width: 110, height: 54, mount: 'outside',
            blind: { typeName: 'Roller Shade', opacityName: 'Full Privacy', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'Round Cassette' },
          },
        ],
      },
      {
        name: 'Master Bedroom',
        windows: [
          {
            name: 'Master Window', width: 60, height: 48, depth: 3.5, mount: 'inside',
            blind: { typeName: 'Cellular', opacityName: 'Blackout', styleName: 'Noite', colourName: 'T_White', valanceName: 'None' },
            excluded: ['cassette'],
          },
          {
            name: 'Reading Nook Window', width: 36, height: 48, mount: 'undecided',
            blind: { typeName: 'Horizontal', opacityName: 'Full Privacy', styleName: 'Faux wood', colourName: 'T_White', valanceName: 'Yes' },
          },
        ],
      },
      {
        name: 'Kitchen',
        windows: [
          {
            name: 'Kitchen Window', width: 130, height: 40, mount: 'outside',
            blind: { typeName: 'Neolux Shade', opacityName: 'Dim out', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'Square Cassette' },
            awning: 'Sunbrella Canvas Classic', awningColour: 'forest green',
          },
          { name: 'Pantry Window', width: 20, height: 24, mount: 'outside' }, // future opportunity — zero-cost line, no blind/awning yet
        ],
      },
    ],
    hierarchy, awningIds
  )

  // ---- Wholesale: Dave — Price Plaza Hotel ----
  // Room-type x quantity showcase: Standard King Room x40 (2 windows, one
  // at window-quantity 2), Junior Suite x8 (2 windows), Lobby x1 (one
  // oversized 150" motorized Roller Shade). Covers Roller Shade / Neolux /
  // Sliding Panel.
  const pricePlaza = await recreateProperty(
    dave, ravi, 'Price Plaza Hotel', 'Price Plaza, Price Plaza Avenue, Chaguanas',
    [
      {
        name: 'Standard King Room', quantity: 40,
        windows: [
          {
            name: 'Window 1', width: 48, height: 60, mount: 'outside',
            blind: { typeName: 'Roller Shade', opacityName: 'Semi Privacy', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'Fabric Pelmet' },
          },
          {
            name: 'Window 2', width: 72, height: 84, mount: 'outside', quantity: 2,
            blind: { typeName: 'Sliding Panel', opacityName: 'Full Privacy', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'None' },
          },
        ],
      },
      {
        name: 'Junior Suite', quantity: 8,
        windows: [
          {
            name: 'Window 1', width: 84, height: 66, mount: 'outside',
            blind: { typeName: 'Neolux Shade', opacityName: 'Dim out', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'Round Cassette' },
          },
          {
            name: 'Window 2', width: 96, height: 84, mount: 'outside',
            blind: { typeName: 'Sliding Panel', opacityName: 'Blackout', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'Fabric Pelmet' },
          },
        ],
      },
      {
        name: 'Lobby', quantity: 1,
        windows: [
          {
            name: 'Storefront Window', width: 150, height: 96, mount: 'outside',
            blind: { typeName: 'Roller Shade', opacityName: 'Blackout', styleName: 'T_Standard', colourName: 'T_White', valanceName: 'Square Cassette' },
          },
        ],
      },
    ],
    hierarchy, awningIds
  )

  console.log('')

  // ---- Anita's quotes + jobs (retail lifecycle: accepted x3, sent, declined) ----
  console.log('Anita (retail) quotes:')
  await createQuote(maraval, anita, 'retail_customer', ravi, anita, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 30, sentDaysAgo: 29, acceptedDaysAgo: 25,
    job: { finalStage: 'job_approved', endDaysAgo: 25, spanDays: 3 },
  })
  await createQuote(maraval, anita, 'retail_customer', ravi, anita, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 20, sentDaysAgo: 19, acceptedDaysAgo: 15,
    job: {
      finalStage: 'installation_scheduled', endDaysAgo: 2, spanDays: 13,
      scheduledDate: dateAhead(3),
      installNotes: 'Ladder needed for the bay window. Park in the driveway.',
      assignees: [ravi],
    },
  })
  await createQuote(maraval, anita, 'retail_customer', ravi, anita, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 60, sentDaysAgo: 59, acceptedDaysAgo: 55,
    job: {
      finalStage: 'installation_complete', endDaysAgo: 7, spanDays: 48,
      scheduledDate: dateAgo(7),
      installNotes: 'Completed — customer very happy, all rooms done in one visit.',
      assignees: [ravi],
    },
  })
  await createQuote(maraval, anita, 'retail_customer', ravi, anita, pricing, hierarchy, hardwareRules, {
    status: 'sent', createdDaysAgo: 3, sentDaysAgo: 3,
    notes: [{ id: 'note_demo_1', text: 'Includes free removal of existing venetian blinds.', show_on_pdf: true }],
  })
  await createQuote(maraval, anita, 'retail_customer', ravi, anita, pricing, hierarchy, hardwareRules, {
    status: 'declined', createdDaysAgo: 25, sentDaysAgo: 24, declinedDaysAgo: 18,
    declineReason: 'Chose a cheaper local supplier for now — keep in touch for a future phase.',
  })

  // ---- Dave's quotes + jobs (wholesale lifecycle: accepted x6, draft, sent) ----
  console.log('Dave (wholesale) quotes:')
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 24, sentDaysAgo: 23, acceptedDaysAgo: 20,
    job: { finalStage: 'stock_check', endDaysAgo: 20, spanDays: 5 },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 22, sentDaysAgo: 21, acceptedDaysAgo: 18,
    job: { finalStage: 'fabrication_scheduled', endDaysAgo: 15, spanDays: 8 },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 24, sentDaysAgo: 23, acceptedDaysAgo: 20,
    job: { finalStage: 'production_complete', endDaysAgo: 10, spanDays: 15 },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 27, sentDaysAgo: 26, acceptedDaysAgo: 24,
    job: { finalStage: 'invoice_sent', endDaysAgo: 3, spanDays: 25, scheduledDate: dateAhead(1) },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 40, sentDaysAgo: 39, acceptedDaysAgo: 37,
    job: { finalStage: 'payment_follow_up', endDaysAgo: 10, spanDays: 35, scheduledDate: dateAgo(10) },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'accepted', createdDaysAgo: 55, sentDaysAgo: 54, acceptedDaysAgo: 52,
    job: { finalStage: 'after_sales_follow_up', endDaysAgo: 35, spanDays: 45, scheduledDate: dateAgo(35) },
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'draft', createdDaysAgo: 0,
  })
  await createQuote(pricePlaza, dave, 'wholesale_customer', ravi, dave, pricing, hierarchy, hardwareRules, {
    status: 'sent', createdDaysAgo: 8, sentDaysAgo: 8, validityDays: 10, // expires in ~2 days → "needs attention"
  })

  // ---- Pre-quote orders (16-stage workflow, stages 1-2) ----
  console.log('\nPre-quote orders:')
  await createPreQuoteJob(anita, ravi, null, 'request_received', 2, 0)
  await createPreQuoteJob(dave, ravi, pricePlaza, 'site_visit_done', 4, 2)

  // A little activity-feed colour.
  await admin.from('audit_logs').insert([
    { actor_id: ravi, action_type: 'quote_sent', target_table: 'quotes', change_summary: { demo: true } },
    { actor_id: ravi, action_type: 'quote_accepted', target_table: 'quotes', change_summary: { demo: true } },
    { actor_id: ravi, action_type: 'job_stage_advanced', target_table: 'jobs', change_summary: { demo: true } },
  ])

  console.log('\nDemo data ready.')
  console.log('  Users: 3 (1 salesman, 1 retail customer, 1 wholesale customer)')
  console.log('  Properties: 2 — Maraval Residence (3 rooms / 6 windows), Price Plaza Hotel (3 room types, quantities 40 / 8 / 1, 5 window configs)')
  console.log('  Quotes: 13 — Anita: 3 accepted / 1 sent / 1 declined. Dave: 6 accepted / 1 draft / 1 sent.')
  console.log('  Jobs: 11 across the 16-stage workflow — 2 pre-quote (request_received, site_visit_done) + 9 quote-linked')
  console.log('    (job_approved, installation_scheduled, installation_complete, stock_check, fabrication_scheduled,')
  console.log('     production_complete, invoice_sent, payment_follow_up, after_sales_follow_up)')
  console.log('  Job assignments: 2 (Ravi — installation_scheduled this week, installation_complete last week)')
  console.log('\nLogins (password Finesse4Blinds!):')
  console.log('  Salesman:  demo.sales@finessett.com')
  console.log('  Retail:    demo.retail@finessett.com')
  console.log('  Wholesale: demo.wholesale@finessett.com')
}

main().catch(e => die('unhandled', e))
