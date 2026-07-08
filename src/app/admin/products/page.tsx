import { createClient } from '@/lib/supabase/server'
import { ProductManager } from '@/components/admin/product-manager'

export default async function AdminProductsPage() {
  const supabase = await createClient()

  const [
    { data: products },
    { data: shadeTypes },
    { data: styles },
    { data: colours },
  ] = await Promise.all([
    supabase.from('products').select('*, components(*)').order('make'),
    // Batch 7: `shade_types`/`styles`/`colours` were renamed to
    // `legacy_shade_types`/`legacy_styles`/`legacy_colours` when the
    // Type -> Opacity -> Style -> Colour hierarchy replaced them for window
    // configuration. products.shade_types/styles/colours are legacy
    // free-text tags left untouched (not linked to the new hierarchy yet —
    // see the design spec's open question 2) — still sourced from the
    // legacy tables so this admin form keeps working for historical data.
    supabase.from('legacy_shade_types').select('*').eq('is_active', true).order('name'),
    supabase.from('legacy_styles').select('*').eq('is_active', true).order('name'),
    supabase.from('legacy_colours').select('*').eq('is_active', true).order('name'),
  ])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Product Management</h1>
      <ProductManager
        products={products || []}
        shadeTypeOptions={(shadeTypes || []).map(s => s.name)}
        styleOptions={(styles || []).map(s => s.name)}
        colourOptions={(colours || []).map(c => c.name)}
      />
    </div>
  )
}
