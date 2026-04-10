import { createClient } from '@/lib/supabase/server'
import { CatalogManager } from '@/components/admin/catalog-manager'

export default async function AdminCatalogPage() {
  const supabase = await createClient()

  const [
    { data: shadeTypes },
    { data: styles },
    { data: colours },
  ] = await Promise.all([
    supabase.from('shade_types').select('*').order('name'),
    supabase.from('styles').select('*').order('name'),
    supabase.from('colours').select('*').order('name'),
  ])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Catalog</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage the master list of shade types, styles, and colours. These are the only values available when configuring products, which prevents typos from creating duplicate categories.
      </p>
      <CatalogManager
        shadeTypes={shadeTypes || []}
        styles={styles || []}
        colours={colours || []}
      />
    </div>
  )
}
