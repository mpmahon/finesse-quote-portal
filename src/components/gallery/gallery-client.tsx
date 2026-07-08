'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Blinds, Umbrella } from 'lucide-react'
import {
  QuoteFromStyleDialog,
  type CustomerOption,
  type PropertyOption,
} from '@/components/gallery/quote-from-style-dialog'
import type { StyleQuerySource } from '@/lib/gallery-style-query'

export interface GalleryCard {
  id: string
  kind: 'blind' | 'awning'
  make: string
  model: string
  image_url: string | null
  shade_types: string[]
  styles: string[]
  colours: { name: string; hex: string | null }[]
  /** Batch 11 Part 1: the blind's hierarchy Type NAME directly (every style has a real Type — no more slug indirection). Awning cards are always null — they filter under their own "Awning" bucket. */
  blind_type: string | null
  /** Indicative TTD price for a standard 36×48 window (viewer's customer tier). */
  from_ttd: number | null
}

const OTHER_UNMAPPED = 'Other / Unmapped'
const AWNING_CATEGORY = 'Awning'

/**
 * A card's Blind Type filter category: the hierarchy Type name for blind
 * cards (every style resolves to a real Type since Batch 11 Part 1), or
 * "Awning" for awning cards. "Other / Unmapped" is a defensive fallback for
 * the unexpected case of a style whose parent chain doesn't resolve (e.g. a
 * soft-deleted opacity/type) — it should not occur in practice.
 */
function blindTypeCategory(card: GalleryCard): string {
  if (card.kind === 'awning') return AWNING_CATEGORY
  return card.blind_type ?? OTHER_UNMAPPED
}

interface GalleryClientProps {
  cards: GalleryCard[]
  isStaff: boolean
  /** All retail + wholesale customers. Only populated when isStaff=true. */
  customers?: CustomerOption[]
  /** All properties (id/name/address/owner). Only populated when isStaff=true. */
  properties?: PropertyOption[]
}

/** Filterable product grid: Blind Type (Batch 7), images + swatches + indicative pricing. */
export function GalleryClient({ cards, isStaff, customers = [], properties = [] }: GalleryClientProps) {
  const [typeFilter, setTypeFilter] = useState('all')

  // "Quote from style" (staff only): which card triggered the picker, and
  // the resolved query-param values to carry through to the configurator.
  const [styleSelection, setStyleSelection] = useState<StyleQuerySource>(null)

  /**
   * Builds the gallery→configurator hand-off values for a card and opens the
   * customer/property picker. Batch 11 Part 1: blind cards ARE styles now,
   * so their id IS the Style id the configurator needs — no more name
   * matching against the hierarchy.
   */
  function openQuoteFromStyle(card: GalleryCard) {
    const values: Record<string, string> = { kind: card.kind }
    if (card.kind === 'blind') {
      values.styleId = card.id
    } else {
      values.awningProductId = card.id
    }
    setStyleSelection(values)
  }

  /** Blind Type filter options, derived from the cards actually present (only categories with at least one card are offered). */
  const typeOptions = useMemo(() => {
    const categories = new Set<string>()
    for (const c of cards) categories.add(blindTypeCategory(c))
    return Array.from(categories).sort()
  }, [cards])

  const filtered = cards.filter(c => typeFilter === 'all' || blindTypeCategory(c) === typeFilter)

  return (
    <>
      <div className="mb-6 max-w-xs">
        <FilterSelect label="Blind type" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
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
                    <Button size="sm" variant="outline" onClick={() => openQuoteFromStyle(card)}>
                      Quote this style
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isStaff && (
        <QuoteFromStyleDialog
          styleSelection={styleSelection}
          open={styleSelection !== null}
          onOpenChange={open => { if (!open) setStyleSelection(null) }}
          customers={customers}
          properties={properties}
        />
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
