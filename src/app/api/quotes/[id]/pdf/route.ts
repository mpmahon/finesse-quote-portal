import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { QuotePDF } from '@/lib/pdf-generator'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, properties(name, address)')
    .eq('id', id)
    .single()

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', user.id)
    .single()

  const { data: lineItems } = await supabase
    .from('quote_line_items')
    .select('*, windows(excluded_components)')
    .eq('quote_id', id)
    .order('room_name')

  const buffer = await renderToBuffer(
    QuotePDF({
      quote,
      lineItems: lineItems || [],
      profile: profile || { first_name: '', last_name: '', email: '' },
    })
  )

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Finesse-Quote-${id.slice(0, 8)}.pdf"`,
    },
  })
}
