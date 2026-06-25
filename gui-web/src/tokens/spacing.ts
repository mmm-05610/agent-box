/**
 * Spacing Design Tokens
 *
 * Based on a 4px grid system. All spacing values are multiples of 4px.
 *
 * Usage:
 *   import { space, radius, size } from '@/tokens/spacing'
 *   className="p-4 gap-2 rounded-lg"
 *
 * Tailwind mapping:
 *   space.xs = p-1 / gap-1  (4px)
 *   space.sm = p-2 / gap-2  (8px)
 *   space.md = p-3 / gap-3  (12px)
 *   space.lg = p-4 / gap-4  (16px)
 *   space.xl = p-6 / gap-6  (24px)
 *   space.2xl = p-8 / gap-8 (32px)
 *   space.3xl = p-12        (48px)
 */

/** Spacing scale (4px grid) */
export const space = {
  px: '1px',
  0: '0',
  0.5: '0.125rem', // 2px
  1: '0.25rem',    // 4px — xs
  1.5: '0.375rem', // 6px
  2: '0.5rem',     // 8px — sm
  2.5: '0.625rem', // 10px
  3: '0.75rem',    // 12px — md
  3.5: '0.875rem', // 14px
  4: '1rem',       // 16px — lg
  5: '1.25rem',    // 20px
  6: '1.5rem',     // 24px — xl
  7: '1.75rem',    // 28px
  8: '2rem',       // 32px — 2xl
  9: '2.25rem',    // 36px
  10: '2.5rem',    // 40px
  12: '3rem',      // 48px — 3xl
  14: '3.5rem',    // 56px
  16: '4rem',      // 64px
  20: '5rem',      // 80px
  24: '6rem',      // 96px
} as const

/** Border radius */
export const radius = {
  none: '0',
  sm: '0.25rem',   // 4px — badges, small elements
  md: '0.375rem',  // 6px — buttons, inputs
  lg: '0.5rem',    // 8px — cards
  xl: '0.75rem',   // 12px — modals, large cards
  '2xl': '1rem',   // 16px
  full: '9999px',  // pills, circles
} as const

/** Component sizes */
export const size = {
  // Sidebar
  sidebar: {
    width: '240px',
    widthCollapsed: '64px',
  },
  // Header
  header: {
    height: '56px',
  },
  // Buttons
  button: {
    sm: { height: '32px', paddingX: '12px' },
    md: { height: '36px', paddingX: '16px' },
    lg: { height: '40px', paddingX: '24px' },
  },
  // Inputs
  input: {
    sm: { height: '32px' },
    md: { height: '36px' },
    lg: { height: '40px' },
  },
  // Cards
  card: {
    padding: space[4], // 16px
    gap: space[3],     // 12px
  },
  // Rows
  row: {
    height: '56px',
    heightCompact: '40px',
  },
} as const

/** Shadows — subtle elevation system */
export const shadow = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  lg: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  xl: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
} as const

/** Transition durations */
export const transition = {
  fast: '100ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
} as const

/** Z-index layers */
export const zIndex = {
  base: 0,
  dropdown: 50,
  sticky: 100,
  modal: 200,
  popover: 300,
  toast: 400,
  tooltip: 500,
} as const
