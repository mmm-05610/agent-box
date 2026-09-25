/**
 * Builder gates for the Hermes runtime artifact.
 *
 * The interesting failures are the ones that would otherwise ship: a closure
 * that is quietly incomplete, an installed version that does not satisfy the
 * specifier that pulled it in, an extra that rides along, a tree that is not a
 * plain file tree, and an output path this build does not own. Each is asserted
 * against a small synthetic installed-package root, so the checks are exercised
 * without touching the reviewed one; one test additionally builds the real
 * installed closure and proves the artifact is self-contained.
 */
import { execFileSync } from "node:child_process"
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_FALLBACK_SOURCES, DEFAULT_SOURCE, ENTRY_DISTRIBUTION, build, selfCheck,
} from "./build-hermes-runtime-artifact.mjs"

const REPO = path.resolve(import.meta.dirname, "..", "..")

function metadataText(name, version, { requires = [], extras = [], topLevel = [] } = {}) {
  return [
    "Metadata-Version: 2.4",
    `Name: ${name}`,
    `Version: ${version}`,
    ...requires.map((item) => `Requires-Dist: ${item}`),
    ...extras.map((item) => `Provides-Extra: ${item}`),
    "Requires-Python: >=3.11",
    "",
    ...(topLevel.length ? topLevel.join("\n") + "\n" : ""),
  ].join("\n")
}

/** One installed wheel-shaped distribution: metadata, RECORD, package files. */
function addDistribution(root, {
  project, version, requires = [], extras = [], modules = {}, topLevel = [], withRecord = true,
}) {
  const info = path.join(root, `${project.replace(/-/g, "_")}-${version}.dist-info`)
  mkdirSync(info, { recursive: true })
  writeFileSync(path.join(info, "METADATA"), metadataText(project, version, { requires, extras, topLevel: [] }))
  writeFileSync(path.join(info, "top_level.txt"), topLevel.join("\n") + "\n")
  const record = []
  record.push(`${project.replace(/-/g, "_")}-${version}.dist-info/METADATA,,`)
  record.push(`${project.replace(/-/g, "_")}-${version}.dist-info/top_level.txt,,`)
  for (const [relative, content] of Object.entries(modules)) {
    const location = path.join(root, relative)
    mkdirSync(path.dirname(location), { recursive: true })
    writeFileSync(location, content)
    record.push(`${relative},sha256:0,${content.length}`)
  }
  if (withRecord) writeFileSync(path.join(info, "RECORD"), record.join("\n") + "\n")
  return { root, info }
}

/** One installed platform (egg-info) distribution: metadata and a module tree. */
function addEggDistribution(root, {
  project, version, requires = [], modules = {}, topLevel = [],
}) {
  const info = path.join(root, `${project.replace(/-/g, "_")}-${version}.egg-info`)
  mkdirSync(info, { recursive: true })
  writeFileSync(path.join(info, "PKG-INFO"), metadataText(project, version, { requires, topLevel: [] }))
  writeFileSync(path.join(info, "top_level.txt"), topLevel.join("\n") + "\n")
  for (const [relative, content] of Object.entries(modules)) {
    const location = path.join(root, relative)
    mkdirSync(path.dirname(location), { recursive: true })
    writeFileSync(location, content)
  }
  return { root, info }
}

/** A miniature installed-package set with the same shape the real one has. */
function fixtureSource({ name = "noop" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), `hermes-source-${name}-`))
  const fallback = mkdtempSync(path.join(tmpdir(), `hermes-fallback-${name}-`))
  const entryFiles = {
    "hermes_cli/__init__.py": "__version__ = '0.19.0'\n",
    "hermes_cli/main.py": "def main():\n    from acp_adapter.entry import main as acp_main\n    return acp_main\n",
    "acp_adapter/__init__.py": "\n",
    "acp_adapter/entry.py": "def main(argv=None):\n    import acp\n    return acp\n",
  }
  addDistribution(root, {
    project: ENTRY_DISTRIBUTION, version: "0.19.0",
    requires: [
      "openai==2.24.0",
      'distro<2,>=1.7.0; sys_platform != "win32"',
      "tzdata==2025.3; sys_platform == \"win32\"",
      'agent-client-protocol==0.9.0; extra == "acp"',
      'pytest==9.0.2; extra == "dev"',
    ],
    extras: ["acp", "dev"],
    modules: entryFiles, topLevel: ["hermes_cli", "acp_adapter"],
  })
  addDistribution(root, {
    project: "acp-adapter", version: "1.0.0", modules: { "acp_adapter/__init__.py": "\n" }, topLevel: ["acp_adapter"],
  })
  addDistribution(root, {
    project: "openai", version: "2.24.0",
    requires: ['distro>=1.7.0,<2; sys_platform != "win32"', "six==1.16.0"],
    modules: { "openai/__init__.py": "\n", "openai/_base_client.py": "import distro\n" }, topLevel: ["openai"],
  })
  addDistribution(root, {
    project: "agent-client-protocol", version: "0.9.0", requires: ["pydantic>=2.7"],
    modules: { "acp/__init__.py": "\n", "acp/connection.py": "\n" }, topLevel: ["acp"],
  })
  addDistribution(root, { project: "pydantic", version: "2.13.4", modules: { "pydantic/__init__.py": "\n" }, topLevel: ["pydantic"] })
  addDistribution(root, {
    project: "pytest", version: "9.0.2", modules: { "_pytest/__init__.py": "\n" }, topLevel: ["_pytest"],
  })
  addDistribution(root, { project: "tzdata", version: "2025.3", modules: { "tzdata/__init__.py": "\n" }, topLevel: ["tzdata"] })
  // Only the platform root has these two, one wheel-shaped and one egg-shaped.
  addDistribution(fallback, {
    project: "distro", version: "1.9.0", modules: { "distro/__init__.py": "", "distro/distro.py": "\n" }, topLevel: ["distro"],
  })
  addEggDistribution(fallback, {
    project: "six", version: "1.16.0", modules: { "six.py": "def moves(): return None\n" }, topLevel: ["six"],
  })
  // An unrelated tool and its exclusive closure: the exclusion probe must find it.
  addDistribution(root, {
    project: "flask", version: "3.1.3", requires: ["werkzeug>=3.1", "itsdangerous>=2.2"],
    modules: { "flask/__init__.py": "\n" }, topLevel: ["flask"],
  })
  addDistribution(root, { project: "werkzeug", version: "3.1.3", modules: { "werkzeug/__init__.py": "\n" }, topLevel: ["werkzeug"] })
  addDistribution(root, { project: "itsdangerous", version: "2.2.0", modules: { "itsdangerous/__init__.py": "\n" }, topLevel: ["itsdangerous"] })
  // Installed, reachable from nothing: it must never ride along.
  addDistribution(root, {
    project: "boto3", version: "1.43.71", modules: { "boto3/__init__.py": "x = 1\n" }, topLevel: ["boto3"],
  })
  return { root, fallback, entryFiles }
}

function outputFor(name) {
  return path.join(mkdtempSync(path.join(tmpdir(), `hermes-out-${name}-`)), "artifact")
}

function expectBuildError(fn, code) {
  try {
    fn()
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return
  }
  assert.fail(`expected ${code}`)
}

test("builds the closure, excludes extras and cache, and is deterministic", () => {
  const { root, fallback } = fixtureSource({ name: "happy" })
  const first = outputFor("happy-1")
  const second = outputFor("happy-2")
  const one = build({ output: first, source: root, fallbackSources: [fallback] })
  const two = build({ output: second, source: root, fallbackSources: [fallback] })
  assert.equal(one.treeDigest, two.treeDigest)
  assert.equal(one.entries, two.entries)
  assert.equal(one.bytes, two.bytes)
  assert.deepEqual(
    readFileSync(`${first}.manifest.json`, "utf8"),
    readFileSync(`${second}.manifest.json`, "utf8"),
    "two builds of one input must produce the same manifest",
  )
  assert.deepEqual(
    one.packages.map((item) => item.name).sort(),
    ["agent-client-protocol", "distro", "hermes-agent", "openai", "pydantic", "six"],
  )
  // Extras this artifact does not provide, and win32-only requirements, stay out.
  assert.ok(!one.packages.some((item) => item.name === "pytest"))
  assert.ok(!one.packages.some((item) => item.name === "tzdata"))
  assert.ok(one.excluded.extrasOnlyNames.includes("pytest"))
  assert.ok(one.excluded.win32OnlyRequirements.includes("tzdata"))
  // The unrelated reference contributes only its own exclusive packages.
  assert.deepEqual(one.excluded.unrelatedOnlyPackages, ["flask", "itsdangerous", "werkzeug"])
  assert.ok(!one.packages.some((item) => item.name === "boto3"))
  // The platform root is a declared fallback, and it is recorded per package.
  assert.deepEqual(
    one.packages.filter((item) => item.fallback).map((item) => item.name).sort(),
    ["distro", "six"],
  )
  assert.deepEqual(
    one.packages.filter((item) => item.filesFrom === "top-level").map((item) => item.name).sort(),
    ["six"],
  )
  // The entry point and the overlay files are where the deployment expects them.
  assert.equal(statSync(path.join(first, "site-packages", "hermes_cli", "main.py")).isFile(), true)
  const overlays = readFileSync(
    path.join(first, "site-packages", "agentbox_hermes_bootstrap.py"), "utf8",
  )
  assert.match(overlays, /AGENTBOX_HERMES_BOOTSTRAP_HOME_MISSING/)
  assert.match(readFileSync(path.join(first, "site-packages", "sitecustomize.py"), "utf8"), /agentbox_hermes_bootstrap/)
  assert.deepEqual(one.overlays.map((item) => item.name),
    ["agentbox_hermes_bootstrap.py", "sitecustomize.py"])
  // Read-only publication, owner marker, and no cache files anywhere.
  assert.equal(statSync(first).mode & 0o777, 0o555)
  assert.equal(statSync(path.join(first, "site-packages", "hermes_cli", "main.py")).mode & 0o777, 0o444)
  assert.match(readFileSync(path.join(first, ".agentbox-hermes-runtime-artifact"), "utf8"), /r1/)
  assert.equal(existsSync(path.join(first, "site-packages", "hermes_cli", "__pycache__")), false)
  assert.equal(existsSync(path.join(first, "site-packages", "boto3")), false)
})

test("a missing required dependency fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "missing" })
  rmSync(path.join(root, "openai-2.24.0.dist-info"), { recursive: true })
  expectBuildError(() => build({ output: outputFor("missing"), source: root, fallbackSources: [fallback] }),
    "HERMES_CLOSURE_DEPENDENCY_MISSING")
})

test("a version that does not satisfy its pin fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "drift" })
  // The installed distribution is 2.25.0 while the entry pins `==2.24.0`, and
  // the declared-deviation table does not cover it.
  const info = path.join(root, "openai-2.24.0.dist-info")
  writeFileSync(path.join(info, "METADATA"), metadataText("openai", "2.25.0", {
    requires: ['distro>=1.7.0,<2; sys_platform != "win32"', "six==1.16.0"],
  }))
  const renamed = path.join(root, "openai-2.25.0.dist-info")
  mkdirSync(renamed)
  rmSync(renamed, { recursive: true })
  // Move the metadata directory by walking it, so the dist-info name and the
  // declared version agree.
  mkdirSync(renamed)
  for (const item of ["METADATA", "top_level.txt", "RECORD"]) {
    const from = path.join(info, item)
    if (existsSync(from)) {
      writeFileSync(path.join(renamed, item), readFileSync(from, "utf8"))
      rmSync(from)
    }
  }
  rmSync(info, { recursive: true })
  expectBuildError(() => build({ output: outputFor("drift"), source: root, fallbackSources: [fallback] }),
    "HERMES_CLOSURE_VERSION_MISMATCH")
})

test("an entry version other than the pinned one fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "entry" })
  const info = path.join(root, "hermes_agent-0.19.0.dist-info")
  writeFileSync(path.join(info, "METADATA"), metadataText(ENTRY_DISTRIBUTION, "0.20.0", {
    requires: ["openai==2.24.0"], extras: ["acp"],
  }))
  expectBuildError(() => build({ output: outputFor("entry"), source: root, fallbackSources: [fallback] }),
    "HERMES_ENTRY_VERSION_MISMATCH")
})

test("a missing entry distribution fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "noentry" })
  rmSync(path.join(root, "hermes_agent-0.19.0.dist-info"), { recursive: true })
  expectBuildError(() => build({ output: outputFor("noentry"), source: root, fallbackSources: [fallback] }),
    "HERMES_CLOSURE_ENTRY_MISSING")
})

test("an entry extra that is not declared fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "noextra" })
  const info = path.join(root, "hermes_agent-0.19.0.dist-info")
  writeFileSync(path.join(info, "METADATA"), metadataText(ENTRY_DISTRIBUTION, "0.19.0", {
    requires: ["openai==2.24.0", 'agent-client-protocol==0.9.0; extra == "acp"'],
  }))
  expectBuildError(() => build({ output: outputFor("noextra"), source: root, fallbackSources: [fallback] }),
    "HERMES_CLOSURE_ENTRY_EXTRA_UNKNOWN")
})

test("a distribution the artifact does not provide an extra for stays out", () => {
  const { root, fallback } = fixtureSource({ name: "extraonly" })
  const info = path.join(root, "hermes_agent-0.19.0.dist-info")
  writeFileSync(path.join(info, "METADATA"), metadataText(ENTRY_DISTRIBUTION, "0.19.0", {
    requires: [
      "openai==2.24.0",
      'agent-client-protocol==0.9.0; extra == "acp"',
      'boto3==1.43.71; extra == "dev"',
    ],
    extras: ["acp", "dev"],
  }))
  const built = build({ output: outputFor("extraonly"), source: root, fallbackSources: [fallback] })
  assert.ok(!built.packages.some((item) => item.name === "boto3"))
  assert.ok(built.excluded.extrasOnlyNames.includes("boto3"))
})

test("the unrelated-tool probe names what it would have caught", () => {
  const { root, fallback } = fixtureSource({ name: "unrelated" })
  const built = build({ output: outputFor("unrelated"), source: root, fallbackSources: [fallback] })
  // flask is installed with its own exclusive closure; the probe records every
  // distribution that belongs only to it, and none of them is in the artifact.
  assert.deepEqual(built.excluded.unrelatedOnlyPackages, ["flask", "itsdangerous", "werkzeug"])
  const selectedNames = new Set(built.packages.map((item) => item.name))
  for (const name of built.excluded.unrelatedOnlyPackages) {
    assert.ok(!selectedNames.has(name), `${name} must not be packaged`)
  }
  assert.deepEqual(built.excluded.extrasDelta, ["agent-client-protocol", "pydantic"])
})

test("a direct reference in the metadata fails loudly", () => {
  // A requirement that names a URL cannot be resolved from installed
  // distributions, and it may not be silently skipped either.
  const { root, fallback } = fixtureSource({ name: "direct" })
  const info = path.join(root, "hermes_agent-0.19.0.dist-info")
  writeFileSync(path.join(info, "METADATA"), metadataText(ENTRY_DISTRIBUTION, "0.19.0", {
    requires: [
      "openai==2.24.0",
      'agent-client-protocol==0.9.0; extra == "acp"',
      'boto3 @ https://example.invalid/boto3-1.2.3-py3-none-any.whl; extra == "acp"',
    ],
    extras: ["acp"],
  }))
  expectBuildError(() => build({ output: outputFor("direct"), source: root, fallbackSources: [fallback] }),
    "HERMES_CLOSURE_DIRECT_REFERENCE_UNSUPPORTED")
})

test("the entry point must import the module its extra provides", () => {
  const { root, fallback } = fixtureSource({ name: "entryimport" })
  const entry = path.join(root, "hermes_cli", "main.py")
  writeFileSync(entry, "def main():\n    return 0\n")
  expectBuildError(() => build({ output: outputFor("entryimport"), source: root, fallbackSources: [fallback] }),
    "HERMES_CLOSURE_ENTRY_EXTRA_UNUSED")
})

test("a symlink in the closure fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "symlink" })
  symlinkSync("/etc/passwd", path.join(root, "openai", "escape.py"))
  const record = path.join(root, "openai-2.24.0.dist-info", "RECORD")
  writeFileSync(record, readFileSync(record, "utf8") + "openai/escape.py,sha256:0,9\n")
  expectBuildError(() => build({ output: outputFor("symlink"), source: root, fallbackSources: [fallback] }),
    "HERMES_ARTIFACT_SHAPE_INVALID")
})

test("a special file in the closure fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "fifo" })
  execFileSync("mkfifo", [path.join(root, "openai", "pipe.py")])
  const record = path.join(root, "openai-2.24.0.dist-info", "RECORD")
  writeFileSync(record, readFileSync(record, "utf8") + "openai/pipe.py,sha256:0,0\n")
  expectBuildError(() => build({ output: outputFor("fifo"), source: root, fallbackSources: [fallback] }),
    "HERMES_ARTIFACT_SHAPE_INVALID")
})

test("a recorded file that is not installed fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "record" })
  const record = path.join(root, "openai-2.24.0.dist-info", "RECORD")
  writeFileSync(record, readFileSync(record, "utf8") + "openai/vanished.py,sha256:0,3\n")
  writeFileSync(path.join(root, "openai", "vanished.py"), "x = 1\n")
  rmSync(path.join(root, "openai", "vanished.py"))
  expectBuildError(() => build({ output: outputFor("record"), source: root, fallbackSources: [fallback] }),
    "HERMES_SOURCE_FILE_MISSING")
})

test("a distribution with neither RECORD nor top_level fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "norecord" })
  rmSync(path.join(root, "openai-2.24.0.dist-info", "RECORD"))
  rmSync(path.join(root, "openai-2.24.0.dist-info", "top_level.txt"))
  expectBuildError(() => build({ output: outputFor("norecord"), source: root, fallbackSources: [fallback] }),
    "HERMES_SOURCE_RECORD_MISSING")
})

test("two paths that differ only by case are refused", () => {
  const { root, fallback } = fixtureSource({ name: "case" })
  const record = path.join(root, "openai-2.24.0.dist-info", "RECORD")
  writeFileSync(path.join(root, "openai", "Case.py"), "a = 1\n")
  writeFileSync(path.join(root, "openai", "case.py"), "b = 2\n")
  writeFileSync(record, readFileSync(record, "utf8")
    + "openai/Case.py,sha256:0,6\nopenai/case.py,sha256:0,6\n")
  expectBuildError(() => build({ output: outputFor("case"), source: root, fallbackSources: [fallback] }),
    "HERMES_ARTIFACT_PATH_CONFLICT")
})

test("a tree beyond the artifact byte bound fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "bounds" })
  const oversized = path.join(root, "openai", "huge.bin")
  execFileSync("truncate", ["-s", String(1024 * 1024 * 1024 + 1), oversized])
  const record = path.join(root, "openai-2.24.0.dist-info", "RECORD")
  writeFileSync(record, readFileSync(record, "utf8")
    + `openai/huge.bin,sha256:0,${1024 * 1024 * 1024 + 1}\n`)
  expectBuildError(() => build({ output: outputFor("bounds"), source: root, fallbackSources: [fallback] }),
    "HERMES_ARTIFACT_OUTSIDE_BOUNDS")
})

test("output policy refuses the repository, relative paths and user config roots", () => {
  const { root, fallback } = fixtureSource({ name: "policy" })
  expectBuildError(() => build({ output: "relative/artifact", source: root, fallbackSources: [fallback] }),
    "HERMES_OUTPUT_NOT_ABSOLUTE")
  expectBuildError(() => build({ output: path.join(REPO, "artifact"), source: root, fallbackSources: [fallback] }),
    "HERMES_OUTPUT_INSIDE_REPOSITORY")
  expectBuildError(() => build({
    output: path.join(process.env.HOME, ".hermes", "artifact"), source: root, fallbackSources: [fallback],
  }), "HERMES_OUTPUT_RESERVED")
  expectBuildError(() => build({ output: "/", source: root, fallbackSources: [fallback] }), "HERMES_OUTPUT_UNSAFE")
})

test("an unmarked output is never deleted, and an owned one needs --replace", () => {
  const { root, fallback } = fixtureSource({ name: "target" })
  const output = outputFor("target")
  mkdirSync(output)
  const keep = path.join(output, "user-file")
  writeFileSync(keep, "must survive")
  expectBuildError(() => build({ output, source: root, fallbackSources: [fallback] }), "HERMES_OUTPUT_NOT_OWNED")
  assert.equal(readFileSync(keep, "utf8"), "must survive")

  rmSync(keep)
  build({ output, source: root, fallbackSources: [fallback] })
  expectBuildError(() => build({ output, source: root, fallbackSources: [fallback] }), "HERMES_OUTPUT_EXISTS")
  const rebuilt = build({ output, source: root, fallbackSources: [fallback], replace: true })
  assert.match(rebuilt.treeDigest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(statSync(output).mode & 0o777, 0o555)
})

test("a source root that is not an installed-package directory fails loudly", () => {
  const { root, fallback } = fixtureSource({ name: "source" })
  expectBuildError(() => build({
    output: outputFor("source"), source: path.join(root, "no-such-root"), fallbackSources: [fallback],
  }), "HERMES_SOURCE_INVALID")
})

test("the reviewed installed closure builds and is self-contained", { skip: !existsSync(DEFAULT_SOURCE) }, () => {
  const output = outputFor("real")
  chmodSync(path.dirname(output), 0o755)
  const built = build({ output, source: DEFAULT_SOURCE, fallbackSources: DEFAULT_FALLBACK_SOURCES })
  assert.equal(built.entry.package, ENTRY_DISTRIBUTION)
  assert.match(built.treeDigest, /^sha256:[0-9a-f]{64}$/)
  assert.ok(built.packages.some((item) => item.name === "agent-client-protocol"),
    "the entry point's own extra must be in the artifact")
  assert.deepEqual(built.entry.extras, ["acp"])
  assert.equal(built.packages.find((item) => item.name === ENTRY_DISTRIBUTION).version, "0.19.0")
  const resolved = selfCheck(output)
  for (const location of Object.values(resolved)) {
    assert.ok(String(location).startsWith(path.join(output, "site-packages") + path.sep),
      `${location} must resolve inside the artifact`)
  }
})
