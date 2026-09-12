/**
 * TOUR ENGINE MACHINERY — the generic half of the tour system.
 *
 * The engine drives a spotlight over whatever document it is handed, target
 * collection reports what is addressable, and the spotlight blur mirrors the
 * cutout. mark elements with `data-tour="…"` to give them durable handles
 * (`collectTourTargets` reports those first and flags every selector as
 * stable or positional).
 *
 * The verbs that coordinate the app's surfaces — routing, pane reveal,
 * Preview Tour selection, surface choice — are assembly decisions and
 * register with the app's composition (batch 32), not here.
 */

export { collectTourTargets, type TourTarget } from './collect-targets'
export type { TourAction, TourHost, TourResult, TourStep } from './engine'
