/**
 * Typography Design Tokens
 *
 * Font family, size, weight, and line height definitions.
 * Follows a modular type scale (1.25 ratio).
 *
 * Usage:
 *   import { font, fontSize, fontWeight } from '@/tokens/typography'
 *   className="font-sans text-base font-normal"
 */

/** Font family stacks */
export const fontFamily = {
  sans: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI Variable"',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
  ].join(', '),
  mono: [
    '"Cascadia Code"',
    '"Cascadia Mono"',
    '"JetBrains Mono"',
    '"Fira Code"',
    '"SF Mono"',
    'Consolas',
    '"Liberation Mono"',
    'Menlo',
    'monospace',
  ].join(', '),
} as const

/**
 * Font size scale (px → rem)
 * Base: 16px = 1rem
 */
export const fontSize = {
  xs: ['0.6875rem', { lineHeight: '1rem' }],      // 11px — micro
  sm: ['0.75rem', { lineHeight: '1rem' }],         // 12px — caption
  base: ['0.8125rem', { lineHeight: '1.25rem' }],  // 13px — body
  md: ['0.875rem', { lineHeight: '1.25rem' }],     // 14px — subtitle
  lg: ['1.0625rem', { lineHeight: '1.5rem' }],     // 17px — section title
  xl: ['1.375rem', { lineHeight: '1.75rem' }],     // 22px — page title
  '2xl': ['1.5rem', { lineHeight: '2rem' }],       // 24px
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],  // 30px
} as const

/** Font weight — Tkinter only supports normal/bold, but web has full range */
export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

/** Semantic typography presets (combine size + weight + tracking) */
export const typography = {
  // Page titles — 22px bold
  display: {
    fontSize: fontSize.xl[0],
    lineHeight: fontSize.xl[1].lineHeight,
    fontWeight: fontWeight.bold,
    letterSpacing: '-0.025em',
  },
  // Section titles — 17px semibold
  title: {
    fontSize: fontSize.lg[0],
    lineHeight: fontSize.lg[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: '-0.016em',
  },
  // Card/row titles — 14px medium
  subtitle: {
    fontSize: fontSize.md[0],
    lineHeight: fontSize.md[1].lineHeight,
    fontWeight: fontWeight.medium,
    letterSpacing: '0',
  },
  // Body text — 13px normal
  body: {
    fontSize: fontSize.base[0],
    lineHeight: fontSize.base[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: '0',
  },
  // Secondary text — 12px normal
  caption: {
    fontSize: fontSize.sm[0],
    lineHeight: fontSize.sm[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: '0',
  },
  // Tertiary text — 11px normal
  micro: {
    fontSize: fontSize.xs[0],
    lineHeight: fontSize.xs[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: '0.01em',
  },
  // Uppercase labels — 10px bold
  label: {
    fontSize: '0.625rem',
    lineHeight: '1rem',
    fontWeight: fontWeight.bold,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
} as const
