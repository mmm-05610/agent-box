// Copy-in adapted from vercel/ai-elements `Shimmer`
// (https://github.com/vercel/ai-elements, packages/elements/src/shimmer.tsx
//  @ 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd). Apache License 2.0,
//  Copyright 2023 Vercel, Inc. Licence text recorded in
//  docs/desktop-product-delivery/evidence/P09.md.
//
// Local adaptation: the upstream component drives its gradient with
// `motion/react`. This renderer already owns its text-shimmer animation as the
// `.shimmer` CSS class, and `:root[data-renderer-animations-paused]` pauses
// that class whenever the window is hidden — a JS animation would step outside
// that discipline. The element/children/className shape is the copy-in's; only
// the animation substrate is this repo's. Upstream's `duration`/`spread` props
// are deliberately absent because the CSS animation owns the timing here.

import type { ElementType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface TextShimmerProps {
  /** Element to render. Defaults to a paragraph, matching the copy-in. */
  as?: ElementType
  children: ReactNode
  className?: string
}

export function Shimmer({ as: Component = 'p', children, className }: TextShimmerProps) {
  return <Component className={cn('shimmer inline-block', className)}>{children}</Component>
}
