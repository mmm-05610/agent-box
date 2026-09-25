/**
 * Work Order 40-C reproducible bounded handshake for the four Harness families.
 *
 * Rules enforced by this script:
 *   - No credential is ever provided. Every credential-bearing env var is
 *     removed from the child environment and the HOME/XDG/HERMES_HOME roots are
 *     redirected to an empty temporary directory, so a tool cannot read the
 *     user's login state.
 *   - Each family gets a hard deadline; a stuck tool cannot hang the run.
 *   - The script reports an honest typed failure instead of substituting a
 *     different binary, downloading anything, or pretending success.
 *
 * Component evidence only: an adapter answering `initialize` proves the
 * registered protocol surface is alive. It does NOT prove a model is usable.
 *
 * Usage: node scripts/server-round1/harness-handshake-40c.mjs [--json]
 */
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
// The offline lock's on-disk result, one npm root per family since the shared
// Codex/Pi lock was split. This is a packaging-chain read only: the installer,
// not the run chain, owns these directories.
const npmRoots = {
  codex: path.join(repoRoot, "plugins", "agent-box-harness", "packaging", "codex"),
  pi: path.join(repoRoot, "plugins", "agent-box-harness", "packaging", "pi"),
}
const bridgeSrc = path.join(repoRoot, "plugins", "agent-box-harness", "third_party", "harness_remote", "bridge", "src")
const { AcpClient } = await import(`file://${path.join(bridgeSrc, "acp-client.js")}`)

const CREDENTIAL_ENV_VARS = [
  "CODEX_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY", "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY", "HERMES_API_KEY", "OPENCODE_API_KEY",
]

function isolatedEnv({ pythonPath = null } = {}) {
  const scratch = mkdtempSync(path.join(tmpdir(), "agentbox-handshake-"))
  const env = {
    PATH: process.env.PATH,
    HOME: scratch,
    TMPDIR: tmpdir(),
    XDG_CONFIG_HOME: path.join(scratch, "xdg"),
    XDG_CACHE_HOME: path.join(scratch, "xdg"),
    XDG_DATA_HOME: path.join(scratch, "xdg"),
    HERMES_HOME: path.join(scratch, "hermes"),
    PYTHONUNBUFFERED: "1",
  }
  if (pythonPath) env.PYTHONPATH = pythonPath
  // Belt and braces: even a var we did not enumerate is dropped.
  for (const key of CREDENTIAL_ENV_VARS) delete env[key]
  return env
}

async function handshake({ label, command, args, env, deadlineMs = 25000 }) {
  const client = new AcpClient({
    command,
    args,
    spawnProcess: (cmd, cmdArgs, options) => spawn(cmd, cmdArgs, { ...options, env }),
  })
  const started = Date.now()
  try {
    await Promise.race([
      client.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("HANDSHAKE_DEADLINE_EXCEEDED")), deadlineMs)),
    ])
    return {
      family: label,
      outcome: "INITIALIZED",
      elapsedMs: Date.now() - started,
      agentInfo: client.agentInfo ?? null,
      promptCapabilities: client.promptCapabilities ?? null,
      sessionCapabilities: client.sessionCapabilities ?? null,
    }
  } catch (error) {
    return {
      family: label,
      outcome: "TYPED_FAILURE",
      elapsedMs: Date.now() - started,
      error: String(error?.message ?? error).slice(0, 240),
    }
  } finally {
    try { client.close() } catch { /* best effort */ }
  }
}

/**
 * Resolve an executable to an absolute path. `opencode` is installed outside
 * this shell's PATH (a bun-compiled ELF named `opencode.exe`), so a bare name
 * lookup is not reproducible; the resolved absolute path is recorded instead.
 */
function resolveExecutable(name, extraDirs = []) {
  const dirs = [...String(process.env.PATH ?? "").split(":"), ...extraDirs].filter(Boolean)
  for (const dir of dirs) {
    for (const candidate of [name, `${name}.exe`]) {
      const full = path.join(dir, candidate)
      if (existsSync(full)) return full
    }
  }
  return null
}

function toolVersion(command, args, env) {
  return new Promise((resolve) => {
    let output = ""
    let child
    try {
      child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] })
    } catch (error) {
      resolve({ ok: false, error: String(error.message) })
      return
    }
    const timer = setTimeout(() => { try { child.kill() } catch {} ; resolve({ ok: false, error: "VERSION_TIMEOUT" }) }, 20000)
    child.stdout.on("data", (c) => { output += c })
    child.stderr.on("data", (c) => { output += c })
    child.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, error: String(error.message) }) })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, exitCode: code, output: output.trim().split("\n").slice(-2).join(" | ").slice(0, 200) })
    })
  })
}

const results = { generatedAt: new Date().toISOString(), note: "no credential provided; HOME/XDG redirected to an empty temp root" }

// --- artifact presence and identity (the offline lock's on-disk result) ------
const artifacts = {}
for (const [name, family, rel] of [
  ["codex-acp", "codex", "node_modules/@agentclientprotocol/codex-acp/package.json"],
  ["pi-acp", "pi", "node_modules/@automatalabs/pi-acp/package.json"],
  ["codex-binary", "codex", "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex"],
]) {
  const full = path.join(npmRoots[family], rel)
  if (!existsSync(full)) { artifacts[name] = { present: false }; continue }
  if (rel.endsWith("package.json")) {
    const meta = JSON.parse(readFileSync(full, "utf8"))
    artifacts[name] = { present: true, version: meta.version, license: meta.license }
  } else {
    artifacts[name] = { present: true, bytes: readFileSync(full).length }
  }
}
results.artifacts = artifacts

// --- Codex -------------------------------------------------------------------
{
  const env = isolatedEnv()
  const codexVersion = await toolVersion(
    path.join(npmRoots.codex, "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex"),
    ["--version"], env,
  )
  const adapter = await handshake({
    label: "codex",
    command: process.execPath,
    args: [path.join(npmRoots.codex, "node_modules/@agentclientprotocol/codex-acp/dist/index.js")],
    env,
  })
  results.codex = { ...adapter, bundledCodexVersion: codexVersion }
  // app-server evidence: the adapter launches `codex app-server` and never an
  // `exec`/JSONL path. Recorded from the pinned artifact itself.
  const dist = readFileSync(path.join(npmRoots.codex, "node_modules/@agentclientprotocol/codex-acp/dist/index.js"), "utf8")
  results.codex.appServerSpawnSites = (dist.match(/"app-server"/g) ?? []).length
  results.codex.execJsonlSites = (dist.match(/exec.*--json|--experimental-json|jsonl/gi) ?? []).length
}

// --- Pi ----------------------------------------------------------------------
results.pi = await handshake({
  label: "pi",
  command: process.execPath,
  args: [path.join(npmRoots.pi, "node_modules/@automatalabs/pi-acp/dist/index.js")],
  env: isolatedEnv(),
})

// --- Hermes ------------------------------------------------------------------
// Hermes is a Python package in the user's site-packages; the interpreter search
// path must be restored while HOME stays isolated, so no user config or .env is
// read.
{
  const sitePackages = "/home/maoqh/.local/lib/python3.12/site-packages"
  const env = isolatedEnv({ pythonPath: sitePackages })
  results.hermes = await handshake({ label: "hermes", command: "hermes", args: ["acp"], env })
  results.hermes.interpreterPathRequirement = sitePackages
}

// --- OpenCode ----------------------------------------------------------------
{
  const { ManagedOpenCodeHost } = await import(`file://${path.join(bridgeSrc, "opencode-host.js")}`)
  const env = isolatedEnv()
  const port = 41917
  const opencodePath = resolveExecutable("opencode", ["/home/maoqh/.npm-global/bin"])
  if (!opencodePath) {
    results.opencode = { family: "opencode", outcome: "TYPED_FAILURE", error: "OPENCODE_EXECUTABLE_NOT_FOUND" }
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
    } else {
      process.stdout.write("opencode  TYPED_FAILURE  OPENCODE_EXECUTABLE_NOT_FOUND\n")
    }
    process.exit(0)
  }
  const host = new ManagedOpenCodeHost({
    command: opencodePath, host: "127.0.0.1", port,
    // Loopback-only ephemeral auth for the health call; generated per run so
    // no fixed credential-like literal exists in this repository.
    username: "agentbox", password: randomBytes(16).toString("hex"),
    startTimeoutMs: 25000,
    spawnProcess: (cmd, args, options) => spawn(cmd, args, { ...options, env }),
  })
  const started = Date.now()
  try {
    await host.start()
    results.opencode = {
      family: "opencode", outcome: "HEALTH_OK", elapsedMs: Date.now() - started, port,
      executable: opencodePath,
    }
  } catch (error) {
    results.opencode = {
      family: "opencode", outcome: "TYPED_FAILURE",
      elapsedMs: Date.now() - started, error: String(error?.message ?? error).slice(0, 240),
    }
  } finally {
    try { host.stop() } catch { /* best effort */ }
  }
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
} else {
  for (const family of ["codex", "pi", "hermes", "opencode"]) {
    const item = results[family]
    process.stdout.write(
      `${family.padEnd(9)} ${String(item.outcome).padEnd(14)} ${item.elapsedMs ?? "-"}ms ` +
      `${item.agentInfo ? JSON.stringify(item.agentInfo) : (item.error ?? "")}\n`,
    )
  }
  process.stdout.write(`artifacts ${JSON.stringify(results.artifacts)}\n`)
}
