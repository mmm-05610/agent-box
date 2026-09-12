/**
 * The tip ids that carry copy, declared here because this is where the copy
 * lives: `Translations['tips']['items']` is keyed by them, so a new tip without
 * a translation is a type error instead of an empty bubble.
 *
 * `@/lib/tips/catalog` re-exports this union as its own `TipId` — the rotation
 * owns which tips exist, the catalog owns what they say, and the id list has to
 * be one list so the two cannot drift. It sits on this side of the boundary
 * because the alternative is the i18n catalog importing a product module.
 */
export type TipId =
  | 'artifacts'
  | 'command-palette'
  | 'composer-mentions'
  | 'cron'
  | 'new-session'
  | 'profiles'
  | 'right-pane'
  | 'skills'
