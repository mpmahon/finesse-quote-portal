import { createClient } from '@/lib/supabase/server'
import { AwningProductManager } from '@/components/admin/awning-product-manager'

export default async function AdminAwningProductsPage() {
  const supabase = await createClient()

  const [
    { data: products },
    { data: colours },
  ] = await Promise.all([
    supabase.from('awning_products').select('*').order('make'),
    supabase.from('colours').select('*').eq('is_active', true).order('name'),
  ])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Awning Products</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Each awning has a fixed depth and pricing in three parts: frame (per inch of width), material (per square inch of awning area), and a flat fixed cost for brackets/arms/motor.
      </p>
      <AwningProductManager
        products={products || []}
        colourOptions={(colours || []).map(c => c.name)}
      />
    </div>
  )
}
