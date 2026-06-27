/**
 * Typography Design Tokens
 *
 * Font family, size, weight, and line height definitions.
 * Hierarchy driven by size + weight, not by raw color.
 *
 * Usage:
 *   import { fontSize, fontWeight, typography } from '@/tokens/typography'
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
    '"JetBrains Mono"',
    '"Cascadia Code"',
    '"Cascadia Mono"',
    '"SF Mono"',
    'Menlo',
    'Consolas',
    '"Liberation Mono"',
    'monospace',
  ].join(', '),
} as const

/**
 * Font size scale (px → rem)
 * Base: 16px = 1rem
 *
 * Hierarchy (use these consistently):
 *   display  - Page hero / welcome (30px)
 *   title    - Section heading within a page (18px)
 *   subtitle - Card title / row heading (14px)
 *   body     - Default paragraph (13px)
 *   caption  - Secondary text / metadata (12px)
 *   micro    - Tertiary / timestamps (11px)
 */
export const fontSize = {
  xs: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],         // 11px — micro
  sm: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.005em' }],       // 12px — caption
  base: ['0.8125rem', { lineHeight: '1.375rem', letterSpacing: '-0.003em' }],  // 13px — body
  md: ['0.875rem', { lineHeight: '1.375rem', letterSpacing: '-0.005em' }],     // 14px — subtitle
  lg: ['1.0625rem', { lineHeight: '1.625rem', letterSpacing: '-0.012em' }],   // 17px — title
  xl: ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.018em' }],     // 22px — display
  '2xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.022em' }],   // 28px
  '3xl': ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.025em' }],      // 32px — display+
  '4xl': ['2.5rem', { lineHeight: '3rem', letterSpacing: '-0.028em' }],         // 40px
} as const

/** Font weight — web side has full range, Tk side is binary */
export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

/** Semantic typography presets (combine size + weight + tracking) */
export const typography = {
  display: {
    fontSize: fontSize['3xl'][0],
    lineHeight: fontSize['3xl'][1].lineHeight,
    fontWeight: fontWeight.bold,
    letterSpacing: fontSize['3xl'][1].letterSpacing,
  },
  title: {
    fontSize: fontSize.lg[0],
    lineHeight: fontSize.lg[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: fontSize.lg[1].letterSpacing,
  },
  subtitle: {
    fontSize: fontSize.md[0],
    lineHeight: fontSize.md[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: fontSize.md[1].letterSpacing,
  },
  body: {
    fontSize: fontSize.base[0],
    lineHeight: fontSize.base[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: fontSize.base[1].letterSpacing,
  },
  caption: {
    fontSize: fontSize.sm[0],
    lineHeight: fontSize.sm[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: fontSize.sm[1].letterSpacing,
  },
  micro: {
    fontSize: fontSize.xs[0],
    lineHeight: fontSize.xs[1].lineHeight,
    fontWeight: fontWeight.medium,
    letterSpacing: fontSize.xs[1].letterSpacing,
    textTransform: 'uppercase' as const,
  },
} as const