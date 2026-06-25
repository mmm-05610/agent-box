/**
 * Color Design Tokens
 *
 * Based on shadcn/ui Zinc palette + cc-switch style.
 * All colors are semantic tokens — never use raw hex values directly.
 *
 * Usage:
 *   import { colors } from '@/tokens/colors'
 *   className="bg-background text-foreground"
 *
 * Or via Tailwind classes that reference these tokens.
 */

export const colors = {
  // ── Backgrounds ─────────────────────────────────────────────────────
  background: {
    DEFAULT: 'hsl(0 0% 100%)',       // Main background
    subtle: 'hsl(240 4.8% 95.9%)',   // Subtle background variation
    muted: 'hsl(240 4.8% 95.9%)',    // Muted background
  },

  // ── Foreground (text) ───────────────────────────────────────────────
  foreground: {
    DEFAULT: 'hsl(240 10% 3.9%)',    // Primary text
    muted: 'hsl(240 3.8% 46.1%)',    // Secondary text
    subtle: 'hsl(240 5% 64.9%)',     // Tertiary text
    inverse: 'hsl(0 0% 98%)',        // Text on dark backgrounds
  },

  // ── Card / Surface ──────────────────────────────────────────────────
  card: {
    DEFAULT: 'hsl(0 0% 100%)',       // Card background
    foreground: 'hsl(240 10% 3.9%)', // Card text
    border: 'hsl(240 5.9% 90%)',     // Card border
    hover: 'hsl(240 4.8% 95.9%)',    // Card hover state
  },

  // ── Primary (brand) ─────────────────────────────────────────────────
  primary: {
    DEFAULT: 'hsl(240 5.9% 10%)',    // Primary button bg (dark)
    foreground: 'hsl(0 0% 98%)',     // Primary button text
    hover: 'hsl(240 5.9% 20%)',      // Primary hover
  },

  // ── Secondary ───────────────────────────────────────────────────────
  secondary: {
    DEFAULT: 'hsl(240 4.8% 95.9%)',  // Secondary button bg
    foreground: 'hsl(240 5.9% 10%)', // Secondary button text
    hover: 'hsl(240 4.8% 90%)',      // Secondary hover
  },

  // ── Muted ───────────────────────────────────────────────────────────
  muted: {
    DEFAULT: 'hsl(240 4.8% 95.9%)',  // Muted element bg
    foreground: 'hsl(240 3.8% 46.1%)', // Muted text
  },

  // ── Accent ──────────────────────────────────────────────────────────
  accent: {
    DEFAULT: 'hsl(240 4.8% 95.9%)',  // Accent bg
    foreground: 'hsl(240 5.9% 10%)', // Accent text
  },

  // ── Destructive (danger) ────────────────────────────────────────────
  destructive: {
    DEFAULT: 'hsl(0 84.2% 60.2%)',   // Red button bg
    foreground: 'hsl(0 0% 98%)',     // Red button text
    hover: 'hsl(0 72% 51%)',         // Red hover
    subtle: 'hsl(0 86% 97%)',        // Light red bg
  },

  // ── Success ─────────────────────────────────────────────────────────
  success: {
    DEFAULT: 'hsl(142 76% 36%)',     // Green
    foreground: 'hsl(0 0% 98%)',
    subtle: 'hsl(144 76% 94%)',      // Light green bg
  },

  // ── Warning ─────────────────────────────────────────────────────────
  warning: {
    DEFAULT: 'hsl(38 92% 50%)',      // Amber/orange
    foreground: 'hsl(0 0% 98%)',
    subtle: 'hsl(48 96% 89%)',       // Light amber bg
  },

  // ── Info ────────────────────────────────────────────────────────────
  info: {
    DEFAULT: 'hsl(217 91% 60%)',     // Blue
    foreground: 'hsl(0 0% 98%)',
    subtle: 'hsl(214 95% 93%)',      // Light blue bg
  },

  // ── Border / Input / Ring ───────────────────────────────────────────
  border: 'hsl(240 5.9% 90%)',
  input: 'hsl(240 5.9% 90%)',
  ring: 'hsl(240 5.9% 10%)',

  // ── Sidebar ─────────────────────────────────────────────────────────
  sidebar: {
    DEFAULT: 'hsl(240 4.8% 95.9%)',  // Sidebar bg
    foreground: 'hsl(240 5.9% 10%)', // Sidebar text
    accent: 'hsl(240 4.8% 90%)',     // Sidebar active item
  },
} as const

/** Dark mode overrides — same structure, different values */
export const colorsDark = {
  background: {
    DEFAULT: 'hsl(240 10% 3.9%)',
    subtle: 'hsl(240 3.7% 15.9%)',
    muted: 'hsl(240 3.7% 15.9%)',
  },
  foreground: {
    DEFAULT: 'hsl(0 0% 98%)',
    muted: 'hsl(240 5% 64.9%)',
    subtle: 'hsl(240 5% 44.9%)',
    inverse: 'hsl(240 10% 3.9%)',
  },
  card: {
    DEFAULT: 'hsl(240 10% 3.9%)',
    foreground: 'hsl(0 0% 98%)',
    border: 'hsl(240 3.7% 15.9%)',
    hover: 'hsl(240 3.7% 20%)',
  },
  primary: {
    DEFAULT: 'hsl(0 0% 98%)',
    foreground: 'hsl(240 5.9% 10%)',
    hover: 'hsl(0 0% 90%)',
  },
  secondary: {
    DEFAULT: 'hsl(240 3.7% 15.9%)',
    foreground: 'hsl(0 0% 98%)',
    hover: 'hsl(240 3.7% 25%)',
  },
  muted: {
    DEFAULT: 'hsl(240 3.7% 15.9%)',
    foreground: 'hsl(240 5% 64.9%)',
  },
  accent: {
    DEFAULT: 'hsl(240 3.7% 15.9%)',
    foreground: 'hsl(0 0% 98%)',
  },
  destructive: {
    DEFAULT: 'hsl(0 62.8% 30.6%)',
    foreground: 'hsl(0 0% 98%)',
    hover: 'hsl(0 72% 40%)',
    subtle: 'hsl(0 50% 15%)',
  },
  success: {
    DEFAULT: 'hsl(142 76% 36%)',
    foreground: 'hsl(0 0% 98%)',
    subtle: 'hsl(144 50% 15%)',
  },
  warning: {
    DEFAULT: 'hsl(38 92% 50%)',
    foreground: 'hsl(0 0% 98%)',
    subtle: 'hsl(48 50% 15%)',
  },
  info: {
    DEFAULT: 'hsl(217 91% 60%)',
    foreground: 'hsl(0 0% 98%)',
    subtle: 'hsl(214 50% 15%)',
  },
  border: 'hsl(240 3.7% 15.9%)',
  input: 'hsl(240 3.7% 15.9%)',
  ring: 'hsl(240 4.9% 83.9%)',
  sidebar: {
    DEFAULT: 'hsl(240 5% 6.9%)',
    foreground: 'hsl(0 0% 98%)',
    accent: 'hsl(240 3.7% 15.9%)',
  },
} as const
