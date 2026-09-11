/**
 * host-capabilities/platform/pathext.ts
 *
 * Windows `PATHEXT` command-resolution order, as a pure function.
 *
 * On Windows a real command must resolve through its `.exe`/`.cmd`, because
 * Windows command resolution consults PATHEXT. An extensionless file — e.g. a
 * Git-Bash shell-script shim named `hermes` — must therefore NOT shadow
 * `hermes.cmd`. The empty entry is kept LAST so a caller that already includes
 * the extension (`py.exe`, `pwsh.exe`, `powershell.exe`) still resolves.
 *
 * On non-Windows platforms there is no PATHEXT concept: only the bare name is
 * tried. Pure, so it is testable without a host.
 *
 * This lived in `legacy-hermes/windows-hermes-path.ts`, which made the platform
 * capability depend on the Hermes adapter to ask a generic Windows question.
 */

export function buildPathExtCandidates(pathext: string | undefined, isWindows: boolean): string[] {
  if (!isWindows) {
    return ['']
  }

  return [...(pathext || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean), '']
}
