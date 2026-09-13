# Round-two ecosystem search coverage

## Scope and method

The first candidate screen started from four named repositories. The second
screen broadened discovery before selecting new experiments. It used eight web
queries, five GitHub repository-search API queries, exact repository metadata,
fixed source checkouts where a project remained plausible, and source-path
checks for hard eliminations. Search results locate candidates; README claims
alone never qualify one.

The exact web queries were:

1. `coding agent API multiple CLI Claude Code Codex OpenCode agent host`
2. `"codex app-server" "Claude Code" agent`
3. `multi-agent CLI gateway codex claude opencode`
4. `"agentapi" codex claude aider goose`
5. `modular coding agent host library "Claude Code" "Codex CLI"`
6. `"CodexAgent" "ClaudeCodeAgent" library`
7. `"opencode" "claude" "codex" "session" "SSE" coding agent`
8. `"ACP" agent host codex claude opencode`

The five GitHub repository-search strings were `codex claude opencode`,
`coding agent gateway`, `multi agent CLI host`, `coding agent adapter`, and
`coding agent multiplexer`. GitHub's anonymous repository search later returned
HTTP 403 after the available request quota was consumed. Existing results,
direct repository access, raw fixed-commit files, and source checkouts were
retained; the 403 was not treated as negative evidence about any project. The
record makes the discovery procedure auditable, but ranking and network indexes
change and the screen cannot prove that no other project exists.

## Source-locked review set

| Candidate | Fixed source | License | Screen result |
| --- | --- | --- | --- |
| [`getpaseo/paseo`](https://github.com/getpaseo/paseo) | `d1b705a0cd91617a5707fae25d80cb0be3057950`; package `0.8.0` | Apache-2.0 | Real Codex app-server, OpenCode, Claude, Pi and ACP providers. The provider layer is coupled to roughly 105k lines of Paseo session/timeline/workspace/process code. Source reference; no bounded extraction established. |
| [`arcboxlabs/linkcode`](https://github.com/arcboxlabs/linkcode) | `22c337f197665e1c53cc717b88859a45cfd8a43d`; untagged | BUSL-1.1 | Technically strong native adapter set, including Codex app-server, Pi, OpenCode and Claude. Roughly 55k relevant lines, private workspace coupling, and the license's Competitive Offering restriction may cover the contemplated paid hosted/embedded use and blocks a recommendation until legal/product review confirms applicability. |
| [`phil65/agentpool`](https://github.com/phil65/agentpool) | `b6ddbea9cb66173c096942ac57397b636e0a2248`; package `2.9.18` | MIT | Real Codex app-server, Claude, and ACP paths, but a 20k+ line lower-bound closure, 389 locked packages, import/storage side effects, dynamic installers, allow-on-deny approval mapping, and cancellation/disconnect defects require a broad fork. **NO_FIT.** |
| [`BrokkAi/mjolnir`](https://github.com/BrokkAi/mjolnir) | `3ec91638b8b027977c1f4110698eb624f9d8e693`; package `2.6.4` | GPL-3.0-only | Real Rust ACP runtime for several Harnesses. Its worker imports relay, goal, memory, review, checkpoint, and SQLite control semantics; adopting it brings a second control plane and extracting it is substantial. Source reference only. |
| [`beyond5959/acp-adapter`](https://github.com/beyond5959/acp-adapter) | `491151b16846682396aca8c31e9285e414e4f3b8`; tag `v0.3.8` | MIT | Exports real embedded Go runtimes for Codex app-server, Claude stream-json, and Pi RPC with fake fixtures. Advances to bounded Stage B; Go toolchain and AgentBox ACP bridge remain open. |
| [`openclaw/acpx`](https://github.com/openclaw/acpx) | `ffbefbbb726b1fd4623b8e51708a17d21b10b576`; untagged HEAD declaring `0.15.1` | MIT | Exports an embeddable ACP runtime with injected registry, store, child environment, permission policy, and process observers. Advances to bounded Stage B; built-in ranges/`npx` and native metadata reduction must be excluded or bounded. |
| [`BytePioneer-AI/codex-host`](https://github.com/BytePioneer-AI/codex-host) | `38903beed4b8f6c74d4ad6c54f4716257d9bf795`; untagged commit declaring `0.7.1` | MIT | Strong Pi/OpenCode/Claude/OMP plugin contract. Codex is reserved to a Desktop-coupled official host/runtime and is not a plugin adapter, so a reusable Codex-native closure is absent. Eliminate as the requested full candidate. |
| [`coder/agentapi`](https://github.com/coder/agentapi) | `9ff117e231822f670305254ef24f6389f75953f4`; tag `v0.12.2` | MIT | Named CLI support mainly uses PTY/screen parsing. Experimental ACP auto-approves permission, stubs file/terminal operations, and flattens tool activity. Eliminate. |
| [`buildoak/agent-mux`](https://github.com/buildoak/agent-mux) | `4a27d544f8beeee172d9a509d917342a27ca9d7a` | MIT | Real Go registry, but Codex explicitly uses `codex exec --json`/`exec resume`, and common events discard native surfaces. Eliminate. |

The Stage B limit applies to the two newly advanced candidates only:
`acp-adapter` and `acpx`. Paseo, LinkCode, Mjolnir, and CodexHost received source
review because that was cheaper than an experiment and exposed decisive
closure, ownership, license, or Codex-boundary facts.

## Lighter screen and dispositions

| Candidate | Evidence boundary | Reason it did not advance |
| --- | --- | --- |
| [`mingovvv/agentmux`](https://github.com/mingovvv/agentmux) | HEAD `ba0a264f9f7f82d237d4603716dedb2b5cbac62b` | JavaScript adapter reduces execution to delta/tool/tool-result/error plus final text/cost. |
| [`TeamADAPT/cmux`](https://github.com/TeamADAPT/cmux) | HEAD `a2238a18a1e0bf692d42e9971edb67dbbbf3d320` | Terminal/VS Code workspace orchestrator around installed CLIs, without a common native lifecycle implementation. |
| [`rimio-ai/rimz`](https://github.com/rimio-ai/rimz) | HEAD `49ff414ea68431ffb4c4bb652bac43a6a661e65b` | tmux/zellij dashboard and process control, not adapter reuse. |
| [`kcosr/codapter`](https://github.com/kcosr/codapter) | discovery/source overview only; no fixed ref | Codex and Pi are real multi-Harness scope, but this round did not lock and trace its lifecycle, capability fidelity, state, or home ownership. Do not advance on current evidence; re-screenable rather than hard-eliminated. |
| [`OpenInsightDev/acp-agent`](https://github.com/OpenInsightDev/acp-agent) and [`motosan-dev/acp-cli`](https://github.com/motosan-dev/acp-cli) | discovery/source overview; no fixed refs | ACP discovery/client utilities that depend on separately supplied adapters and dynamic preparation; they do not own the native multi-Harness integrations. |
| [`Embedded-Focus/agent-circus`](https://github.com/Embedded-Focus/agent-circus) | current repository source/README screen | Container launcher that copies vendor credential/config directories and runs separately installed agents. |
| [`pomerium/agentops`](https://github.com/pomerium/agentops) | current GitHub metadata | ACP/Kubernetes operations product and no recognized root reuse license. |
| [`openclaw/openclaw`](https://github.com/openclaw/openclaw), [OpenHands](https://github.com/OpenHands/OpenHands), [Continue](https://github.com/continuedev/continue), [Goose](https://github.com/aaif-goose/goose) | discovery/repository classification; no fixed refs | Full agent, gateway, or provider platforms with their own routing and state authorities, rather than replaceable adapters for installed Harnesses. |
| [BossConsole](https://github.com/risa-labs-inc/BossConsole), [CodeCLI](https://github.com/ax128/CodeCLI) | discovery/repository classification; no fixed refs | Consoles, routers, or terminals that launch stock CLIs; no native app-server/SDK lifecycle library. |
| [`claude-codex`](https://github.com/fuergaosi233/claude-codex), [`ccodex`](https://github.com/gkorepanov/ccodex), [`opencodex`](https://github.com/happy-shine/opencodex), [`opencode-agent`](https://github.com/rink3y/opencode-agent) | discovery/repository classification; no fixed refs | Single/dual-agent compatibility daemons or one-Harness workers with their own control plane; none is the reusable neutral multi-Harness layer. |
| [`ar27111994/agent-harness`](https://github.com/ar27111994/agent-harness) and similar asset projects | discovery/repository classification; no fixed refs | Install prompts/config/skills but do not implement session, event, approval, cancel, or recovery runtimes. |
| [`puristajs/harness`](https://github.com/puristajs/harness) | discovery/repository classification; no fixed ref | Model-provider application framework, not a host for native coding Harness lifecycles. |
| inaccessible [`Johnny-xuan/Agent-Caller`](https://github.com/Johnny-xuan/Agent-Caller) | GitHub API returned 404 | Source identity, license, and behavior could not be locked, so search-index text was insufficient. |

Rows with fixed source paths support hard eliminations; discovery-only rows only
explain why they did not displace a source-locked candidate in this round. They
remain re-screenable and do not assert that future releases, private branches,
or every project in the ecosystem are unsuitable.

## Research safety and reproducibility

All fixed source lived under the owned root
`/tmp/agentbox-harness-selection-38-round2.3oxRoE`. No native Harness, provider,
model, login, or credential was invoked or read. Searches and archive/API calls
used public repository data only. Partial low-priority clones were stopped by
their exact owned process groups after higher-signal candidates were locked.
The final process audit found no live process under the root; its exact owner
marker and pointer were validated, then both root and pointer were removed.
