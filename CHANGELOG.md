# Changelog

All notable changes to agent-box will be documented in this file.

## [2.0.0a1] — Developer Preview / Experimental API

- Introduced the execution governance Core and official plugin architecture.
- Added the requested resource → exact Ref → frozen Binding → accepted Dispatch
  → native execution → explicit Finish → output/evidence reconciliation loop.
- Added Web Quick Launch, native Harness integration, Git output capture, tmux,
  and immutable Artifacts plugins.
- Retired the legacy GUI, ACS integration, fixed workflow paths, and duplicate
  provider authorities.
- This release is distributed as GitHub assets only; PyPI publication is not
  included.

## Unreleased — Documentation and repository closure

- Established a single current documentation entry and separated current
  evidence from historical plans, research, and retired product designs.
- Aligned the architecture and Preview guidance with the Core + Plugins
  repository; Web is an optional Local Host, not the only product entry point.
- Preserved the earlier Preview closure facts below as historical Unreleased
  notes; this section does not claim a Native Codex rehearsal.

## [1.9.0](https://github.com/mmm-05610/agent-box/compare/v1.8.0...v1.9.0) (2026-08-16)

### Features

- TUI 仪表盘 + session 追踪修复 + bwrap 检测 ([#61](https://github.com/mmm-05610/agent-box/issues/61)) ([b73c9dd](https://github.com/mmm-05610/agent-box/commit/b73c9dd9f7e553a3dd11a3463cf4073ffe72c402))

## [1.8.0](https://github.com/mmm-05610/agent-box/compare/v1.7.8...v1.8.0) (2026-08-15)

### Features

- **gui:** config-file editor in settings page (generic get/set resource) ([#59](https://github.com/mmm-05610/agent-box/issues/59)) ([1e92dc7](https://github.com/mmm-05610/agent-box/commit/1e92dc78a1c1e32aa473d5d8bf9072f36c4c092e))

## [1.7.8](https://github.com/mmm-05610/agent-box/compare/v1.7.7...v1.7.8) (2026-08-15)

### Bug Fixes

- **registry:** claude provider missing metadata_fields — active provider not detected ([#57](https://github.com/mmm-05610/agent-box/issues/57)) ([6ec3415](https://github.com/mmm-05610/agent-box/commit/6ec3415db24f782f2f194bfe197627d7c9ec2340))

## [1.7.7](https://github.com/mmm-05610/agent-box/compare/v1.7.6...v1.7.7) (2026-08-15)

### Bug Fixes

- **gui:** silent update + manual reopen (drop auto-relaunch) ([#55](https://github.com/mmm-05610/agent-box/issues/55)) ([f00e847](https://github.com/mmm-05610/agent-box/commit/f00e8471945f6eb34e9f4d7948b5eb066bb96dd7))

## [1.7.6](https://github.com/mmm-05610/agent-box/compare/v1.7.5...v1.7.6) (2026-08-15)

### Bug Fixes

- **registry:** claude runtime missing config_files — provider tab blank ([#53](https://github.com/mmm-05610/agent-box/issues/53)) ([a5aca2e](https://github.com/mmm-05610/agent-box/commit/a5aca2ecb379fee1652230d933b6e44e93144ec0))

## [1.7.5](https://github.com/mmm-05610/agent-box/compare/v1.7.4...v1.7.5) (2026-08-15)

### Bug Fixes

- clear _PYI_APPLICATION_HOME_DIR (the real _MEI leak) + revert broken cmd fix ([#51](https://github.com/mmm-05610/agent-box/issues/51)) ([c91f893](https://github.com/mmm-05610/agent-box/commit/c91f893e483d7be03ba920705832c0648074c08d))

## [1.7.4](https://github.com/mmm-05610/agent-box/compare/v1.7.3...v1.7.4) (2026-08-15)

### Bug Fixes

- **build:** scrub PyInstaller env vars in installer's [Run] postinstall ([#49](https://github.com/mmm-05610/agent-box/issues/49)) ([b48824b](https://github.com/mmm-05610/agent-box/commit/b48824bb0ec33eb034b0e2c584561c82e00a3fb5))

## [1.7.3](https://github.com/mmm-05610/agent-box/compare/v1.7.2...v1.7.3) (2026-08-15)

### Bug Fixes

- scrub _MEI pollution from agent env + cleanup stale extraction dirs ([#47](https://github.com/mmm-05610/agent-box/issues/47)) ([e12cc0a](https://github.com/mmm-05610/agent-box/commit/e12cc0a6cd959d51dd1d4100e4725d0de4979a55))

## [1.7.2](https://github.com/mmm-05610/agent-box/compare/v1.7.1...v1.7.2) (2026-08-15)

### Bug Fixes

- **gui:** clear _MEIPASS before launching the update installer ([#45](https://github.com/mmm-05610/agent-box/issues/45)) ([51ae9e6](https://github.com/mmm-05610/agent-box/commit/51ae9e603de9cdd7ac986ef043b8de986f434195))

## [1.7.1](https://github.com/mmm-05610/agent-box/compare/v1.7.0...v1.7.1) (2026-08-15)

### Bug Fixes

- **build:** stage data_wsl.py + verify Windows bridge module ([#39](https://github.com/mmm-05610/agent-box/issues/39)) ([7574802](https://github.com/mmm-05610/agent-box/commit/7574802bba1684e7c0873179c09d3777bf4dd0cc))

## [1.7.0](https://github.com/mmm-05610/agent-box/compare/v1.6.4...v1.7.0) (2026-08-11)

### Features

- **gui:** run the update installer with its wizard visible + auto-relaunch ([#42](https://github.com/mmm-05610/agent-box/issues/42)) ([3297f3a](https://github.com/mmm-05610/agent-box/commit/3297f3ac84e7b55a7566a6d82db36c643b0363d6))

## [1.6.4](https://github.com/mmm-05610/agent-box/compare/v1.6.3...v1.6.4) (2026-08-11)

### Bug Fixes

- **gui:** force-kill the running app before the silent update install ([#40](https://github.com/mmm-05610/agent-box/issues/40)) ([1b8eadf](https://github.com/mmm-05610/agent-box/commit/1b8eadf7ef5b632b034138a62d5548883f69f59d))

## [1.6.3](https://github.com/mmm-05610/agent-box/compare/v1.6.2...v1.6.3) (2026-08-11)

### Bug Fixes

- **gui:** update-install reliability + force re-check + no-shutdown Windows build ([#37](https://github.com/mmm-05610/agent-box/issues/37)) ([d38f8b5](https://github.com/mmm-05610/agent-box/commit/d38f8b5e719ea70a0c3f7c21b47e881aa1018d15))

## [1.6.2](https://github.com/mmm-05610/agent-box/compare/v1.6.1...v1.6.2) (2026-08-07)

### Bug Fixes

- **gui:** install stall hint + ACS terminal sudo install ([#35](https://github.com/mmm-05610/agent-box/issues/35)) ([3a5fc86](https://github.com/mmm-05610/agent-box/commit/3a5fc867c4e16473c323cf1ba885618cc1e5d92b))

## [1.6.1](https://github.com/mmm-05610/agent-box/compare/v1.6.0...v1.6.1) (2026-08-07)

### Bug Fixes

- **gui:** reliable self-update + ACS runtime-lib detection ([#33](https://github.com/mmm-05610/agent-box/issues/33)) ([ad502c7](https://github.com/mmm-05610/agent-box/commit/ad502c739e43c8010180d65a3f4ccc35eb695eeb))

## [1.6.0](https://github.com/mmm-05610/agent-box/compare/v1.5.5...v1.6.0) (2026-08-07)

### Features

- **gui:** async agent install with live progress — detached process, elapsed + output, readable errors ([#31](https://github.com/mmm-05610/agent-box/issues/31)) ([d0b207b](https://github.com/mmm-05610/agent-box/commit/d0b207bab47d56513414cfb66d15bbf6e05c5c15))

## [1.5.5](https://github.com/mmm-05610/agent-box/compare/v1.5.4...v1.5.5) (2026-08-07)

### Bug Fixes

- **gui:** hermes install via install.sh (cc-switch) — self-contained, no pip/env dependency ([#29](https://github.com/mmm-05610/agent-box/issues/29)) ([a779c4b](https://github.com/mmm-05610/agent-box/commit/a779c4b39b88c0893bc471bbd46461afcf7faefc))

## [1.5.4](https://github.com/mmm-05610/agent-box/compare/v1.5.3...v1.5.4) (2026-08-07)

### Bug Fixes

- **gui:** map download progress snake_case fields — progress bar was never rendering ([#27](https://github.com/mmm-05610/agent-box/issues/27)) ([2f91476](https://github.com/mmm-05610/agent-box/commit/2f91476a538dc340778d7ff59d0aa3c29f0f32ce))

## [1.5.3](https://github.com/mmm-05610/agent-box/compare/v1.5.2...v1.5.3) (2026-08-07)

### Bug Fixes

- **gui:** version check via releases.atom feed (no GitHub API rate limit) + 10min cache ([#25](https://github.com/mmm-05610/agent-box/issues/25)) ([f3a9cd0](https://github.com/mmm-05610/agent-box/commit/f3a9cd05b8a59ff2828e2f303575fdefc28d9514))

## [1.5.2](https://github.com/mmm-05610/agent-box/compare/v1.5.1...v1.5.2) (2026-08-07)

### Bug Fixes

- **gui:** bound hermes install — pip --timeout 30, curl --max-time 120 (no more 600s hang) ([#23](https://github.com/mmm-05610/agent-box/issues/23)) ([e11a790](https://github.com/mmm-05610/agent-box/commit/e11a790ec997fd622b3555d6367807d2e810f738))

## [1.5.1](https://github.com/mmm-05610/agent-box/compare/v1.5.0...v1.5.1) (2026-08-07)

### Bug Fixes

- **gui:** hermes install prefers pip (no hang); install vs update note wording ([#21](https://github.com/mmm-05610/agent-box/issues/21)) ([1ef9c2d](https://github.com/mmm-05610/agent-box/commit/1ef9c2dce5cd6cbb6bdcb8e7159be25d80f1feb3))

## [1.5.0](https://github.com/mmm-05610/agent-box/compare/v1.4.0...v1.5.0) (2026-08-06)

### Features

- **gui:** update install confirm dialog — no console flashes, silent installer closes running app ([#19](https://github.com/mmm-05610/agent-box/issues/19)) ([860ef21](https://github.com/mmm-05610/agent-box/commit/860ef21ba89344b57eefadb0351bda1a9729c136))

## [1.4.0](https://github.com/mmm-05610/agent-box/compare/v1.3.0...v1.4.0) (2026-08-06)

### Features

- **gui:** BITS async update download — proxy-aware, resumable, progress bar, no window ([#15](https://github.com/mmm-05610/agent-box/issues/15)) ([864445a](https://github.com/mmm-05610/agent-box/commit/864445aa8398197deb861e70083a3bec873b2732))

### Bug Fixes

- **gui:** ENOTEMPTY self-heal parses npm 10 rename output ([#18](https://github.com/mmm-05610/agent-box/issues/18)) ([e524c5e](https://github.com/mmm-05610/agent-box/commit/e524c5e02b6f65d408acbaabfc93d19d117acbaa))

## [1.3.0](https://github.com/mmm-05610/agent-box/compare/v1.2.0...v1.3.0) (2026-08-06)

### Features

- **gui:** targeted prereq hints on failed agent install ([#14](https://github.com/mmm-05610/agent-box/issues/14)) ([9dd4abc](https://github.com/mmm-05610/agent-box/commit/9dd4abc0151e379e43c19d06d168618b49bde546))

### Bug Fixes

- **build:** OutputBaseFilename derives from MyAppVersion (Inno has no inline ; comment); verify extract handles PyInstaller 6 typecode ([#13](https://github.com/mmm-05610/agent-box/issues/13)) ([c86b3e7](https://github.com/mmm-05610/agent-box/commit/c86b3e738c7677430b855c77663fb91bb8001c0c))
- **build:** stage cc-switch into build/runtime + verify install field ([#11](https://github.com/mmm-05610/agent-box/issues/11)) ([3971806](https://github.com/mmm-05610/agent-box/commit/3971806361a5aa362785b159b5554d0b4a55f661))

## [1.2.0](https://github.com/mmm-05610/agent-box/compare/v1.1.0...v1.2.0) (2026-08-06)

### Features

- **gui:** Environment page — binary detection, version check, silent batch install/update ([#9](https://github.com/mmm-05610/agent-box/issues/9)) ([5fd497b](https://github.com/mmm-05610/agent-box/commit/5fd497b69df4be691a1f0bf1784bb392bff78568))

### Bug Fixes

- **ci:** restore package-name + include-component-in-tag=false for v-prefixed tags ([#7](https://github.com/mmm-05610/agent-box/issues/7)) ([2de4579](https://github.com/mmm-05610/agent-box/commit/2de457907768d079467259790b8c173b65f92064))
- **ci:** setup.iss version sync via release-please markers; auto README badges ([#10](https://github.com/mmm-05610/agent-box/issues/10)) ([f0e2f58](https://github.com/mmm-05610/agent-box/commit/f0e2f582790390497bb85e9e62995816e17ea93d))

## [1.1.0](https://github.com/mmm-05610/agent-box/compare/agent-box-cli-v1.0.0...agent-box-cli-v1.1.0) (2026-08-06)

### Features

- add ACS as submodule (agent-config-store) ([9af10af](https://github.com/mmm-05610/agent-box/commit/9af10afab98499a3bf41752aa4a9e802d378cf59))
- add ACS launcher button in sidebar + bridge API ([6e627e2](https://github.com/mmm-05610/agent-box/commit/6e627e2169da71af616c61fef8491b3f99c7d632))
- add ccswitch_adapter + wire CLI provider list/show to ACS ([aec5627](https://github.com/mmm-05610/agent-box/commit/aec562773f695ef8fbf80387e0ef65db1102383a))
- add filter input + clear button for installed skills ([2f92ed3](https://github.com/mmm-05610/agent-box/commit/2f92ed32c0a20d7ee32e4c06018d92a29b03cb02))
- add Inno Setup installer script (setup.iss) ([9313dce](https://github.com/mmm-05610/agent-box/commit/9313dce014e9dc9a1bf9ed78814ffb17c876af99))
- add library page + providers/claude-mds CRUD + DB layer ([cc48476](https://github.com/mmm-05610/agent-box/commit/cc484765b5d5a4179ec07a7cabf50bfbdb07e2b7))
- add logo — window icon, exe branding, README hero ([ad8f4a5](https://github.com/mmm-05610/agent-box/commit/ad8f4a53f252aec0cd1ad7ec34fae71cd62bec5e))
- add native directory browser button per profile row ([5ffaf69](https://github.com/mmm-05610/agent-box/commit/5ffaf6911f9b95fe30673a345160fdc41cf4cd9c))
- add per-profile working directory selector to GUI launch ([457bfd8](https://github.com/mmm-05610/agent-box/commit/457bfd83f2ba63c20b87e364a207cde52f18e4c8))
- add Subagent model role to Claude provider forms ([e86993f](https://github.com/mmm-05610/agent-box/commit/e86993fd32a3402565fd733379369b986920c7d3))
- **agent-type:** permissions structure for all four agents (blocks) ([894ed13](https://github.com/mmm-05610/agent-box/commit/894ed1350dd5f37602495887ca7b2f170d693145))
- **agent-type:** serve brand color/logo from backend registry ([b39769f](https://github.com/mmm-05610/agent-box/commit/b39769f0573ad56833d91f3fd61c54d994edfa90))
- **api:** expose FetchedModel + mimocode agent type ([21431ab](https://github.com/mmm-05610/agent-box/commit/21431ab05e48ccd390c616e18c8cbf0ec46e3bbe))
- apply provider overwrites full form with ACS metadata (_provider) ([59a32d6](https://github.com/mmm-05610/agent-box/commit/59a32d6b4559917017c6bf8377537884ba004767))
- apply_provider supports Claude/Codex/Hermes/OpenCode — full overwrite per agent type ([8026f18](https://github.com/mmm-05610/agent-box/commit/8026f18c9f3b0b19c6f61885cf466e9269231cb1))
- auto-detect zombie sessions via PID liveness check ([978b19b](https://github.com/mmm-05610/agent-box/commit/978b19bd6c0f002d94d8707ec3e36a26c84e79b6))
- **backend:** provider CRUD extensions, library path handling ([75b1cdb](https://github.com/mmm-05610/agent-box/commit/75b1cdb1f07cbf799408788d2a7669af9e9d4869))
- **bridge:** add list_dir_tree for VSCode-like storage pane ([1da270a](https://github.com/mmm-05610/agent-box/commit/1da270aa6eed6659e8a80fd9f91e61e0ee63e24b))
- **bridge:** dual-mode data access + frontend settings localStorage + cleanup ([a532207](https://github.com/mmm-05610/agent-box/commit/a53220705b42b02e5237b3ab371e3f9b84edc59c))
- **bridge:** expose get_agent_configs() API ([6ef4922](https://github.com/mmm-05610/agent-box/commit/6ef49226fcb401636125f125d730996729ecf478))
- **bridge:** wire save_provider via stdin so dialogs can submit JSON ([9ebba92](https://github.com/mmm-05610/agent-box/commit/9ebba92819eb13fee6ab0cf3331419aead6c51f9))
- Claude Code config inventory + Profile tabs + cc-switch style provider form ([d3aea38](https://github.com/mmm-05610/agent-box/commit/d3aea3801aa46e3fdd5e2189261fca45105b964d))
- Claude/Codex apply — show Active badge on applied provider ([7fd8ef0](https://github.com/mmm-05610/agent-box/commit/7fd8ef0d259b2ad2a2da642334e95094685ef478))
- complete P1 Hermes form improvements ([94d3fbf](https://github.com/mmm-05610/agent-box/commit/94d3fbf9cf7e92c2e64c8b48632802d3341a2539))
- component library (v0.2.0) — 54 built-in providers, 12 MCP servers, SQLite-backed ([22c863e](https://github.com/mmm-05610/agent-box/commit/22c863e215e81ed7f9c6f003347c8bcaa46a597e))
- **config:** agent display config fact source ([899bb26](https://github.com/mmm-05610/agent-box/commit/899bb2650de209e9992dc7f5704f0073de7c8801))
- **core:** add agent_types.json registry (agent-type format v1) ([ffd0c4e](https://github.com/mmm-05610/agent-box/commit/ffd0c4e78197956bf64c4d4eb9c0b2f9a69bb43c))
- **db:** version-numbered migration system ([96c2147](https://github.com/mmm-05610/agent-box/commit/96c214711458cc1517e8460445b38470c778f29c))
- **detail:** registry-driven tabs ([c267c00](https://github.com/mmm-05610/agent-box/commit/c267c00c39229c33f8e4223735bdd693edd9ef5a))
- **detail:** static tab schema registry (TDD) ([217db36](https://github.com/mmm-05610/agent-box/commit/217db3655998d48d50dfdf1b675f9f03eb01fbbd))
- **domains:** migrate agent-specific tabs + Hermes hooks (stage 8b) ([d66e11f](https://github.com/mmm-05610/agent-box/commit/d66e11f4d305cd9640a0a3266abb27b2fa5ef478))
- **domains:** migrate resource components into domains ([7e0ef69](https://github.com/mmm-05610/agent-box/commit/7e0ef697ad1669f9dca1041bcd1a2daaf990a51e))
- **domains:** resource registry framework ([9a8dbea](https://github.com/mmm-05610/agent-box/commit/9a8dbea29934b004415d432ceadbdf6484c12b3b))
- fill P0 gaps — Codex upstream format/Anthropic/PromptCache/DefaultModel, OpenCode headers/token limits, Claude subagent/auto-sync ([149f344](https://github.com/mmm-05610/agent-box/commit/149f3449689f7f0e397dca92c71e8c4a86c01711))
- **frontend:** agent-type registry API + useAgentConfigs + config colors ([e37a0f4](https://github.com/mmm-05610/agent-box/commit/e37a0f4e9fbd26479c806daa8710a67c7ede7c91))
- **frontend:** bootstrap Monaco editor with local bundle + toml lang ([339521b](https://github.com/mmm-05610/agent-box/commit/339521b7c5b9d740c7a63bf40aa9ff7a2ed2421a))
- **frontend:** default agent type from backend, no hardcoded 'claude' ([308b87b](https://github.com/mmm-05610/agent-box/commit/308b87b4e8a3f9ba36ea33e6079e55b40247a9da))
- **frontend:** default projects_dir ~/ + home-relative path display ([2f9e2ac](https://github.com/mmm-05610/agent-box/commit/2f9e2ac16805472cc19513a533c8823b5ff31c83))
- **frontend:** make yaml hooks editor editable (hooks fragment only) ([22b61bb](https://github.com/mmm-05610/agent-box/commit/22b61bb795fe66c6089c4f2136a49984c8d73f9c))
- **frontend:** opencode provider active via last-applied provider_ref ([d3742bb](https://github.com/mmm-05610/agent-box/commit/d3742bb7d8941c374f9768e2ba3047054e96185c))
- **frontend:** recent sessions show last-launched + last-closed ([b27e32a](https://github.com/mmm-05610/agent-box/commit/b27e32a2d680258318907c3352368f02d8d7374b))
- **frontend:** version from backend (get_version + useVersion) ([5d6d164](https://github.com/mmm-05610/agent-box/commit/5d6d1649f1b103ea81aa9913d34157fbe2f914ab))
- GUI profile creation, MCP tab for all agent types, delete confirmation, library cleanup ([8a07e76](https://github.com/mmm-05610/agent-box/commit/8a07e768aa451f9499031ba3e0dd47dc9456503b))
- **gui-web:** add Profile Detail page with navigation ([3602810](https://github.com/mmm-05610/agent-box/commit/360281029708333f40d3f8eba6cbc27e293a92c4))
- **gui-web:** add UI components, feedback components, layout, and pages ([b3bddd7](https://github.com/mmm-05610/agent-box/commit/b3bddd747ac7e735638b421e30fafc76c3005df4))
- **gui-web:** configurable projects dir in Settings, no hardcoding ([5b1ed49](https://github.com/mmm-05610/agent-box/commit/5b1ed4937fb117a1ed2499cf0d1243cfe063ecc2))
- **gui-web:** connect to Python backend via PyWebView bridge ([ca72341](https://github.com/mmm-05610/agent-box/commit/ca7234156bbc4033192350de26f69a32f0473c84))
- **gui-web:** detail page reads settings.json and CLAUDE.md ([3c10cbd](https://github.com/mmm-05610/agent-box/commit/3c10cbd12dbcaa80e51734c795190e1f0b2cc7e4))
- **gui-web:** detail page with tabs per agent type ([7304997](https://github.com/mmm-05610/agent-box/commit/73049979ccb2985f37b96db6446f7aabccfc73e5))
- **gui-web:** implement all 6 pages with API layer and hooks ([54f3234](https://github.com/mmm-05610/agent-box/commit/54f32349c3d0a9984c3e465b9b9892f633b9ad17))
- **gui-web:** implement profile launch via bridge ([4bf7780](https://github.com/mmm-05610/agent-box/commit/4bf778028f0d37177e44fe8905a0cb81e8e1083c))
- **gui-web:** launch with mode selector and cwd input ([f36574a](https://github.com/mmm-05610/agent-box/commit/f36574acfa57cad4554005ce428d0e1e492bc271))
- **gui-web:** Library MCP + Skills tabs ([aedc7b1](https://github.com/mmm-05610/agent-box/commit/aedc7b1f6dfb7011cf3913caa0eee04150b831cc))
- **gui-web:** library page — cc-switch style redesign ([ee5af94](https://github.com/mmm-05610/agent-box/commit/ee5af9432b66c696d888b2041ca05371ffaebc6b))
- **gui-web:** profiles — last cwd from sessions + native browse dialog ([af1a228](https://github.com/mmm-05610/agent-box/commit/af1a228fd0a9853591fc09896a0c60c2f6f5e78f))
- **gui-web:** profiles card redesign with provider chip, active glow, and glass effect ([f70a7de](https://github.com/mmm-05610/agent-box/commit/f70a7de99b53643ac03058b345cd4484a1e1d47a))
- **gui-web:** scaffold React + Vite + Tailwind + design system ([8b3b9ff](https://github.com/mmm-05610/agent-box/commit/8b3b9ff28e71325102092b245ae28e4d65896a67))
- **gui:** cc-switch style provider form dialogs + endpoint test ([cfc2ad7](https://github.com/mmm-05610/agent-box/commit/cfc2ad7b707bde705016cb42e08f445416ab2ede))
- **gui:** decouple GUI from the agent-box CLI — RPC library shim ([7faa64d](https://github.com/mmm-05610/agent-box/commit/7faa64dc624be0f5edf36482e5036c2af2650f0b))
- **gui:** editable detail tabs, profile delete, save with staleness detection ([f326833](https://github.com/mmm-05610/agent-box/commit/f326833838cf826e623396228b12f639cefea82a))
- **gui:** Environment page — binary detection, one-click install, ACS auto-provision, update badge ([c320d6b](https://github.com/mmm-05610/agent-box/commit/c320d6b3435ea302ab8709d33ed52e9dfe4e620e))
- **gui:** phase 2 visual polish — buttons, cards, redesigned profile rows, color tuning ([5681677](https://github.com/mmm-05610/agent-box/commit/5681677a7d8b7a14ad2ee38115861f451cfdca8e))
- **gui:** phase 3 interaction polish — page cache, async refresh, sqlite threading, incremental list ([cb4999d](https://github.com/mmm-05610/agent-box/commit/cb4999dbbbbbe31f79cb3f7ed7dc55fb4ec0b006))
- **gui:** phase 4 feature completion — detail page, wizard, provider, markdown editor ([621c966](https://github.com/mmm-05610/agent-box/commit/621c966090b41f55798c8e6ab1868861f0e8626e))
- **gui:** raw-edit auth.json (codex/opencode Auth tab) ([30ae248](https://github.com/mmm-05610/agent-box/commit/30ae2484bd52ad0787e0f35653b64aa7192cafd6))
- **gui:** Windows host has zero agent-box dependency ([338fddd](https://github.com/mmm-05610/agent-box/commit/338fddd2d040d3a41097a4d1a59faaa9098e0c7a))
- Hermes — extract models from YAML + pass to form, full overwrite apply ([b37330f](https://github.com/mmm-05610/agent-box/commit/b37330ffd9aeda9646fd29f9a875bb799997fee0))
- Hermes apply — full YAML overwrite from ACS settings_config ([782b0d3](https://github.com/mmm-05610/agent-box/commit/782b0d3f74fbc27916ec61d6c6de445dc0164265))
- Hermes apply — read ACS models array + patch full model list to config.yaml ([0cd8d14](https://github.com/mmm-05610/agent-box/commit/0cd8d14f5226ff88008ffeb062e8e73d7d059e73))
- Hermes apply — read api_mode from ACS settings ([e1ded9c](https://github.com/mmm-05610/agent-box/commit/e1ded9cc7319370c8f99584c6c139ef2660394d7))
- Hermes CC Switch style — model + custom_providers, Add/Remove/Switch ([0a390ab](https://github.com/mmm-05610/agent-box/commit/0a390aba0edd925562f549c618f429e51abc9361))
- Hermes providers section — Add appends, Activate overwrites top-level ([6eb4b0f](https://github.com/mmm-05610/agent-box/commit/6eb4b0f7d074357983466f630e7b243221576761))
- Hermes URL validation + editable settings.json ([73bee7f](https://github.com/mmm-05610/agent-box/commit/73bee7f409a3e8b4459eb96924b7e4789dfc2513))
- Hermes/OpenCode additive provider mode — Add/Remove/Activate ([277bfe9](https://github.com/mmm-05610/agent-box/commit/277bfe93ac5cb81fa61a8a7d2d1ed84a0f2dd0ca))
- hide Library tab (ACS migration prep) ([80bf134](https://github.com/mmm-05610/agent-box/commit/80bf13406842767ca2c316607500befe16be24ef))
- **hooks:** library/object split ([71af132](https://github.com/mmm-05610/agent-box/commit/71af132482f559f2dc277faf1ec93ede6b4b030c))
- **i18n:** i18next infra + general UI surface (stage 7a) ([37124c6](https://github.com/mmm-05610/agent-box/commit/37124c68cbe1f5b997a069ff17b69cf419dc5ab3))
- **i18n:** provider form surface (stage 7b) ([3d91c24](https://github.com/mmm-05610/agent-box/commit/3d91c24d124c23b0f732463fe17627260a0b7234))
- **library:** cc-switch style card redesign for provider rows ([41f49ba](https://github.com/mmm-05610/agent-box/commit/41f49ba732b102a168670a299bcc100c5f939984))
- **library:** cc-switch style provider form, delete confirmation, deepseek restore, endpoint test ([0e0e586](https://github.com/mmm-05610/agent-box/commit/0e0e586009e71b5c0ea8568b8ca3c06bbb3589e1))
- McpTab — Available/Installed/Detail pattern matching SkillsTab ([3c9731c](https://github.com/mmm-05610/agent-box/commit/3c9731cd895f96c7c9b1cd08010c5d1f78b3c25c))
- persist projects_dir backend-side (gui-settings.json) ([9b0a5f6](https://github.com/mmm-05610/agent-box/commit/9b0a5f6456cc8f8a89af131b98f2e1dda7ce106c))
- PromptTab — Apply from Library + editor for CLAUDE.md/SOUL.md/AGENTS.md ([a5ee9ae](https://github.com/mmm-05610/agent-box/commit/a5ee9ae0cd0dde093a1d5b429485d7b80b3b7d25))
- **provider:** align Claude form with cc-switch (test/billing/proxy/category gating) ([c9d510e](https://github.com/mmm-05610/agent-box/commit/c9d510e4bb1adb83e6fa48c782a7fd967416ead2))
- **provider:** shared form frame + per-agent fields ([b4b6b20](https://github.com/mmm-05610/agent-box/commit/b4b6b2044cb1e46f0c3bc86ed1d2fdd32a0ac391))
- search button with magnifying glass icon, manual trigger ([a051ed4](https://github.com/mmm-05610/agent-box/commit/a051ed484dcbe281964e958c46e39b9c5a4b70fa))
- seed preset system + --preset (WS5) ([32d3c6a](https://github.com/mmm-05610/agent-box/commit/32d3c6a05738e482b5c77362f8f69c7df8ec83d1))
- show Add only for skills with source on disk, mark missing as — ([99ca608](https://github.com/mmm-05610/agent-box/commit/99ca608dcd3d17cf9ee3d103b3223f52bd3a409c))
- skill apply/remove from ACS via bridge + CLI ([5173fb1](https://github.com/mmm-05610/agent-box/commit/5173fb1bfff5bc32c99326045bc90c7fbe661457))
- SkillDetailModal — full expanded view matching old inline design ([921d033](https://github.com/mmm-05610/agent-box/commit/921d03375a177eb8410d1c395df95aa3b735ca8c))
- SkillsTab — detail expand + multi-source skill lookup ([8e6fd1f](https://github.com/mmm-05610/agent-box/commit/8e6fd1fa0b1063a6a0bbc5374fb56d020d3f21cd))
- SkillsTab — installed list + searchable ACS library with Add/Remove ([26ad6e9](https://github.com/mmm-05610/agent-box/commit/26ad6e9d35fb6208173453d021630d32be59d3f5))
- SkillsTab — paginated library on top, installed below, Detail modal ([b13abe1](https://github.com/mmm-05610/agent-box/commit/b13abe12b6405118aad1f95c2ab80474e180d744))
- **storage:** flat-file → tree conversion utility (TDD) ([27cf66b](https://github.com/mmm-05610/agent-box/commit/27cf66b465649a0829c2638c54c8d49bfa68aab0))
- **storage:** JSON validation with zod schema registry (TDD) ([4873c18](https://github.com/mmm-05610/agent-box/commit/4873c1871fc3d9960cedc1b4a57caa7444d7393c))
- **storage:** LRU open-files hook (TDD) ([c5f514e](https://github.com/mmm-05610/agent-box/commit/c5f514ea450992f4e4f4b924cc323989d0fbbb92))
- **storage:** Monaco editor panel wrapper ([14fbe6e](https://github.com/mmm-05610/agent-box/commit/14fbe6e9cb9001c9aab060072430d7c40957a89b))
- **storage:** recursive FileTree component ([259ee6f](https://github.com/mmm-05610/agent-box/commit/259ee6f6ceb1adb8b331179108d04f9762c733a9))
- **storage:** SaveBar with dirty/saving state ([7bd770b](https://github.com/mmm-05610/agent-box/commit/7bd770b5f5af6d6584affe09f79d56444ada3318))
- **storage:** VSCode-style Storage tab with Monaco editor (TDD) ([510d3dc](https://github.com/mmm-05610/agent-box/commit/510d3dc40995dd63f706d8c8fd072b9672e04f68))
- **storage:** VSCode-style tree + plain textarea (drop Monaco/zod) ([afab026](https://github.com/mmm-05610/agent-box/commit/afab02644d3654e81e5b561ce898d43ea42ede05))
- **storage:** wire list_dir_tree + plumb size/mtime through (PR 1 review I-1) ([5076357](https://github.com/mmm-05610/agent-box/commit/50763576662fa18fe72d1ab95d23df2a2e337a1a))
- **templates:** add mimocode and mimocode-data templates ([e376c92](https://github.com/mmm-05610/agent-box/commit/e376c927f4dc14fd71d9389fbf7ef9387ad79598))
- transparent logo + sidebar brand icon + spec datas fix ([e82f0c8](https://github.com/mmm-05610/agent-box/commit/e82f0c82045899d8029f8d3b3d479983f6b9b347))
- use ClaudeProviderForm in profile detail + enable Hermes library form ([7548348](https://github.com/mmm-05610/agent-box/commit/7548348e0539397901f4d0621b56315fde30e108))
- v0.3.0 library rework — built-in constants, user_overrides, template hardening ([afe664a](https://github.com/mmm-05610/agent-box/commit/afe664a44a79979af6e549e9382f16768270b0cb))
- Windows Desktop GUI (Tkinter) for agent-box launch panel ([ea2f345](https://github.com/mmm-05610/agent-box/commit/ea2f3455294fb86b54cf47f33b1c57cbec3fdc1b))
- wire wizard fields to create + meta.yaml (display_name, description, provider, claude_md) ([1d7ea5c](https://github.com/mmm-05610/agent-box/commit/1d7ea5cba0f5873129f2731a6511940216827d4b))

### Bug Fixes

- _to_wsl_path deterministic UNC/drive conversion ([ebbbd1c](https://github.com/mmm-05610/agent-box/commit/ebbbd1c7375e513eb87632e59d478ec7a45942fe))
- **acs:** resolve relative skill directories against skills_source_dir ([10f5cb9](https://github.com/mmm-05610/agent-box/commit/10f5cb90495a2756f0488166a4e09334425f651c))
- **adapters:** add get_skill and get_prompt to **init**.py exports ([d4c65cd](https://github.com/mmm-05610/agent-box/commit/d4c65cdd478bf8f16fcfa1a376ecebb08b6069e0))
- add configFiles to TabContent destructuring ([0049bcd](https://github.com/mmm-05610/agent-box/commit/0049bcdfe9a785b9802be0406847045c1c682f63))
- add PIL to pyinstaller hidden imports ([2712f11](https://github.com/mmm-05610/agent-box/commit/2712f1112643b78beac22aa515fed22824f29ee1))
- bridge list_library_skills returns raw JSON string for frontend ([eed915c](https://github.com/mmm-05610/agent-box/commit/eed915c012e4567af47b33063570dbd87f01f52a))
- bridge save_file quoting + apply _provider metadata for Codex/Hermes/OpenCode ([f459178](https://github.com/mmm-05610/agent-box/commit/f4591781ec4c544d9aea4203bef8068c6e67783f))
- **bridge:** route list_dir_tree through wsl_run for WSL paths (PR 1 review C-1 round 2) ([6bf7dc2](https://github.com/mmm-05610/agent-box/commit/6bf7dc276b5c912ccabe76487db7fc24cca98e3c))
- **bridge:** surface list_dir_tree errors instead of fake-empty success ([1b4c6af](https://github.com/mmm-05610/agent-box/commit/1b4c6afc58f94163fdef71bff7ac8d4d03604751))
- browse_dir returns WSL paths in Windows host mode ([8eda76c](https://github.com/mmm-05610/agent-box/commit/8eda76ceb85cf09f86d12da9cd8db2a154f6f118))
- correct Profile screenshot filename (Profiles.png → Profile.png) ([b8b1efc](https://github.com/mmm-05610/agent-box/commit/b8b1efc6f5d034719c2efd016aa1eba9b676619f))
- **db:** use core.io.read_text for migration file reads ([4a6c6a9](https://github.com/mmm-05610/agent-box/commit/4a6c6a98fd8666bbbb1bb3243a19e8074b2c0bbd))
- detail page React [#310](https://github.com/mmm-05610/agent-box/issues/310) — hooks after early returns ([7d95703](https://github.com/mmm-05610/agent-box/commit/7d95703fb05a8f83ab32c873ef7e779e5b9b07e6))
- disable New Profile button (feature not ready for v0.4.0) ([1cb9894](https://github.com/mmm-05610/agent-box/commit/1cb98942b3c13334c5da0a14e408a07e3dffedcf))
- force Available card re-render after add/remove via tick key ([4d4c239](https://github.com/mmm-05610/agent-box/commit/4d4c2395f8081444bd9853debde3b2f3b9263f54))
- **frontend:** component type surface + dead code cleanup ([feb7d19](https://github.com/mmm-05610/agent-box/commit/feb7d19de7cff14804616c0ca7648895d97003bd))
- **frontend:** non-null-assert bridge calls in api layer ([25347d3](https://github.com/mmm-05610/agent-box/commit/25347d39f2f37a4089f7bc0c51d0b478e97dfc2c))
- **frontend:** resolve yaml hook script paths from backend config_dir, not hardcoded ([76bcc76](https://github.com/mmm-05610/agent-box/commit/76bcc76a45ebad2ec4f0c6bb43606c54cb89eeec))
- **frontend:** restore toClaudeMd + clear remaining noUncheckedIndexedAccess errors ([c95301c](https://github.com/mmm-05610/agent-box/commit/c95301c7ecbbc58c49e5c2899ec7fe65c7d00b03))
- GUI subprocess cwd=C:\ to avoid wsl.exe UNC path translation ([1afcf55](https://github.com/mmm-05610/agent-box/commit/1afcf5538a21d436ea1f3e12cd331faea376447b))
- **gui:** _to_wsl_path handles wsl.localhost UNC — dev-mode runtime broke over 9P share ([583bf9f](https://github.com/mmm-05610/agent-box/commit/583bf9f94707b37ed968d77d011296f4901966da))
- **gui-web:** bridge bugs — undefined WSL_CMD, shell quoting, _run typo ([d960d87](https://github.com/mmm-05610/agent-box/commit/d960d87a6685c4adfe3987a51a4fa59c827e0562))
- **gui-web:** bridge returns empty string for missing files ([97cca17](https://github.com/mmm-05610/agent-box/commit/97cca17c33398709a1938976fe28ba51004cbdde))
- **gui-web:** bridge.py uses same WSL pattern as old GUI ([ad11c75](https://github.com/mmm-05610/agent-box/commit/ad11c75a88ae2e640a3e3059e6a80c919b59bd6a))
- **gui-web:** bridge.ts awaits async PyWebView API methods ([15e0012](https://github.com/mmm-05610/agent-box/commit/15e0012ecdcfb652b0f29081ad186dbfaa7d7e4c))
- **gui-web:** browse dialog — use PyWebView native dialog, default to ~/projects ([1fe7762](https://github.com/mmm-05610/agent-box/commit/1fe776261aab53d919f9fe352f95001f25044df7))
- **gui-web:** convert snake_case from CLI, fetch real data on Home ([0a2e1e4](https://github.com/mmm-05610/agent-box/commit/0a2e1e480a3a8f424ce1dfabea0759ee7bd3a0ca))
- **gui-web:** correct sessions CLI syntax ([9ecb705](https://github.com/mmm-05610/agent-box/commit/9ecb70524066e9337abeb95a6a23660a07fc9b5e))
- **gui-web:** default bridge to localhost:5173, add --prod flag ([84cb538](https://github.com/mmm-05610/agent-box/commit/84cb538bbd90b335dbdeb8dd56c21805f89b2229))
- **gui-web:** detail page uses listDir for plugins and storage ([284e930](https://github.com/mmm-05610/agent-box/commit/284e930776333f9af09e07ed8d9a2b56631cf964))
- **gui-web:** detail page uses raw API data ([caaf0c4](https://github.com/mmm-05610/agent-box/commit/caaf0c4f0baf5828f72522524622be584345130e))
- **gui-web:** hooks read from settings.json hooks field ([a5f0c5b](https://github.com/mmm-05610/agent-box/commit/a5f0c5b6a3fb596dd53ae79b9b6600c237173824))
- **gui-web:** plugins tab reads from settings.json enabledPlugins ([609ef81](https://github.com/mmm-05610/agent-box/commit/609ef815e5c1473fe24145c55c9e75f0bd9838ea))
- **gui-web:** poll for PyWebView API instead of event listener ([18e84c1](https://github.com/mmm-05610/agent-box/commit/18e84c18adfcf209207e3b82309c73c47f5ca040))
- **gui-web:** profile View button + provider edit fetches detail ([6850c83](https://github.com/mmm-05610/agent-box/commit/6850c8336aeef0c152028da9646fab07e48bd0df))
- **gui-web:** sidebar nav closes detail page ([30a0db4](https://github.com/mmm-05610/agent-box/commit/30a0db478f44b1fb0a39666cd3c69ae5e043e618))
- **gui-web:** use correct Python function names in bridge ([a8f619e](https://github.com/mmm-05610/agent-box/commit/a8f619e054d5714b643a27130f854e4eb23c079e))
- **gui-web:** use window.pywebview.api instead of window.api ([70f94b8](https://github.com/mmm-05610/agent-box/commit/70f94b8a9c7158475157c484f40bd132bde909d2))
- **gui-web:** wait for _pywebviewready event before calling bridge ([1e51549](https://github.com/mmm-05610/agent-box/commit/1e515496d4f0160020e5c7b589897c0fb2d1b731))
- **gui:** bundle RPC shim deterministically + verify exe runtime before ship ([8f6198f](https://github.com/mmm-05610/agent-box/commit/8f6198f129810150c3dced1be3f940f2516484db))
- **gui:** defensive sys.path + clear error in shim for UNC launches ([776c149](https://github.com/mmm-05610/agent-box/commit/776c149d1b6870a727733a3de648b5f35030bc21))
- **gui:** launch RPC quoting, dev UNC runtime, session pid tracks agent ([2773894](https://github.com/mmm-05610/agent-box/commit/27738947a5fd22c73833105e6036186def0b6e05))
- **gui:** launch_acs resolves the bundled cc-switch correctly ([724b4e3](https://github.com/mmm-05610/agent-box/commit/724b4e39fc386a73e01d99fa5bfc22b4992bd45c))
- **gui:** launch_acs routes through RPC to the WSL cc-switch ([08f5033](https://github.com/mmm-05610/agent-box/commit/08f503305d769a548c0c55ee56e7ef56fa579575))
- **gui:** raw-config editing closed loop for all detail tabs ([e200d09](https://github.com/mmm-05610/agent-box/commit/e200d09855e823c645767da687a15311c4d1126b))
- **gui:** shim writes launch log so silent failures are debuggable ([e36b486](https://github.com/mmm-05610/agent-box/commit/e36b4862e85aef1f8cda510a25a5348eb29103ff))
- **gui:** use importlib in shim to bypass UNC package-import bug ([64821f1](https://github.com/mmm-05610/agent-box/commit/64821f101e0ffdfdaabf6d6c8471076841328235))
- **gui:** WSL setup gate — onboarding screen instead of raw RPC errors ([2cd22de](https://github.com/mmm-05610/agent-box/commit/2cd22de51acfb86fa339d498d19bed91f669622a))
- hardcode version in OutputBaseFilename (ISS preprocessor limitation) ([79865fc](https://github.com/mmm-05610/agent-box/commit/79865fc5ede4ab6ba84cabd65f267eb7b8f10f29))
- Hermes — no .env for additive mode, active provider badge in UI ([d6e43d4](https://github.com/mmm-05610/agent-box/commit/d6e43d4fc8a62f2b87432830f7f050601f4614db))
- Hermes apply — don't call onRefresh which resets key and loses form state ([8723b11](https://github.com/mmm-05610/agent-box/commit/8723b118457633d1e65d962c87e0b2673a0effcd))
- Hermes apply calls backend + file write no longer fatal ([464d981](https://github.com/mmm-05610/agent-box/commit/464d9818bf63ddc60330d8a1a011bba9228aec64))
- **hooks:** use hooks_config_file from registry instead of config_files[0] ([6f41568](https://github.com/mmm-05610/agent-box/commit/6f415688b2d31b75af98d2e7cf900bc438f5d22d))
- JSONC parser — preserve // inside string values (URLs) ([4005355](https://github.com/mmm-05610/agent-box/commit/400535533df722222f19f19d46177d01e9893db3))
- launch --cwd quote handling — use cmd2 argv not arg_list ([37456fa](https://github.com/mmm-05610/agent-box/commit/37456fa4184c7662673d57142cfdddd7e2f7d10d))
- launch ACS via wsl.exe in new console ([d7f37cc](https://github.com/mmm-05610/agent-box/commit/d7f37cccca6b584b2cfa4f5709d4b2696bc40eb7))
- launch ACS via WSLg, no console window ([29fc77a](https://github.com/mmm-05610/agent-box/commit/29fc77a81859aa132468cc3f3899610bf480db64))
- **launch:** registry-driven bwrap sandbox + DEFAULT_AGENT_TYPE ([85b128b](https://github.com/mmm-05610/agent-box/commit/85b128b6c437a15b320842ca051df776f88d0873))
- lazy PIL import in sidebar + collect_all PIL in spec ([15f40cb](https://github.com/mmm-05610/agent-box/commit/15f40cb908a7c135959023f09691ef95e23170f6))
- **library:** badge empty when category cannot be inferred ([5bf41ef](https://github.com/mmm-05610/agent-box/commit/5bf41ef5df1af7c058f2e01ea1b02f21229a044b))
- **library:** correct relative import path for _extract_provider_name ([b4aaf22](https://github.com/mmm-05610/agent-box/commit/b4aaf22723b6be67f26e48d587e5fd503d2edba3))
- **library:** ghost_button already sets text_color, use configure instead ([842807f](https://github.com/mmm-05610/agent-box/commit/842807f6f2476d72c6d475c4877a54463b355705))
- **library:** handle missing settings.env in ProviderCard ([ee14b14](https://github.com/mmm-05610/agent-box/commit/ee14b14797e6364fda6c39d9d7251d1f86b9e81f))
- **library:** P0 — badge inference, row_owners separation, apply concurrency, error retry, collapsible add panel ([45dd310](https://github.com/mmm-05610/agent-box/commit/45dd310499594db87a3178f511cc27001565f37b))
- **library:** sync env category map + scan env values for URLs ([b647e53](https://github.com/mmm-05610/agent-box/commit/b647e533ba69b9297200680a2600edfb74e0973c))
- loadInstalled uses correct root for relative path (ID matching) ([8e0f7a6](https://github.com/mmm-05610/agent-box/commit/8e0f7a6f22807bc8d3d6fa232273ad25041b4aa8))
- make ACS DB path lazy to fix test isolation ([72b85b6](https://github.com/mmm-05610/agent-box/commit/72b85b6cc69e9e0691fbe9b1234bbe7b16038a9c))
- match indented provider line in Hermes model section ([527a2f8](https://github.com/mmm-05610/agent-box/commit/527a2f864a507619d875d45671c64ff5d1710bb5))
- MCP summary NameError + stale sidebar running count ([f9dd3b9](https://github.com/mmm-05610/agent-box/commit/f9dd3b96fdd9a8267aa136afd4a4b7b165c0974d))
- OpenCode — no Activate/Active badge (all providers coexist) ([59a56db](https://github.com/mmm-05610/agent-box/commit/59a56db834b59add121cfdeb1c7721c0d3125718))
- **packaging:** correct deps + package-data + version 0.4.0; resolve profile root dynamically ([b35d810](https://github.com/mmm-05610/agent-box/commit/b35d8103d49beabe3884d70b3869294a42d3495a))
- paginate after filtering — no empty slots for installed/missing skills ([1aa1586](https://github.com/mmm-05610/agent-box/commit/1aa158660f6a77468db2398f7d541664fdfcb946))
- parse session timestamps as UTC (backend datetime('now') = UTC) ([baea79a](https://github.com/mmm-05610/agent-box/commit/baea79a97d613dffb29599680b9c9493be5411f6))
- pass configFiles to TabContent inner component ([bfe90ff](https://github.com/mmm-05610/agent-box/commit/bfe90ffa414ea7be89a66fc0fb6405f4985a6ee2))
- Popen argv already includes bwrap as argv[0] ([b2cbd6e](https://github.com/mmm-05610/agent-box/commit/b2cbd6e6aa3707093c3cd12953a32d8a4708e39d))
- **profile:** correct Sphinx cross-ref :mod:.db -&gt; :mod:agent_box.core.db ([6453041](https://github.com/mmm-05610/agent-box/commit/6453041e187da19f9ca95097958643cc38e9d592))
- **profile:** remove dead .get() fallback in show — agent_type always present ([d8fa148](https://github.com/mmm-05610/agent-box/commit/d8fa1485bc005dafdea2137178655453a9ad0c57))
- **profile:** use core.io read_text/write_text for preset merge ([c92bc55](https://github.com/mmm-05610/agent-box/commit/c92bc55241dc0ad2d2f7fdc0719a90a83d752b49))
- **profile:** use registry prompt_file instead of hardcoded CLAUDE.md ([1a006a8](https://github.com/mmm-05610/agent-box/commit/1a006a85d9989ae0733e7cc2122462dbfc06e7d0))
- **provider:** move ProviderAdvancedConfig inside scrolling body ([8b14264](https://github.com/mmm-05610/agent-box/commit/8b14264e0dbd671a46c93b68721526b81880479b))
- **providers:** also infer category from settings.name ([f201005](https://github.com/mmm-05610/agent-box/commit/f20100553179c0df9e3b04ffc763b9cd636d9a4f))
- **providers:** infer category from ANTHROPIC_BASE_URL domain, not env key prefix ([59ed286](https://github.com/mmm-05610/agent-box/commit/59ed286fda085cde17468a97fabe09097969ad1e))
- **providers:** list_profile_providers reads the config file as truth ([2f04cd9](https://github.com/mmm-05610/agent-box/commit/2f04cd9298f7e84a9b8405a518788ebb6f35af35))
- **providers:** read notes from ACS provider row, not settings_config ([825264f](https://github.com/mmm-05610/agent-box/commit/825264f83bfed41ddecd7b19277fe1d3d6c611ce))
- **providers:** remove dead _build_hermes_yaml_entry function ([3a872a4](https://github.com/mmm-05610/agent-box/commit/3a872a4dbd882cf318143df7d79671e3ae34a40d))
- **providers:** remove unused imports os, subprocess, tempfile, deep_merge ([efe8e4c](https://github.com/mmm-05610/agent-box/commit/efe8e4c22b77f1b0698ddd94ed167830e5ca6fdb))
- **providers:** store category in DB on upsert, support manual override ([91ae016](https://github.com/mmm-05610/agent-box/commit/91ae016f6467a14a6d5211637450432f528c369f))
- **providers:** use atomic write_text for Codex config.toml ([eb33d84](https://github.com/mmm-05610/agent-box/commit/eb33d8425c8d44425c600ffe669503eb6b49b68b))
- refresh config display after OpenCode/Hermes provider remove ([7f6de01](https://github.com/mmm-05610/agent-box/commit/7f6de01842ee6292e3e8d1b26d4b4ee1d8a51450))
- register codex/hermes/opencode with accurate config templates ([72b475b](https://github.com/mmm-05610/agent-box/commit/72b475b45031faae615cb9322b56082e2d1a7986))
- remove .env from Hermes config files display ([ea17411](https://github.com/mmm-05610/agent-box/commit/ea17411c23e59118db5450de0a691f6c0e6be2b6))
- remove auth.json from OpenCode display — API key lives in opencode.jsonc ([a05ad1a](https://github.com/mmm-05610/agent-box/commit/a05ad1a9f43c6d6449d67d96c501775b5d6c0435))
- remove extra closing brace in SkillsTab ([f493b15](https://github.com/mmm-05610/agent-box/commit/f493b15662697998e672c6eb427339851cdccfca))
- replace raw ×/✕ with stroke-based SVG close icons ([b6df6a7](https://github.com/mmm-05610/agent-box/commit/b6df6a7035f9f05e81534339ad921d93fc45f989))
- restore libApiKey in Hermes apply handler ([2d7f485](https://github.com/mmm-05610/agent-box/commit/2d7f485794d8e04f443e9e26e3c59102cbf351a2))
- robust Windows→WSL path conversion for directory browser ([d817f52](https://github.com/mmm-05610/agent-box/commit/d817f52f0d49cc4baf117afb5253659e4b23dbb5))
- **runtime:** bundle tomli — self-contained on any WSL python (&lt;3.11 fallback) ([66ca99a](https://github.com/mmm-05610/agent-box/commit/66ca99af196dc2e099e921e9fd4cb7a8b82a0fce))
- sessions exit tracking via PID instead of hardcoded 0 ([7ed6803](https://github.com/mmm-05610/agent-box/commit/7ed6803f474651dce53de1fae64b16299621ad65))
- **sessions:** call _ensure_migrated in all public methods ([ded0cb9](https://github.com/mmm-05610/agent-box/commit/ded0cb969ebaf325698dd22ac5152ceeec0627d9))
- **sessions:** correct Sphinx cross-refs to agent_box.core.db ([b8f5eff](https://github.com/mmm-05610/agent-box/commit/b8f5eff7768c6b8db850120d7898e560db8a699b))
- **sessions:** docstring reflects current schema (profiles + sessions only) ([e8ce902](https://github.com/mmm-05610/agent-box/commit/e8ce9024bf095b88f0198557803acd19a410e46a))
- **sessions:** narrow bare except Exception to sqlite3.Error in legacy.close ([980ebd9](https://github.com/mmm-05610/agent-box/commit/980ebd9811e03965ed09dc8f23c73872942087da))
- **sessions:** use column name in latest_cwd_for return ([216db25](https://github.com/mmm-05610/agent-box/commit/216db25c5dde23f6d8f30adc663f19e395d4e435))
- simplify launch to wsl.exe directly with CREATE_NEW_CONSOLE ([b6e8f9f](https://github.com/mmm-05610/agent-box/commit/b6e8f9fc536ce47594d0b7981404f5002dfb2f8f))
- skill source lookup includes old CC Switch Windows path ([3b8ec10](https://github.com/mmm-05610/agent-box/commit/3b8ec10e0cc6c45bc25306e6dc0d5bc74996624b))
- SkillsTab syntax + multi-source skill lookup ([5aac074](https://github.com/mmm-05610/agent-box/commit/5aac074b1b055a675fb8598314628242f787043e))
- sticky header in SkillDetailModal — close button stays fixed on scroll ([5877ece](https://github.com/mmm-05610/agent-box/commit/5877eced2ea6baca8fbd9067192d82eebae6b498))
- **storage:** align detail.tsx with main branch + accept onRefresh prop ([c85216a](https://github.com/mmm-05610/agent-box/commit/c85216a6e870402797f0abd3c74f3c1d2848bf00))
- **storage:** attach intermediate dirs to parent for deep nesting (TDD) ([4a7a16e](https://github.com/mmm-05610/agent-box/commit/4a7a16e1ebf61d5dc28d029de6c08e62babf1277))
- **storage:** correct Monaco /monaco/vs path + implement CDN fallback (PR 1 review C-2) ([4fe04db](https://github.com/mmm-05610/agent-box/commit/4fe04dbcca14a55ecfa2a228e5fe327d1e38b55b))
- **storage:** drop narrow Claude schema regex; defer to agent-type-aware schemas (PR 1 review I-2) ([47dbbf0](https://github.com/mmm-05610/agent-box/commit/47dbbf09324122fc04c5a5945c7cf9a17de66991))
- **storage:** prompt before LRU-evicting dirty files (PR 1 review C-1) ([8d103e7](https://github.com/mmm-05610/agent-box/commit/8d103e73fb19eae069c006c93071c24fce5c192f))
- **templates:** correct codex/cc/hermes templates + deep-merge preset overlay (WS8) ([9cd4f5e](https://github.com/mmm-05610/agent-box/commit/9cd4f5ef9683e0a3166f58c45922de92eaabcae9))
- test failures — ACS fallback, **all** exports, stale assertions ([59ccc2e](https://github.com/mmm-05610/agent-box/commit/59ccc2ea756922e10126e09bc7ff4df919f52a18))
- update bridge.py ACS imports + delete last 3 shims ([2a5fbde](https://github.com/mmm-05610/agent-box/commit/2a5fbde369208891f5f6015b43c48df89498cb7d))
- use cmd /c start instead of wt.exe for launch window ([51e9660](https://github.com/mmm-05610/agent-box/commit/51e96606e63fa5bc61e70b451b21c8d94ade6861))
- use dedicated 56px sidebar logo + proper ICO sizes with LANCZOS ([37ee661](https://github.com/mmm-05610/agent-box/commit/37ee661371f4a543ef9ac73fe67b3d04f28e826c))
- use installed.length in card key + await installed reload ([c4b7ec4](https://github.com/mmm-05610/agent-box/commit/c4b7ec4dc833f7c59a7b639b49520f3add7e5ac1))
- use magnifying glass icon for installed filter, match Available style ([fbfbcf9](https://github.com/mmm-05610/agent-box/commit/fbfbcf923ca52111afc71ed8b4876b7258dceb8d))
- use powershell Start-Process for launch instead of cmd start ([414df47](https://github.com/mmm-05610/agent-box/commit/414df47ac1f00e17f8065e9d9c78e103e04f0368))
- use wsl.exe wslpath for directory path conversion ([ddb01f4](https://github.com/mmm-05610/agent-box/commit/ddb01f436bf832d63fa1aae97bb7c8c9edc60205))
- UTF-8 decode on Windows subprocess (GBK locale) ([3e1bb44](https://github.com/mmm-05610/agent-box/commit/3e1bb44bd348b56e7a822dec21efadfdadd5d61f))
- wrap handleSearch in useCallback with proper deps ([152da2c](https://github.com/mmm-05610/agent-box/commit/152da2ccdb15c12abef74275f358b47ccf317732))

### Reverts

- Hermes apply — keep original file-write flow (backend apply is Claude-only) ([b2dfe14](https://github.com/mmm-05610/agent-box/commit/b2dfe147106743cb73d443a418a4bbffe63a6d52))

### Documentation

- add §6 — registry list fields are for iteration, not positional ([8845d07](https://github.com/mmm-05610/agent-box/commit/8845d07bf20a20ca51a65523348baa5ce39bdaf9))
- add ACS integration spec ([f683956](https://github.com/mmm-05610/agent-box/commit/f683956de15f41ebbcfac2de6e4f5a4762428199))
- add Chinese README ([b1053a5](https://github.com/mmm-05610/agent-box/commit/b1053a5e123c1dd004d4c6107815b0e87a38b14a))
- add CLAUDE.md index + troubleshooting doc for desktop launch ([17716bb](https://github.com/mmm-05610/agent-box/commit/17716bb28c69447b66c3ce61500dd57f43e67400))
- add CONVENTIONS.md — project standards for humans and AI ([7662623](https://github.com/mmm-05610/agent-box/commit/7662623d24168bdfd3fc42c7550ff7ddc42b2973))
- add fix-conventions-violations spec for Codex ([2413cc6](https://github.com/mmm-05610/agent-box/commit/2413cc620ccc524dfbd451e596661c94438c815c))
- add RELEASE.md — CLI wheel / Windows GUI / Linux GUI / runtime / cc-switch flow ([d0b4d83](https://github.com/mmm-05610/agent-box/commit/d0b4d83a1f1f11229291729c4faabfd8f8f5e7c4))
- agent-box v2 vision (constitution) — project workbench platform ([3d6cc41](https://github.com/mmm-05610/agent-box/commit/3d6cc41e7b06de44424253be76e8f442d17750d0))
- ARCHITECTURE GUI section — RPC/zero-dependency instead of agent-box exec ([9bfa18a](https://github.com/mmm-05610/agent-box/commit/9bfa18acf76df8a9b3f9f5e9ad08ebcbca231332))
- concrete problem-led opening (CN) + GUI screenshot in quickstart ([9c8cd77](https://github.com/mmm-05610/agent-box/commit/9c8cd77133eba4acee13ce712166812517762489))
- CONVENTIONS.md — 5 rules + conventions audit spec ([459e79d](https://github.com/mmm-05610/agent-box/commit/459e79d45ec8f51776ce066cd476b7bfb2c0f267))
- **conventions:** add git workflow §14 + frontend conventions ([86130df](https://github.com/mmm-05610/agent-box/commit/86130dfe24f0370eeeb9fcbc6d9951a4db2034ee))
- **plan:** implement schema-driven detail page + storage rewrite (PR 1-5) ([39f2898](https://github.com/mmm-05610/agent-box/commit/39f2898f3b861bcb341d300b88e6144238ed1aae))
- provider form gap analysis vs CC Switch ([d60ea33](https://github.com/mmm-05610/agent-box/commit/d60ea3361894e1d6bee7f1aaf1ae26ff45c2e175))
- **README:** drop stale 'PyPI release' roadmap bullet ([49707b4](https://github.com/mmm-05610/agent-box/commit/49707b47460f81a617bdec941d09c6bd20542e7a))
- **README:** reframe positioning — agent combination management, not config launcher ([d2f026b](https://github.com/mmm-05610/agent-box/commit/d2f026b0b63e8c9049e377e6af250e80a2d651ee))
- reframe opening — multi-agent config stack isolation, not multi-tenancy ([ec8359a](https://github.com/mmm-05610/agent-box/commit/ec8359ae08636ff74e1aa953f0b3f0f3c3a3289b))
- refresh README CLI syntax for the cmd2 rewrite + RELEASE notes ([b25d8e1](https://github.com/mmm-05610/agent-box/commit/b25d8e11def5a3e0f8911ad600b553e0dbcba3b7))
- rewrite ARCHITECTURE.md to match implemented behavior ([9e16375](https://github.com/mmm-05610/agent-box/commit/9e1637568c9b4ffb1baf5f923c02b5ac1e1d1ec6))
- rewrite README for user onboarding — dual entry (GUI/CLI), 30s quickstart ([d268e24](https://github.com/mmm-05610/agent-box/commit/d268e240850b2e3246093d01ff197ac55b1f70ea))
- rewrite README/README_CN for v0.4.0 ([c349300](https://github.com/mmm-05610/agent-box/commit/c349300ab927976f0b2091def9f1752ebd46ed05))
- **spec:** detail page profile-config visualization (phase 1) ([c55941a](https://github.com/mmm-05610/agent-box/commit/c55941ad1d969d9d74d09eb38f7436d2dd93f0f6))
- **spec:** remove MiMoCode from this round, drop header-summary goal ([bac9c2b](https://github.com/mmm-05610/agent-box/commit/bac9c2b142e2567da18b09ca4af40177f45a40f0))
- update README with v0.5.0 screenshots and dev instructions ([c103e77](https://github.com/mmm-05610/agent-box/commit/c103e77e03932c638f77c03d31452e8d1f198669))
- update ROADMAP to reflect current state ([14b6fcf](https://github.com/mmm-05610/agent-box/commit/14b6fcf250ba22f05ca02304424c1e47e0e9438c))
- verify exe runtime before shipping + 9P stale-build landmine ([1149242](https://github.com/mmm-05610/agent-box/commit/114924244d598ec988ae2a1c71934ecd9d1f30fd))

## [1.0.0] — 2026-08-04

### Added

- **cmd2 上下文栈 REPL** — 替代 flat argparse。双入口：交互 `repl` + 脚本
  `exec "use x; apply provider y; launch"`（`;` 分隔、`#` 注释、piped
  stdin）。`use <profile>` 进入 `[name:type]>` profile 上下文；tab 补全、
  历史、自动建议。
- **分层架构** — `core/`（注册表/DB/io）+ `adapters/`（acs/models）+
  `resources/`（apply/CRUD）+ `cli/`。
- **声明式注册表 `core/agent_types.json`** — 前端/CLI 零 agent 知识：
  页面结构、tab、图标、默认值全部由后端注册表驱动。
- **Provider 系统** — strategy dispatch（json_merge / multi_file /
  yaml_custom / jsonc_provider）+ ACS 库集成（providers / mcp / skills /
  prompts 只读查询 + apply 写入）。
- **声明式数据表 `core/provider_endpoints.json`** — provider base_url →
  /models endpoint 映射；`adapters/models.py` `fetch_models`。
- **GUI 前端重构** — registry 动态 tab、库浏览（搜索/详情/apply）、
  provider 表单（models fetch、endpoint 测速）、permissions 结构化块、
  hooks / memories / instructions 编辑器、中/英 i18n、运行状态看板
  （footer 5s 轮询）。
- **后端化** — 版本号（`__version__`）、projects_dir（gui-settings.json
  持久化）、launch `--cwd` 后端解析、acs_binary（env → PyInstaller →
  submodule）、home_dir（`~/...` 显示）。

### Changed

- **CLI 重写** — argparse 平铺子命令 → cmd2 REPL；`cc/codex/hermes/
opencode` 快捷命令合并为 `launch`。
- **默认 projects_dir `~/projects` → `~/`**；路径显示 home-relative
  （`/home/<user>/...` → `~/...`）。
- **Session 时间按 UTC 存储/解析**（`datetime('now')` = UTC）。
- **bridge 双模式** — Windows 宿主经 `wsl.exe`（确定性路径转换），
  Linux/WSL 直接 import。
- **死测试清理** — `tests/test_wsl_io.py`（指向已删除的 `gui.wsl`，破坏
  pytest collection）移除；根 `.gitignore` 补 `node_modules/`。

### Fixed

- 冒烟测试（2026-08）~15 个 bug：会话时间 8h 偏移（UTC 解析）、detail 页
  React #310（条件 hook）、Windows GBK 解码、UNC 路径转换、MCP summary
  NameError、sidebar 运行计数陈旧、launch cwd 引号处理、MCP installed
  skills "expecting value" 等。

## [0.5.0] — 2026-06-27

### Added

- **New GUI frontend (gui-web)** — complete React + Vite + Tailwind CSS 4 + PyWebView rewrite replacing the old CustomTkinter desktop GUI.
  - 6 pages: Home, Profiles, Library, Sessions, Settings, Help.
  - Profile detail page with per-agent-type tabs (settings, hooks, auth, CLAUDE.md).
  - Profile launch with mode selector (new session / continue) and working directory input.
  - Library page with cc-switch style provider cards, category badges, and collapsible add panel.
  - Settings page with configurable projects directory.
  - Native folder browse dialog via PyWebView.
  - Last CWD per profile inferred from session history.
  - Bridge API connecting React frontend to WSL CLI via subprocess.
- **`--prod` / frozen detection** — bridge auto-serves built frontend in production mode; detects PyInstaller bundle via `sys.frozen`.

### Changed

- **Desktop packaging switched to gui-web** — PyInstaller spec now uses `gui-web/bridge.py` as entry point instead of `gui-redesign.py`.
- **Sidebar brand area** — replaced placeholder icon with actual Agent Box logo.

### Removed

- **Old CustomTkinter GUI** — `gui-redesign.py` and `gui/` package are superseded by gui-web. The old PyWebView-unaware implementation is no longer packaged.

### Fixed

- PyWebView bridge: WSL command quoting, async API polling, CLI syntax for sessions, snake_case conversion.
- Library: category inference from settings values, badge display, import paths.
- Detail page: hooks/plugins read from correct settings.json fields, sidebar nav closes detail page.

## [0.4.0] — 2026-06-22

### Added

- **Preset system** — shipped CC presets (`blank`, `decision-maker`, `python-dev`, `spec-writer`) with `--preset` flag. Presets bundle `CLAUDE.md`, `hooks.json`, and `settings.overlay.json`; the overlay is deep-merged onto the template's `settings.json`.
- **`agent-box sessions`** — launch history tracking with `--json`, `--active`, `--cleanup`, and `--exit` flags. Sessions are recorded automatically on each launch.
- **`--version` flag** — prints the installed version.
- **Windows desktop GUI** — modular CustomTkinter GUI (`gui/` package) with profile management, raw-config editing, creation wizard, session history, dark/light themes.
- **Detail page** — per-agent-type tabbed editor for settings, hooks, auth, CLAUDE.md with staleness detection and Ctrl+S save.
- **Profile metadata** — `meta.yaml` now carries optional `display_name`, `description`, `provider`, and `preset` fields (forward/back compatible).
- **zero Python runtime dependencies** for the CLI.

### Changed

- **Config isolation hardened** — corrected template files for `cc`, `codex`, and `hermes` agent types. Deep-merge now preserves sibling keys (e.g. preset's `permissions.allow` no longer erases template's `permissions.deny`).
- **Agent type registry** — `library.py` is now the single source of truth for config dirs, binaries, and data dirs. Removed duplicate fallback data from `config.py`.
- **Session tracking migrated** — from `gui/state.py` (Windows SQLite) to `src/agent_box/sessions.py` (WSL SQLite), with CLI `sessions` subcommand. GUI now calls `wsl.exe agent-box sessions` instead of managing its own database.
- **ROADMAP updated** — reflects v0.4.0 completion status.
- **Documentation** — README, README_CN, ARCHITECTURE, and CLAUDE.md updated for v0.4.0.

### Removed

- `gui-windows.py` — replaced by `gui-redesign.py` + `gui/` package.
- `launch-gui.bat` / `launch-gui.ps1` — replaced by desktop `AgentBox.bat`.
- `DW-PROMPT.md` — one-shot DW task description, executed and obsolete.
- Duplicate `config_dir` / `binary` / `data_dir` fallbacks in `config.py`.
- `gui/state.py` — replaced by `src/agent_box/sessions.py`.

### Fixed

- `__version__` now dynamically reads from `pyproject.toml` (was hardcoded `0.2.0`).
- `gui/wsl.py` — extracted `_wsl_run` / `_wsl_check_output` / `_wsl_try_output` helpers, eliminating 200+ lines of duplicated subprocess code.
- `gui/wsl.py` `create_profile` now passes `--preset` to CLI (was silently dropped).
- Type annotation: `load_meta` return type now accurately reflects optional fields (empty string sentinel instead of `None` to avoid `Optional[str]` drift).
- `gui/app.py` — removed duplicate error popup on launch failure; narrowed exception handling.
