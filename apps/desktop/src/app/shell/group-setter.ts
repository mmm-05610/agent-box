// The `GroupSetter` shape pages take as an extension-point prop (SkillsView,
// ChatPreviewRail, …). The live implementation is the
// registry-backed `registryGroupSetter` in app/composition/registrations/chrome-contributions.tsx.
type Side = 'left' | 'right'

export type GroupSetter<T> = (id: string, items: readonly T[], side?: Side) => void
