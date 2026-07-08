import { createClient } from '@/lib/supabase/server'
import { BlindHierarchyManager } from '@/components/admin/blind-hierarchy-manager'
import { HardwareSizeRulesManager } from '@/components/admin/hardware-size-rules-manager'
import { fetchBlindHierarchy } from '@/lib/blind-hierarchy'

/**
 * Blind Management (Batch 7): the dependent Type -> Opacity -> Style ->
 * Colour hierarchy (plus per-Type Valance/Finisher), replacing the old flat
 * shade_types/styles/colours vocabulary. Also hosts the Hardware Size
 * Rules editor. Make/model product tagging stays on Admin > Products.
 */
export default async function AdminCatalogPage() {
  const supabase = await createClient()

  const [hierarchy, { data: hardwareRules }] = await Promise.all([
    // Full hierarchy including inactive nodes — admins need to see and
    // reactivate deactivated options, unlike the customer-facing fetch.
    fetchBlindHierarchy(supabase, { activeOnly: false }),
    supabase.from('hardware_size_rules').select('*').order('blind_type').order('min_width_in'),
  ])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Blind Management</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage the dependent blind option hierarchy: pick a Type to see its Opacities and Valance/Finisher
        options, pick an Opacity to see its Styles, and pick a Style to see its Colours. These are the only
        values available when configuring a window, which prevents typos from creating duplicate categories.
        Many ranges are marked &quot;options pending&quot; until entered here.
      </p>
      <BlindHierarchyManager hierarchy={hierarchy} />

      <div className="mt-10">
        <h2 className="mb-2 text-xl font-semibold">Hardware Size Rules</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Width-based tube size and control type requirements per blind type (Roller Shade, Neolux). Applies to the FABRICATED blind width (window width + 6&quot; for outside/undecided mount, exact width for inside), not the raw window measurement. Leave the override columns blank unless a wider tube or motorized control changes the fabrication cost.
        </p>
        <HardwareSizeRulesManager rules={hardwareRules || []} />
      </div>
    </div>
  )
}
