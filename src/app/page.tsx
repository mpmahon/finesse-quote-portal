import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-bold">Finesse</h1>
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
      <main className="flex flex-1 items-center justify-center">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Automated Blinds &amp; Awnings Quotes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Enter your window dimensions, choose your finishes, and get instant pricing
            with detailed breakdowns for every room in your property.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/auth/register">
              <Button size="lg">Start Your Quote</Button>
            </Link>
            <Link href="/auth/login">
              <Button size="lg" variant="outline">Sign In</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
