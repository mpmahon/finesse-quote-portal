'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import type { LandingStyleTeaser } from '@/lib/landing-catalog'

/**
 * Public style-browsing teaser: a filterable taste of the Style Gallery
 * (static build-time data — the full gallery with live pricing sits behind
 * sign-in). Filter chips per blind Type; cards show the de-branded fabric
 * imagery, opacity, copy and colour range.
 */
export function StyleTeasers({ styles }: { styles: LandingStyleTeaser[] }) {
  const [typeFilter, setTypeFilter] = useState('All')

  const types = useMemo(
    () => ['All', ...Array.from(new Set(styles.map(s => s.type)))],
    [styles]
  )
  const filtered = typeFilter === 'All' ? styles : styles.filter(s => s.type === typeFilter)

  return (
    <div>
      {/* Type filter chips */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {types.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              typeFilter === t
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map(s => (
          <div key={`${s.type}-${s.opacity}-${s.name}`} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="relative h-40">
              <Image
                src={s.image}
                alt={`${s.type} — ${s.name}`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              />
              <Badge variant="secondary" className="absolute left-2 top-2">{s.type}</Badge>
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{s.name}</p>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.opacity}</span>
              </div>
              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{s.description}</p>
              {s.colours.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  {s.colours.map((hex, i) => (
                    <span
                      key={`${hex}-${i}`}
                      className="inline-block h-4 w-4 rounded-full border border-black/10"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link href="/auth/register">
          <Button size="lg" className="gap-2">
            See the full gallery &amp; get your price
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <p className="mt-3 text-sm text-muted-foreground">
          Create a free account to browse every style and colour with live pricing for your exact windows.
        </p>
      </div>
    </div>
  )
}
