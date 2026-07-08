import { Fragment } from 'react'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

/** One crumb in a {@link PageBreadcrumb} trail. Omit `href` for the current (non-clickable) page. */
export interface BreadcrumbSegment {
  label: string
  href?: string
}

interface PageBreadcrumbProps {
  segments: BreadcrumbSegment[]
  className?: string
}

/**
 * Shared drill-down breadcrumb trail used across Properties → Room → Window
 * and Quotes pages.
 *
 * Renders every segment except the last as a link; the last segment (the
 * current page) renders as plain text via `BreadcrumbPage`. Staff viewers
 * pass the property owner's name as one of the segments so the trail reads
 * e.g. "Properties › Anita Ramkissoon — Maraval Residence › Living Room".
 * Customers never see another customer's name because callers only include
 * the owner segment when the viewer is staff.
 */
export function PageBreadcrumb({ segments, className }: PageBreadcrumbProps) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="flex-nowrap overflow-x-auto whitespace-nowrap">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          return (
            <Fragment key={`${segment.label}-${index}`}>
              <BreadcrumbItem>
                {segment.href && !isLast ? (
                  <BreadcrumbLink render={<Link href={segment.href} />}>
                    {segment.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
