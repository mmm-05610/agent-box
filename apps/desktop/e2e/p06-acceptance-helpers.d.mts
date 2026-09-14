/**
 * Types for the P06 acceptance driver's pure helpers. Declared separately
 * because the driver itself is a plain `.mjs` (run by node, like the other
 * Windows acceptance drivers) while its unit test is TypeScript.
 */

export type AcceptanceStatus = 'PASS' | 'FAIL' | 'SKIP' | 'PENDING'

export interface AcceptanceStep {
  detail: string
  id: string
  status: AcceptanceStatus
  step: string
}

/** A step as a run may present it: the status is deliberately loose, because
 *  `summarizeResults` and `requiredStepIssues` must classify a status they do
 *  not know instead of dropping the step that carries it. */
export interface UnvalidatedAcceptanceStep {
  detail?: string
  id: string
  status: string
  step?: string
}

export interface UnknownStatusIssue {
  id: string
  status: string
}

export interface AcceptanceSummary {
  allOk: boolean
  counts: { PASS: number; FAIL: number; SKIP: number; PENDING: number }
  executed: number
  unknownStatuses: UnknownStatusIssue[]
}

export type RequiredStepIssueKind = 'missing' | 'duplicated' | 'pending' | 'skipped' | 'illegal-status'

export interface RequiredStepIssue {
  count?: number
  id: string
  kind: RequiredStepIssueKind
  status?: string
}

export interface LegacyRestGateInput {
  /** Proof that a whole renderer boot ran with the console capture already
   *  live. Only the exact boolean `true` counts. */
  captureCoversBoot: unknown
  mainRefusals: unknown
  residualPaths: unknown
}

export interface LegacyRestGateVerdict {
  captureOk: boolean
  mainOk: boolean
  ok: boolean
  rendererOk: boolean
  residualsOk: boolean
}

export interface LegacyPaletteEntry {
  id: string
  text: string
}

export const ACCEPTANCE_STATUSES: readonly AcceptanceStatus[]
export const LEGACY_PALETTE_ENTRY_PATTERNS: readonly { id: string; pattern: RegExp }[]
export const LEGACY_REST_MARKER: string
export const LEGACY_RUNTIME_DISABLED_FOR_PRODUCT: string
export const REQUIRED_STEP_IDS: readonly string[]
export const UNAVAILABLE_COPY_PATTERN: RegExp

export function countMainLegacyRestRefusals(mainLogText: string): number
export function createStepRecorder(
  steps: AcceptanceStep[],
  onRecord?: (step: AcceptanceStep) => void
): (id: string, step: string, status: string, detail?: unknown) => AcceptanceStep
export function findLegacyPaletteEntries(optionTexts: readonly string[]): LegacyPaletteEntry[]
export function legacyRestGate(input: LegacyRestGateInput): LegacyRestGateVerdict
export function makeAcceptanceStep(id: string, step: string, status: string, detail?: unknown): AcceptanceStep
export function requiredStepIssues(steps: readonly UnvalidatedAcceptanceStep[]): RequiredStepIssue[]
export function residualLegacyRestPaths(consoleText: string): string[]
export function statesUnavailable(text: string): boolean
export function summarizeResults(steps: readonly UnvalidatedAcceptanceStep[]): AcceptanceSummary
export function worstGlassCoverage(rects: readonly { height: number; width: number }[], viewportArea: number): number
export function collectDescendants(
  processes: readonly { parentPid: number | string; pid: number | string }[],
  rootPids: readonly number[]
): number[]
export function hermesRuntimeProcesses(
  processes: readonly { name: string; pid: number | string }[]
): { name: string; pid: number }[]
