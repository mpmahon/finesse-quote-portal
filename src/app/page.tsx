import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ArrowRight, FileText, UserPlus, Home as HomeIcon, Palette } from 'lucide-react'
import { HeroCarousel } from '@/components/landing/hero-carousel'
import { StyleTeasers } from '@/components/landing/style-teasers'
import { LANDING_BANNERS, LANDING_TYPES, LANDING_STYLES } from '@/lib/landing-catalog'

/** Real Finesse installation photos shown in the landing-page gallery strip. */
const INSTALLATION_PHOTOS = [
  { src: '/images/marketing/Installation03.jpg', alt: 'Layered zebra shades in a bedroom' },
  { src: '/images/marketing/Installation05.jpg', alt: 'Motorised roller shades in a modern living room' },
  { src: '/images/marketing/Installation07.jpg', alt: 'Zebra shades across an open-plan living and dining area' },
  { src: '/images/marketing/Installation09.jpg', alt: 'Zebra shades in a bathroom with a freestanding tub' },
  { src: '/images/marketing/Installation13.jpg', alt: 'Roman shades and drapery in a waterfront living room' },
]

/**
 * Public teaser landing page (client request 2026-07-16): sliding banners,
 * range browsing and style teasers built from the de-branded supplier
 * catalogue (2026-07-16 batch), with "Get a Quote" introducing the account →
 * property → windows → quote journey. All imagery is rehosted locally; no
 * supplier identity appears anywhere client-facing.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="Finesse" width={40} height={40} className="rounded" />
            <span className="text-xl font-bold tracking-tight">Finesse</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#range" className="hover:text-foreground">Our Range</a>
            <a href="#styles" className="hover:text-foreground">Styles &amp; Colours</a>
            <a href="#how" className="hover:text-foreground">How It Works</a>
          </nav>
          <div className="flex gap-2">
            <Link href="/auth/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/auth/register">
              <Button>Get a Quote</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Sliding banner hero */}
      <HeroCarousel banners={LANDING_BANNERS} />

      {/* Our Range — blind type + exterior teaser cards */}
      <section id="range" className="container mx-auto scroll-mt-20 px-4 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Our Range</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Six families of interior blinds plus a full exterior programme — every one made to
          measure for your windows.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {LANDING_TYPES.map(t => (
            <div key={t.name} className="group relative h-56 overflow-hidden rounded-xl border shadow-sm">
              {t.image ? (
                <Image
                  src={t.image}
                  alt={t.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="font-semibold text-white">{t.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/75">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Style & colour browsing teaser */}
      <section id="styles" className="scroll-mt-20 border-t bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Styles &amp; Colours</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            A taste of the collection — over forty styles and two hundred colourways,
            from airy solar screens to total blackout.
          </p>
          <div className="mt-10">
            <StyleTeasers styles={LANDING_STYLES} />
          </div>
        </div>
      </section>

      {/* How It Works — the quote journey */}
      <section id="how" className="container mx-auto scroll-mt-20 px-4 py-20">
        <h2 className="mb-3 text-center text-2xl font-bold sm:text-3xl">From Window to Quote in Minutes</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          Sign up free, describe your property, and price your blinds room by room —
          then send the quote to us when you&apos;re ready.
        </p>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">1. Create an account</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Free sign-up — your properties, measurements and quotes stay saved for next time.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <HomeIcon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">2. Add your property</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Set up rooms and windows with dimensions and mount preferences — guided at every step.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Palette className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">3. Choose your styles</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Pick the blind type, opacity, style and colour per window with live price previews.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">4. Get your quote</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Generate a detailed room-by-room quote, download the PDF, and accept when you&apos;re ready.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <Link href="/auth/register">
            <Button size="lg" className="gap-2 text-base">
              Start Your Quote
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Installation gallery — real Finesse jobs */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-2xl font-bold sm:text-3xl">Recent Installations</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {INSTALLATION_PHOTOS.map(photo => (
              <div key={photo.src} className="group relative aspect-square overflow-hidden rounded-xl shadow-sm">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t bg-muted/50 py-8">
        <div className="container mx-auto flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.jpg" alt="Finesse" width={24} height={24} className="rounded" />
            <span className="text-sm font-medium">Finesse</span>
          </div>
          <p className="text-xs text-muted-foreground">Blinds &amp; Awnings Quote Portal</p>
        </div>
      </footer>
    </div>
  )
}
