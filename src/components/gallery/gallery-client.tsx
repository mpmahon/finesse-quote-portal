'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Blinds, Umbrella } from 'lucide-react'

export interface GalleryCard {
  id: string
  kind: 'blind' | 'awning'
  make: string
  model: string
  image_url: string | null
  shade_types: string[]
  styles: string[]
  colours: { name: string; hex: string | null }[]
  /** Indicative TTD price for a standard 36×48 window (viewer's customer tier). */
  from_ttd: number | null
}

interface GalleryClientProps {
  cards: GalleryCard[]
  isStaff: boolean
}

/** Filterable product grid: shade type / style / colour, images + swatches + indicative pricing. */
export function GalleryClient({ cards, isStaff }: GalleryClientProps) {
  const [shadeType, setShadeType] = useState('all')
  const [style, setStyle] = useState('all')
  const [colour, setColour] = useState('all')

  const options = useMemo(() => {
    const shadeTypes = new Set<string>()
    const styles = new Set<string>()
    const colours = new Set<string>()
    for (const c of cards) {
      c.shade_types.forEach(s => shadeTypes.add(s))
      c.styles.forEach(s => styles.add(s))
      c.colours.forEach(col => colours.add(col.name))
    }
    return {
      shadeTypes: Array.from(shadeTypes).sort(),
      styles: Array.from(styles).sort(),
      colours: Array.from(colours).sort(),
    }
  }, [cards])

  const filtered = cards.filter(c =>
    (shadeType === 'all' || c.shade_types.includes(shadeType)) &&
    (style === 'all' || c.styles.includes(style)) &&
    (colour === 'all' || c.colours.some(col => col.name === colour))
  )

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FilterSelect label="Shade type" value={shadeType} onChange={setShadeType} options={options.shadeTypes} />
        <FilterSelect label="Style" value={style} onChange={setStyle} options={options.styles} />
        <FilterSelect label="Colour" value={colour} onChange={setColour} options={options.colours} />
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No styles match those filters.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(card => (
            <Card key={`${card.kind}-${card.id}`} className="overflow-hidden pt-0">
              {/* Image / placeholder */}
              <div className="relative flex h-44 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={`${card.make} ${card.model}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : card.kind === 'awning' ? (
                  <Umbrella className="h-12 w-12 text-slate-400" />
                ) : (
                  <Blinds className="h-12 w-12 text-slate-400" />
                )}
                <Badge variant="secondary" className="absolute left-2 top-2 capitalize">
                  {card.kind}
                </Badge>
              </div>

              <CardContent className="space-y-3 pt-4">
                <div>
                  <p className="font-semibold">{card.make} {card.model}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...card.shade_types, ...card.styles.filter(s => s !== 'awning')].slice(0, 4).map(s => (
                      <Badge key={s} variant="outline" className="text-[11px] capitalize">{s}</Badge>
                    ))}
                  </div>
                </div>

                {/* Colour swatches */}
                {card.colours.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {card.colours.slice(0, 8).map(c => (
                      <span
                        key={c.name}
                        title={c.name}
                        className="inline-block h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: c.hex || '#e2e8f0' }}
                      />
                    ))}
                    {card.colours.length > 8 && (
                      <span className="text-[11px] text-muted-foreground">+{card.colours.length - 8}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-sm">
                    {card.from_ttd !== null ? (
                      <>
                        <span className="text-muted-foreground">from ~</span>
                        <span className="font-semibold text-primary">TTD ${card.from_ttd.toFixed(0)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Price on request</span>
                    )}
                  </p>
                  {isStaff && (
                    <Link href="/properties?new=true">
                      <Button size="sm" variant="outline">Quote this style</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <Select value={value} onValueChange={v => onChange(v ?? 'all')}>
      <SelectTrigger>
        <SelectValue>
          {(v: string) => (v === 'all' ? `${label}: All` : `${label}: ${v}`)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}s</SelectItem>
        {options.map(o => (
          <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
