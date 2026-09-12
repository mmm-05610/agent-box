/** Preview-server restart handler, provided by the wiring (usePreviewRouting).
 *  Atom-bridged: this module can't import contrib-wiring (it imports us). */
import { atom } from 'nanostores'

export const $restartPreviewServer = atom<((url: string, context?: string) => Promise<string>) | null>(null)
