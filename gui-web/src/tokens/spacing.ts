/**
 * Spacing & sizing design tokens
 *
 * Spacing: 4px grid
 * Radius: 4-step scale
 * Shadows: warm-tinted, subtle
 */

export const space = {
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px — xs
  1.5: '0.375rem',  // 6px
  2: '0.5rem',     // 8px — sm
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px — md
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px — lg
  5: '1.25rem',     // 20px
  6: '1.5rem',     // 24px — xl
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px — 2xl
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',     // 44px
  12: '3rem',        // 48px — 3xl
  14: '3.5rem',     // 56px
  16: '4rem',        // 64px
  20: '5rem',        // 80px
  24: '6rem',        // 96px
} as const

export const radius = {
  none: '0',
  sm: '0.25rem',    // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px — cards
  xl: '0.75rem',    // 12px — modals
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const

export const shadow = {
  none: 'none',
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.05)',
  md: '0 2px 4px -1px rgb(0 0 0 / 0.05), 0 4px 8px -2px rgb(0 0 0 / 0.06)',
  lg: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 10px 20px -4px rgb(0 0 0 / 0.08)',
  xl: '0 10px 15px -3px rgb(0 0 0 / 0.06), 0 20px 35px -8px rgb(0 0 0 / 0.10)',
} as const

export const transition = {
  fast: '120ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
} as const

export const zIndex = {
  base: 0,
  dropdown: 50,
  sticky: 100,
  modal: 200,
  popover: 300,
  toast: 400,
  tooltip: 500,
} as const

export const size = {
  sidebar: { width: '220px', widthCollapsed: '64px' },
  header: { height: '56px' },
  button: {
    sm: { height: '32px', paddingX: '12px' },
    md: { height: '36px', paddingX: '16px' },
    lg: { height: '40px', paddingX: '20px' },
  },
  input: { sm: { height: '32px' }, md: { height: '36px' }, lg: { height: '40px' } },
  card: { padding: space[4], gap: space[3] },
  row: { height: '56px', heightCompact: '40px' },
} as const