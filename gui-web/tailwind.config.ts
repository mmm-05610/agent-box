import type { Config } from 'tailwindcss'
import { fontFamily, fontSize, radius, shadow, transition } from './src/tokens'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── Colors (via CSS variables, defined in index.css) ──────────────
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
          border: 'hsl(var(--card-border) / <alpha-value>)',
          hover: 'hsl(var(--card-hover) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          hover: 'hsl(var(--primary-hover) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
          hover: 'hsl(var(--secondary-hover) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
          subtle: 'hsl(var(--accent-subtle) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
          hover: 'hsl(var(--destructive-hover) / <alpha-value>)',
          subtle: 'hsl(var(--destructive-subtle) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
          subtle: 'hsl(var(--success-subtle) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
          subtle: 'hsl(var(--warning-subtle) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
          subtle: 'hsl(var(--info-subtle) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar) / <alpha-value>)',
          foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
          accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
        },
      },

      // ── Typography ────────────────────────────────────────────────────
      fontFamily: {
        sans: fontFamily.sans.split(', '),
        mono: fontFamily.mono.split(', '),
      },
      fontSize,

      // ── Border radius ─────────────────────────────────────────────────
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        '2xl': radius['2xl'],
        full: radius.full,
      },

      // ── Shadows (warm-tinted, subtle) ─────────────────────────────────
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px 0 hsl(var(--shadow-color) / 0.04)',
        sm: '0 1px 2px 0 hsl(var(--shadow-color) / 0.04), 0 1px 3px 0 hsl(var(--shadow-color) / 0.05)',
        md: '0 2px 4px -1px hsl(var(--shadow-color) / 0.05), 0 4px 8px -2px hsl(var(--shadow-color) / 0.06)',
        lg: '0 4px 6px -1px hsl(var(--shadow-color) / 0.05), 0 10px 20px -4px hsl(var(--shadow-color) / 0.08)',
        xl: '0 10px 15px -3px hsl(var(--shadow-color) / 0.06), 0 20px 35px -8px hsl(var(--shadow-color) / 0.10)',
        glow: '0 0 0 1px hsl(var(--accent) / 0.15), 0 4px 16px hsl(var(--accent) / 0.18)',
      },

      // ── Transitions ──────────────────────────────────────────────────
      transitionDuration: {
        fast: '100ms',
        normal: '150ms',
        slow: '250ms',
      },

      // ── Keyframes ─────────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-out': {
          from: { opacity: '1', transform: 'translateX(0) scale(1)' },
          to: { opacity: '0', transform: 'translateX(16px) scale(0.95)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'accent-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-down': 'slide-down 200ms ease-out',
        'toast-in': 'toast-in 200ms ease-out',
        'toast-out': 'toast-out 200ms ease-in',
        'shimmer': 'shimmer 2s linear infinite',
        'accent-glow': 'accent-glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config