'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import type { LandingBanner } from '@/lib/landing-catalog'

const SLIDE_MS = 6000

/**
 * Public landing hero: auto-advancing sliding banner built from the
 * de-branded catalogue imagery (2026-07-16 batch). Each slide carries a
 * range headline + strapline; the CTA pair is constant (Get a Quote /
 * Browse Styles) so the journey is always one click away.
 */
export function HeroCarousel({ banners }: { banners: LandingBanner[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setIndex(i => (i + 1) % banners.length), SLIDE_MS)
    return () => clearInterval(t)
  }, [banners.length])

  return (
    <section className="relative overflow-hidden">
      {/* Slides: stacked, cross-faded. All rendered so Next preloads them and the fade is seamless. */}
      <div className="relative h-[520px] sm:h-[560px]">
        {banners.map((b, i) => (
          <div
            key={b.image}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: i === index ? 1 : 0 }}
            aria-hidden={i !== index}
          >
            <Image
              src={b.image}
              alt={b.title}
              fill
              priority={i === 0}
              className="object-cover"
              sizes="100vw"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.18_0.02_250/0.82)] via-[oklch(0.2_0.03_255/0.6)] to-[oklch(0.25_0.04_260/0.35)]" />

        <div className="container relative mx-auto flex h-full items-center px-4">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-200/90">
              Blinds &amp; Awnings, Made to Measure
            </p>
            {/* Slide-specific headline */}
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {banners[index].title}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-blue-100/85">
              {banners[index].line}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/register">
                <Button size="lg" className="w-full gap-2 text-base sm:w-auto">
                  Get a Quote
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#styles">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-white/30 bg-transparent text-base text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  Browse Styles
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Dots */}
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
          {banners.map((b, i) => (
            <button
              key={b.image}
              aria-label={`Show slide: ${b.title}`}
              onClick={() => setIndex(i)}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-white' : 'w-2.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
