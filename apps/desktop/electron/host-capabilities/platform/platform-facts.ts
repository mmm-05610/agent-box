/**
 * host-capabilities/platform/platform-facts.ts
 *
 * The host platform, as data. Three constants that every layer is allowed to
 * branch on, defined once so no two modules can disagree about the host they run
 * on.
 *
 * These lived in the composition root's constant bag, which meant a capability or
 * a resolution module had to import the root to ask whether it was on Windows.
 * They are host facts, so they live with the host capabilities.
 */

import { isWslEnvironment } from './bootstrap-platform'

export const IS_MAC = process.platform === 'darwin'

export const IS_WINDOWS = process.platform === 'win32'

/**
 * WSL is a Linux host with a Windows filesystem behind it: a distinct platform,
 * not a flavour of Linux. Callers that only care about POSIX-ness branch on
 * `!IS_WINDOWS`.
 */
export const IS_WSL = isWslEnvironment()
