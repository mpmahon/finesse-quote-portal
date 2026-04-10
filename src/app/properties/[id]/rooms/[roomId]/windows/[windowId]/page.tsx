import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { WindowConfigurator } from '@/components/windows/window-configurator'

export default async function WindowConfigPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; windowId: string }>
}) {
  const { id, roomId, windowId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: property } = await supabase.from('properties').select('name').eq('id', id).single()
  if (!property) notFound()

  const { data: room } = await supabase.from('rooms').select('name').eq('id', roomId).single()
  if (!room) notFound()

  const { data: window } = await supabase.from('windows').select('*').eq('id', windowId).single()
  if (!window) notFound()

  const { data: products } = await supabase
    .from('products')
    .select('*, components(*)')
    .eq('is_active', true)
    .order('make')

  return (
    <div>
      <div className="mb-6">
        <Link href={`/properties/${id}/rooms/${roomId}`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to {room.name}
        </Link>
        <h1 className="text-2xl font-bold">Configure: {window.name}</h1>
        <p className="text-muted-foreground">
          {property.name} &gt; {room.name} &gt; {window.name}
        </p>
      </div>

      <WindowConfigurator
        window={window}
        products={products || []}
        propertyId={id}
        roomId={roomId}
      />
    </div>
  )
}
