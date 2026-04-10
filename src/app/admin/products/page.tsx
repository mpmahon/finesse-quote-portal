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
    supabase.from('shade_types').select('*').eq('is_active', true).order('name'),
    supabase.from('styles').select('*').eq('is_active', true).order('name'),
    supabase.from('colours').select('*').eq('is_active', true).order('name'),
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
