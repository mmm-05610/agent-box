/**
 * Color Design Tokens
 *
 * Mirror the CSS custom properties in index.css. Single source of truth
 * is the CSS file; this object exists for:
 *   1. Programmatic access (animations, dynamic styles)
 *   2. Documentation
 *
 * All values use HSL components (no hsl() wrapper) so Tailwind's
 * `hsl(var(--…) / <alpha-value>)` syntax works.
 */

export const colors = {
  background: '36 14% 95%',
  foreground: '24 10% 10%',

  card: {
    DEFAULT: '0 0% 100%',
    foreground: '24 10% 10%',
    border: '30 6% 90%',
    hover: '36 14% 96%',
  },

  primary: {
    DEFAULT: '24 10% 10%',
    foreground: '36 14% 98%',
    hover: '24 10% 18%',
  },

  accent: {
    DEFAULT: '18 65% 55%',
    foreground: '0 0% 100%',
    subtle: '18 75% 94%',
  },

  muted: {
    DEFAULT: '30 6% 92%',
    foreground: '25 5% 45%',
  },

  destructive: {
    DEFAULT: '0 72% 51%',
    foreground: '0 0% 98%',
    hover: '0 72% 44%',
    subtle: '0 86% 97%',
  },

  success: {
    DEFAULT: '142 71% 45%',
    foreground: '0 0% 98%',
    subtle: '138 76% 96%',
  },

  warning: {
    DEFAULT: '32 95% 44%',
    foreground: '0 0% 98%',
    subtle: '48 100% 95%',
  },

  info: {
    DEFAULT: '221 83% 53%',
    foreground: '0 0% 98%',
    subtle: '214 95% 93%',
  },

  border: '30 6% 88%',
  input: '30 6% 88%',
  ring: '24 10% 10%',

  sidebar: {
    DEFAULT: '36 14% 97%',
    foreground: '24 10% 10%',
    accent: '30 6% 90%',
  },
} as const

/** Dark mode overrides */
export const colorsDark = {
  background: '24 10% 7%',
  foreground: '36 14% 95%',

  card: {
    DEFAULT: '24 10% 9%',
    foreground: '36 14% 95%',
    border: '24 8% 18%',
    hover: '24 8% 14%',
  },

  primary: {
    DEFAULT: '36 14% 95%',
    foreground: '24 10% 10%',
    hover: '36 14% 88%',
  },

  accent: {
    DEFAULT: '18 65% 60%',
    foreground: '24 10% 10%',
    subtle: '18 40% 16%',
  },

  muted: {
    DEFAULT: '24 8% 14%',
    foreground: '25 5% 60%',
  },

  destructive: {
    DEFAULT: '0 62% 45%',
    foreground: '0 0% 98%',
    hover: '0 62% 38%',
    subtle: '0 50% 15%',
  },

  success: {
    DEFAULT: '142 50% 50%',
    foreground: '0 0% 98%',
    subtle: '142 30% 14%',
  },

  warning: {
    DEFAULT: '32 70% 50%',
    foreground: '0 0% 98%',
    subtle: '32 30% 14%',
  },

  info: {
    DEFAULT: '217 60% 55%',
    foreground: '0 0% 98%',
    subtle: '217 30% 14%',
  },

  border: '24 8% 18%',
  input: '24 8% 18%',
  ring: '36 14% 80%',

  sidebar: {
    DEFAULT: '24 10% 6%',
    foreground: '36 14% 95%',
    accent: '24 8% 16%',
  },
} as const