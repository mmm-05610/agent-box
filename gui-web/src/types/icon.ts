/**
 * Icon metadata type — mirrors the shape used by the cc-switch icons library.
 * Defined locally so we don't depend on cc-switch's `@/types/icon` module.
 */
export interface IconMetadata {
  name: string
  displayName: string
  category: string
  keywords: string[]
  defaultColor: string
}