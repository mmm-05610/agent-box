/**
 * The shared annotation record.
 *
 * It lives on its own because both ends of the pipeline speak it: `pack.ts`
 * produces one per comment, and `group.ts` sorts a batch of them by structure.
 * Keeping the shape here is what lets the grouper depend on the record alone
 * instead of on the packer, so grouping a batch stays independent of how a
 * batch gets built.
 */
import type { CompactIdentity } from './identity'

export interface ComposerReadyAnnotation {
  identity?: CompactIdentity
  imageDataUrl: string
  note: string
  number: number
  prompt: string
}
