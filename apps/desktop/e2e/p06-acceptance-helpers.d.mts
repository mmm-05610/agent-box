/**
 * Types for the P06 acceptance driver's pure helpers. Declared separately
 * because the driver itself is a plain `.mjs` (run by node, like the other
 * Windows acceptance drivers) while its unit test is TypeScript.
 */

export interface AcceptanceStep {
  detail: string
  id: string
  status: 'PASS' | 'FAIL' | 'SKIP' | 'PENDING'
  step: string
}

export interface LegacyPaletteEntry {
  id: string
  text: string
}

export interface AcceptanceSummary {
  allOk: boolean
  counts: { PASS: number; FAIL: number; SKIP: number; PENDING: number }
  executed: number
}

export const LEGACY_PALETTE_ENTRY_PATTERNS: readonly { id: string; pattern: RegExp }[]
export const REQUIRED_STEP_IDS: readonly string[]
export const UNAVAILABLE_COPY_PATTERN: RegExp

export function findLegacyPaletteEntries(optionTexts: readonly string[]): LegacyPaletteEntry[]
export function pendingOrSkippedRequired(steps: readonly AcceptanceStep[]): AcceptanceStep[]
export function statesUnavailable(text: string): boolean
export function summarizeResults(steps: readonly AcceptanceStep[]): AcceptanceSummary
export function worstGlassCoverage(rects: readonly { height: number; width: number }[], viewportArea: number): number
export function collectDescendants(
  processes: readonly { parentPid: number | string; pid: number | string }[],
  rootPids: readonly number[]
): number[]
export function hermesRuntimeProcesses(
  processes: readonly { name: string; pid: number | string }[]
): { name: string; pid: number }[]
