/**
 * Path display helpers — render absolute paths home-relatively (`~/…`)
 * for display only.  The stored/transmitted value is never rewritten; the
 * backend expands `~` wherever it consumes a path.
 */

/**
 * Render `path` as `~/…` when it lives under `home`, otherwise unchanged.
 *
 * - `/home/tester/projects/x` with home `/home/tester` → `~/projects/x`
 * - `/home/tester` with home `/home/tester` → `~`
 * - already `~`-relative → unchanged
 * - outside home (`/mnt/c/...`, `\\wsl$\...`) → unchanged
 */
export function toHomeRelative(path: string, home: string): string {
  if (!path) return path
  if (path === '~' || path.startsWith('~/')) return path
  if (home) {
    const h = home.endsWith('/') ? home.slice(0, -1) : home
    if (path === h) return '~'
    if (path.startsWith(h + '/')) return '~' + path.slice(h.length)
  }
  return path
}
