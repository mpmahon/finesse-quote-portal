import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],

  /**
   * Redirects from the pre-Batch-1 `/dashboard` route to the new `/properties`
   * route. 308 (permanent) so browsers cache it and bookmarks keep working.
   * Separate entries for the bare path and any nested paths so deep links
   * (e.g. `/dashboard/something`) also end up under `/properties`.
   */
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/properties',
        permanent: true,
      },
      {
        source: '/dashboard/:path*',
        destination: '/properties/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
