# Round-two ecosystem search coverage

## Scope and method

The first candidate screen started from four named repositories. The second
screen broadened discovery before selecting new experiments. It used eight web
queries, five GitHub repository-search API queries, exact repository metadata,
fixed source checkouts where a project remained plausible, and source-path
checks for hard eliminations. Search results locate candidates; README claims
alone never qualify one.

The query themes were:

1. coding-agent API or host supporting Codex, Claude Code, Pi, and OpenCode;
2. repositories containing both `codex app-server` and Claude Code;
3. multi-agent CLI gateways and multiplexers;
4. coding-agent adapter, host, broker, and runtime libraries;
5. ACP clients that export an embeddable runtime;
6. Codex/Claude/OpenCode session and SSE implementations;
7. modular `CodexAgent` and `ClaudeCodeAgent` libraries;
8. terminal dashboards, config installers, and orchestration products whose
   broad compatibility claims needed to be separated from adapter reuse.

GitHub's anonymous repository search later returned HTTP 403 after the
available request quota was consumed. Existing results, direct repository
access, raw fixed-commit files, and source checkouts were retained; the 403 was
not treated as negative evidence about any project. The screen is broad and
reproducible from the recorded queries, but it cannot prove that no other
project exists.

## Source-locked review set

| Candidate | Fixed source | License | Screen result |
| --- | --- | --- | --- |
| `getpaseo/paseo` | `d1b705a0cd91617a5707fae25d80cb0be3057950`; package `0.8.0` | Apache-2.0 | Real Codex app-server, OpenCode, Claude, Pi and ACP providers. The provider layer is coupled to roughly 105k lines of Paseo session/timeline/workspace/process code. Source reference; no bounded extraction established. |
| `arcboxlabs/linkcode` | `22c337f197665e1c53cc717b88859a45cfd8a43d`; untagged | BUSL-1.1 | Technically strong native adapter set, including Codex app-server, Pi, OpenCode and Claude. Roughly 55k relevant lines, private workspace coupling, and the license's competitive hosted/embedded restriction block a production recommendation without explicit legal/product acceptance. |
| `phil65/agentpool` | `b6ddbea9cb66173c096942ac57397b636e0a2248`; package `2.9.18` | MIT | Real Codex app-server, Claude, and ACP paths, but a 20k+ line lower-bound closure, 389 locked packages, import/storage side effects, dynamic installers, allow-on-deny approval mapping, and cancellation/disconnect defects require a broad fork. **NO_FIT.** |
| `BrokkAi/mjolnir` | `3ec91638b8b027977c1f4110698eb624f9d8e693`; package `2.6.4` | GPL-3.0-only | Real Rust ACP runtime for several Harnesses. Its worker imports relay, goal, memory, review, checkpoint, and SQLite control semantics; adopting it brings a second control plane and extracting it is substantial. Source reference only. |
| `beyond5959/acp-adapter` | `491151b16846682396aca8c31e9285e414e4f3b8`; tag `v0.3.8` | MIT | Exports real embedded Go runtimes for Codex app-server, Claude stream-json, and Pi RPC with fake fixtures. Advances to bounded Stage B; Go toolchain and AgentBox ACP bridge remain open. |
| `openclaw/acpx` | `ffbefbbb726b1fd4623b8e51708a17d21b10b576`; untagged HEAD declaring `0.15.1` | MIT | Exports an embeddable ACP runtime with injected registry, store, child environment, permission policy, and process observers. Advances to bounded Stage B; built-in ranges/`npx` and native metadata reduction must be excluded or bounded. |
| `BytePioneer-AI/codex-host` | `38903beed4b8f6c74d4ad6c54f4716257d9bf795`; untagged commit declaring `0.7.1` | MIT | Strong Pi/OpenCode/Claude/OMP plugin contract. Codex is reserved to a Desktop-coupled official host/runtime and is not a plugin adapter, so a reusable Codex-native closure is absent. Eliminate as the requested full candidate. |
| `coder/agentapi` | `9ff117e231822f670305254ef24f6389f75953f4`; tag `v0.12.2` | MIT | Named CLI support mainly uses PTY/screen parsing. Experimental ACP auto-approves permission, stubs file/terminal operations, and flattens tool activity. Eliminate. |
| `buildoak/agent-mux` | `4a27d544f8beeee172d9a509d917342a27ca9d7a` | MIT | Real Go registry, but Codex explicitly uses `codex exec --json`/`exec resume`, and common events discard native surfaces. Eliminate. |

The Stage B limit applies to the two newly advanced candidates only:
`acp-adapter` and `acpx`. Paseo, LinkCode, Mjolnir, and CodexHost received source
review because that was cheaper than an experiment and exposed decisive
closure, ownership, license, or Codex-boundary facts.

## Lighter screen and hard eliminations

| Candidate | Evidence boundary | Reason it did not advance |
| --- | --- | --- |
| `mingovvv/agentmux` | HEAD `ba0a264f9f7f82d237d4603716dedb2b5cbac62b` | JavaScript adapter reduces execution to delta/tool/tool-result/error plus final text/cost. |
| `TeamADAPT/cmux` | HEAD `a2238a18a1e0bf692d42e9971edb67dbbbf3d320` | Terminal/VS Code workspace orchestrator around installed CLIs, without a common native lifecycle implementation. |
| `rimio-ai/rimz` | HEAD `49ff414ea68431ffb4c4bb652bac43a6a661e65b` | tmux/zellij dashboard and process control, not adapter reuse. |
| `kcosr/codapter` | current repository source/README screen | Codex plus Pi protocol adapter, not the required multi-Harness set; native home/config ownership still needs review. |
| `OpenInsightDev/acp-agent` and `motosan-dev/acp-cli` | current repository source/README screen | ACP discovery/client utilities that depend on separately supplied adapters and dynamic preparation; they do not own the native multi-Harness integrations. |
| `Embedded-Focus/agent-circus` | current repository source/README screen | Container launcher that copies vendor credential/config directories and runs separately installed agents. |
| `pomerium/agentops` | current GitHub metadata | ACP/Kubernetes operations product and no recognized root reuse license. |
| `openclaw/openclaw`, OpenHands, Continue, Goose | current repository/source classification | Full agent, gateway, or provider platforms with their own routing and state authorities, rather than replaceable adapters for installed Harnesses. |
| BossConsole, CodeCLI, `cmux`, `rimz` | current repository/source classification | Consoles, routers, or terminals that launch stock CLIs; no native app-server/SDK lifecycle library. |
| `fuergaosi233/claude-codex`, `gkorepanov/ccodex`, `happy-shine/opencodex`, `rink3y/opencode-agent` | current repository/source classification | Single/dual-agent compatibility daemons or one-Harness workers with their own control plane; none is the reusable neutral multi-Harness layer. |
| `ar27111994/agent-harness` and similar asset projects | current repository/source classification | Install prompts/config/skills but do not implement session, event, approval, cancel, or recovery runtimes. |
| `puristajs/harness` | current repository/source classification | Model-provider application framework, not a host for native coding Harness lifecycles. |
| inaccessible `Johnny-xuan/Agent-Caller` | GitHub API returned 404 | Source identity, license, and behavior could not be locked, so search-index text was insufficient. |

These are eliminations at the stated evidence boundary. They do not assert that
all future releases, private branches, or every project in the ecosystem are
unsuitable.

## Research safety and reproducibility

All fixed source lived under the owned root
`/tmp/agentbox-harness-selection-38-round2.3oxRoE`. No native Harness, provider,
model, login, or credential was invoked or read. Searches and archive/API calls
used public repository data only. Partial low-priority clones were stopped by
their exact owned process groups after higher-signal candidates were locked;
they remained inside the owned root for final marker-checked cleanup.
