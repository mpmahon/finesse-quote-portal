import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ArrowRight, Ruler, Calculator, FileText } from 'lucide-react'

/** Real Finesse installation photos shown in the landing-page gallery strip. */
const INSTALLATION_PHOTOS = [
  { src: '/images/marketing/Installation03.jpg', alt: 'Layered zebra shades in a bedroom' },
  { src: '/images/marketing/Installation05.jpg', alt: 'Motorised roller shades in a modern living room' },
  { src: '/images/marketing/Installation07.jpg', alt: 'Zebra shades across an open-plan living and dining area' },
  { src: '/images/marketing/Installation09.jpg', alt: 'Zebra shades in a bathroom with a freestanding tub' },
  { src: '/images/marketing/Installation13.jpg', alt: 'Roman shades and drapery in a waterfront living room' },
]

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
          <div className="flex gap-2">
            <Link href="/auth/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/auth/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — real installation photo as background, dark gradient overlay for text contrast */}
      <section className="relative overflow-hidden">
        <Image
          src="/images/marketing/Banner.jpg"
          alt="Finesse motorised awning installation overlooking the ocean"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.18_0.02_250/0.92)] to-[oklch(0.25_0.04_260/0.85)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,oklch(0.55_0.18_250/0.15),transparent_70%)]" />
        <div className="container relative mx-auto px-4 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Image src="/logo.jpg" alt="Finesse" width={80} height={80} className="mx-auto mb-8 rounded-xl shadow-lg" />
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Professional Blinds &amp; Awnings Quotes
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-blue-100/80">
              Enter your window dimensions, choose your finishes, and get instant pricing
              with detailed per-room breakdowns. From measurement to quote in minutes.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href="/auth/register">
                <Button size="lg" className="w-full gap-2 text-base sm:w-auto">
                  Start Your Quote
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/auth/login">
                {/* bg-transparent: the outline variant defaults to bg-background (white), which made the white label invisible on the dark hero */}
                <Button size="lg" variant="outline" className="w-full border-white/30 bg-transparent text-base text-white hover:bg-white/10 hover:text-white sm:w-auto">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="mb-12 text-center text-2xl font-bold sm:text-3xl">How It Works</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Ruler className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">1. Measure</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Add your properties and rooms, then enter window dimensions with mount type preferences.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">2. Configure</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Choose from premium blind makes and models. Select shade types, styles, and colours with live cost previews.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">3. Quote</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Generate detailed quotes with per-component breakdowns, export to PDF, and share with clients.
            </p>
          </div>
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
