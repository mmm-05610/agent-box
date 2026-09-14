/**
 * Gates for the OpenCode binary authorization tool.
 *
 * The dangerous failures are the ones that would let a different binary than
 * the reviewed one reach the Worker: a path that was not resolved, a source
 * outside the installed package, a user configuration or cache directory, a
 * whole `node_modules` tree, a file that is not an ELF executable, a digest
 * that drifted, or a version that is not the pinned release. Each is asserted
 * against synthetic installations, and the real npm-global installation is
 * authorized once so the recorded identity is the real one.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import {
  AuthorizationError, DEFAULT_ENTRY, DEFAULT_PACKAGE_ROOT, EXECUTABLE_TARGET, OPENCODE_VERSION,
  assertControlledSource, authorizeBinary, deploymentFragment, elfIdentity, probeVersion,
} from "./build-opencode-authorization.mjs"

const REPO = path.resolve(import.meta.dirname, "..", "..")
//: A real, small, dynamically linked ELF from the system, so the ELF decoding
//: is exercised against bytes a loader would actually accept.
const REAL_ELF = "/usr/bin/true"
const versionRun = (output, status = 0) => () => ({ stdout: output, stderr: "", status })

/** An npm-global-shaped installation: a package directory plus a bin symlink. */
function fixtureInstall({ name = "fixture", executable = true, content = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), `opencode-auth-${name}-`))
  const packageRoot = path.join(root, "lib", "node_modules", "opencode-ai")
  const binary = path.join(packageRoot, "bin", "opencode.exe")
  mkdirSync(path.dirname(binary), { recursive: true })
  if (content !== null) {
    writeFileSync(binary, content, { mode: executable ? 0o755 : 0o644 })
  } else {
    copyFileSync(REAL_ELF, binary)
    chmodSync(binary, executable ? 0o755 : 0o644)
  }
  const entry = path.join(root, "bin", "opencode")
  mkdirSync(path.dirname(entry), { recursive: true })
  symlinkSync(path.relative(path.dirname(entry), binary), entry)
  return { root, packageRoot, binary, entry, home: root }
}

function expectRefusal(fn, code) {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof AuthorizationError, `expected an AuthorizationError, got ${error}`)
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return error
  }
  assert.fail(`expected ${code}, but the call succeeded`)
}

test("authorizes the resolved real file of a controlled installation", () => {
  const fixture = fixtureInstall({ name: "happy" })
  const declaration = authorizeBinary({
    entry: fixture.entry, packageRoot: fixture.packageRoot,
    runVersion: versionRun(OPENCODE_VERSION), home: fixture.home,
  })
  assert.equal(declaration.result, "OPENCODE_BINARY_AUTHORIZED")
  assert.equal(declaration.entry, fixture.entry)
  assert.equal(declaration.entryIsSymlink, true)
  assert.equal(declaration.resolved, fixture.binary, "the entry symlink must resolve to the real file")
  assert.equal(declaration.source, declaration.resolved, "the mount source is the real file, never the link")
  assert.match(declaration.digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(declaration.digest, "sha256:"
    + createHash("sha256").update(readFileSync(fixture.binary)).digest("hex"))
  assert.ok(declaration.sizeBytes > 0)
  assert.equal(declaration.version, OPENCODE_VERSION)
  // `/usr/bin/true` is a PIE, so the type may be ET_DYN; bits, endianness and
  // machine are what this fixture is here to pin.
  assert.match(declaration.fileType, /^ELF 64-bit LSB (executable|shared object), x86-64$/)
  assert.deepEqual(declaration.executableMounts, [{
    source: fixture.binary, target: EXECUTABLE_TARGET, digest: declaration.digest,
  }])
  const fragment = deploymentFragment(declaration)
  assert.equal(fragment.kind, "agentbox-opencode-executable-authorization")
  assert.equal(fragment.harnesses[0].id, "opencode")
  assert.deepEqual(fragment.harnesses[0].executableMounts, declaration.executableMounts)
  assert.equal(fragment.binary.digest, declaration.digest)
})

test("digest and size drift are typed refusals", () => {
  const fixture = fixtureInstall({ name: "drift" })
  const options = {
    entry: fixture.entry, packageRoot: fixture.packageRoot,
    runVersion: versionRun(OPENCODE_VERSION), home: fixture.home,
  }
  expectRefusal(() => authorizeBinary({ ...options, expectDigest: "sha256:" + "a".repeat(64) }),
    "OPENCODE_DIGEST_DRIFT")
  expectRefusal(() => authorizeBinary({ ...options, expectSize: 1 }), "OPENCODE_SIZE_DRIFT")
})

test("a version other than the pinned one is refused, and a failed probe too", () => {
  const fixture = fixtureInstall({ name: "version" })
  const options = { entry: fixture.entry, packageRoot: fixture.packageRoot, home: fixture.home }
  expectRefusal(() => authorizeBinary({ ...options, runVersion: versionRun("1.18.20") }),
    "OPENCODE_VERSION_MISMATCH")
  expectRefusal(() => authorizeBinary({ ...options, runVersion: versionRun("1.18.21\n", 2) }),
    "OPENCODE_VERSION_PROBE_FAILED")
  // probeVersion is the same rule on its own, including the pinned default.
  assert.equal(probeVersion("/nowhere", { run: versionRun("1.18.21"), expect: OPENCODE_VERSION }), "1.18.21")
})

test("a symlink, a directory, a non-ELF file and a non-executable file are refused", () => {
  const fixture = fixtureInstall({ name: "shapes" })
  // The link itself may never be the mount source, even though its target is right.
  expectRefusal(() => assertControlledSource({
    source: fixture.entry, packageRoot: fixture.packageRoot, home: fixture.home,
  }), "OPENCODE_SOURCE_NOT_CONTROLLED") // outside the package directory
  const innerLink = path.join(fixture.packageRoot, "bin", "opencode-link")
  symlinkSync("opencode.exe", innerLink)
  expectRefusal(() => assertControlledSource({
    source: innerLink, packageRoot: fixture.packageRoot, home: fixture.home,
  }), "OPENCODE_SOURCE_SYMLINK")
  expectRefusal(() => assertControlledSource({
    source: path.join(fixture.packageRoot, "bin"), packageRoot: fixture.packageRoot, home: fixture.home,
  }), "OPENCODE_SOURCE_NOT_REGULAR_FILE")
  const textBinary = fixtureInstall({ name: "text", content: "#!/bin/sh\necho 1.18.21\n" })
  expectRefusal(() => authorizeBinary({
    entry: textBinary.entry, packageRoot: textBinary.packageRoot,
    runVersion: versionRun(OPENCODE_VERSION), home: textBinary.home,
  }), "OPENCODE_SOURCE_NOT_ELF")
  const notExecutable = fixtureInstall({ name: "noexec", executable: false })
  expectRefusal(() => authorizeBinary({
    entry: notExecutable.entry, packageRoot: notExecutable.packageRoot,
    runVersion: versionRun(OPENCODE_VERSION), home: notExecutable.home,
  }), "OPENCODE_SOURCE_NOT_EXECUTABLE")
})

test("a source is refused unless it is the resolved file of a controlled package", () => {
  const fixture = fixtureInstall({ name: "controlled" })
  const options = { entry: fixture.entry, packageRoot: fixture.packageRoot, home: fixture.home }
  // Passing the symlink as --source is refused; the real file is accepted.
  expectRefusal(() => authorizeBinary({ ...options, source: fixture.entry }), "OPENCODE_SOURCE_SYMLINK")
  expectRefusal(() => authorizeBinary({ ...options, source: REAL_ELF }), "OPENCODE_SOURCE_NOT_RESOLVED")
  const accepted = authorizeBinary({
    ...options, source: fixture.binary, runVersion: versionRun(OPENCODE_VERSION),
  })
  assert.equal(accepted.source, fixture.binary)
  // A relative or non-canonical path is refused before any filesystem work.
  expectRefusal(() => authorizeBinary({
    ...options, entry: "bin/opencode", runVersion: versionRun(OPENCODE_VERSION),
  }), "OPENCODE_ENTRY_NOT_ABSOLUTE")
  expectRefusal(() => authorizeBinary({
    ...options, entry: `${fixture.root}/bin/../bin/opencode`, runVersion: versionRun(OPENCODE_VERSION),
  }), "OPENCODE_ENTRY_NOT_ABSOLUTE")
  expectRefusal(() => authorizeBinary({
    ...options, entry: "/tmp/does-not-exist-opencode", runVersion: versionRun(OPENCODE_VERSION),
  }), "OPENCODE_ENTRY_MISSING")
})

test("user configuration, cache and whole node_modules roots are refused", () => {
  const home = mkdtempSync(path.join(tmpdir(), "opencode-auth-home-"))
  for (const relative of [".config/opencode", ".cache/opencode", ".local/share/opencode"]) {
    const packageRoot = path.join(home, relative)
    mkdirSync(path.join(packageRoot, "bin"), { recursive: true })
    writeFileSync(path.join(packageRoot, "bin", "opencode.exe"), "x", { mode: 0o755 })
    expectRefusal(() => assertControlledSource({
      source: path.join(packageRoot, "bin", "opencode.exe"), packageRoot, home,
    }), "OPENCODE_SOURCE_NOT_CONTROLLED")
  }
  const wholeModules = path.join(home, "lib", "node_modules")
  expectRefusal(() => assertControlledSource({
    source: path.join(wholeModules, "opencode-ai", "bin", "opencode.exe"),
    packageRoot: wholeModules, home,
  }), "OPENCODE_SOURCE_NOT_CONTROLLED")
  const elsewhere = path.join(home, "src", "opencode")
  mkdirSync(path.join(elsewhere, "bin"), { recursive: true })
  writeFileSync(path.join(elsewhere, "bin", "opencode.exe"), "x", { mode: 0o755 })
  expectRefusal(() => assertControlledSource({
    source: path.join(elsewhere, "bin", "opencode.exe"), packageRoot: elsewhere, home,
  }), "OPENCODE_SOURCE_NOT_CONTROLLED")
})

test("the ELF decoder reads the header instead of trusting the name", () => {
  const identity = elfIdentity(readFileSync(REAL_ELF))
  assert.equal(identity.elfBits, "64-bit")
  assert.ok(["executable", "shared object"].includes(identity.elfType))
  assert.equal(identity.elfEndian, "LSB")
  assert.equal(identity.elfMachine, "x86-64")
  assert.throws(() => elfIdentity(Buffer.from("not an elf file at all")), /OPENCODE_SOURCE_NOT_ELF/)
  assert.throws(() => elfIdentity(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), /OPENCODE_SOURCE_NOT_ELF/)
})

test("JSON shaping failures are typed, never thrown as plain errors", () => {
  const fixture = fixtureInstall({ name: "ceremony" })
  let error
  try {
    authorizeBinary({
      entry: fixture.entry, packageRoot: fixture.packageRoot, home: fixture.home,
      runVersion: () => ({ stdout: null, status: 0 }),
    })
  } catch (caught) {
    error = caught
  }
  assert.ok(error instanceof AuthorizationError)
  assert.equal(error.code, "OPENCODE_VERSION_PROBE_FAILED")
  rmSync(fixture.root, { recursive: true, force: true })
})

test("the real installed binary authorizes with the pinned version and digest", (context) => {
  if (!existsSync(DEFAULT_ENTRY)) {
    context.skip(`the installed OpenCode entry is unavailable: ${DEFAULT_ENTRY}`)
    return
  }
  const declaration = authorizeBinary({ entry: DEFAULT_ENTRY, packageRoot: DEFAULT_PACKAGE_ROOT })
  assert.equal(declaration.version, OPENCODE_VERSION)
  assert.equal(declaration.source, declaration.resolved)
  assert.equal(declaration.fileType, "ELF 64-bit LSB executable, x86-64")
  assert.match(declaration.digest, /^sha256:[0-9a-f]{64}$/)
  assert.ok(declaration.sizeBytes > 100_000_000, "the single-file binary is large")
  assert.equal(declaration.executableMounts[0].target, "/runtime/bin/opencode")
  const fragmentPath = path.join(mkdtempSync(path.join(tmpdir(), "opencode-auth-cli-")), "fragment.json")
  const stdout = execFileSync(process.execPath, [
    path.join(REPO, "scripts", "server-round1", "build-opencode-authorization.mjs"),
    "--entry", DEFAULT_ENTRY, "--deployment-out", fragmentPath, "--json",
  ], { encoding: "utf8", timeout: 120_000 })
  const printed = JSON.parse(stdout.trim().split("\n").pop())
  assert.equal(printed.result, "OPENCODE_BINARY_AUTHORIZED")
  assert.equal(printed.digest, declaration.digest)
  const fragment = JSON.parse(readFileSync(fragmentPath, "utf8"))
  assert.deepEqual(fragment.harnesses[0].executableMounts, declaration.executableMounts)
  // The CLI refuses a deliberately wrong expectation instead of printing a digest.
  const refused = spawnSync(process.execPath, [
    path.join(REPO, "scripts", "server-round1", "build-opencode-authorization.mjs"),
    "--entry", DEFAULT_ENTRY, "--expect-digest", "sha256:" + "b".repeat(64), "--json",
  ], { encoding: "utf8", timeout: 120_000 })
  assert.equal(refused.status, 1)
  const refusal = JSON.parse(refused.stdout.trim().split("\n").pop())
  assert.equal(refusal.result, "OPENCODE_BINARY_AUTHORIZATION_FAILED")
  assert.equal(refusal.code, "OPENCODE_DIGEST_DRIFT")
})
