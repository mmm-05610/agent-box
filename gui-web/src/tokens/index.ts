/**
 * Design Tokens — Single source of truth
 *
 * All visual decisions (colors, typography, spacing) are defined here
 * and consumed by Tailwind CSS config. Never use raw values directly.
 *
 * Structure:
 *   tokens/
 *   ├── colors.ts      — Semantic color tokens (light + dark)
 *   ├── typography.ts   — Font family, size, weight, presets
 *   ├── spacing.ts      — Spacing, radius, shadow, size, transition
 *   └── index.ts        — This file (re-exports)
 */

export { colors, colorsDark } from './colors'
export { fontFamily, fontSize, fontWeight, typography } from './typography'
export { radius, shadow, size, space, transition, zIndex } from './spacing'
