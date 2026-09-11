'use client'

/**
 * What both diff renderers agree on: the parsed line model, the per-kind tint
 * and gutter accent, and the plain body that paints them.
 *
 * It lives beside `diff-lines.tsx` rather than inside it because the Shiki path
 * is a lazily-imported chunk (`syntax-diff.tsx`, the only thing that pumps the
 * multi-MB shiki bundle onto the cold-start path otherwise). That chunk needs
 * this same model; taking it from `diff-lines.tsx` would make the lazy chunk
 * import the module that lazily imports it.
 *
 * Parsing a diff string into these lines, and every decision about *which*
 * renderer to use, stays in `diff-lines.tsx`.
 */
import type { ShikiTransformer } from 'shiki'

import { cn } from '@/lib/utils'

export type DiffKind = 'add' | 'context' | 'remove'

export interface DiffLine {
  kind: DiffKind
  text: string
  /** 1-based line number in the old/new file (absent on the "other" side of an
   *  add/remove, and on hunk-separator blanks). Only used when line numbers are
   *  shown (the preview's full diff). */
  newNo?: number
  oldNo?: number
}

export const DIFF_LINE_BASE = 'block min-w-max whitespace-pre border-l-2 px-2.5 py-px'

// Tint + 2px gutter accent per change kind. Text color is included for the
// plain renderer; the Shiki path omits it so syntax colors win, layering only
// the background + border.
export const DIFF_KIND_TINT: Record<DiffKind, string> = {
  add: 'border-(--ui-diff-add-border) bg-(--ui-diff-add-background)',
  context: 'border-transparent',
  remove: 'border-(--ui-diff-remove-border) bg-(--ui-diff-remove-background)'
}

export const DIFF_KIND_TEXT: Record<DiffKind, string> = {
  add: 'text-(--ui-diff-add-foreground)',
  context: '',
  remove: 'text-(--ui-diff-remove-foreground)'
}

export function DiffBody({ lines, syntax }: { lines: DiffLine[]; syntax?: boolean }) {
  return (
    <>
      {lines.map((line, index) => (
        <span
          className={cn(DIFF_LINE_BASE, DIFF_KIND_TINT[line.kind], !syntax && DIFF_KIND_TEXT[line.kind])}
          key={`${index}-${line.text}`}
        >
          {line.text || ' '}
        </span>
      ))}
    </>
  )
}

// Shiki transformer: tag each `.line` with the diff tint for its kind, so the
// syntax-highlighted output keeps add/remove backgrounds + the gutter accent.
export function diffLineTransformer(kinds: DiffKind[]): ShikiTransformer {
  return {
    line(node, line) {
      const kind = kinds[line - 1] ?? 'context'

      const existing = Array.isArray(node.properties.className)
        ? (node.properties.className as string[])
        : node.properties.className
          ? [String(node.properties.className)]
          : []

      node.properties.className = [...existing, DIFF_LINE_BASE, DIFF_KIND_TINT[kind]]
    }
  }
}
