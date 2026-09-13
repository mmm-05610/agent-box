# Worker extraction provenance

Date: 2026-09-13. Read-only source repository:
`/home/maoqh/projects/agent-box-studio-ui-reconstruction`, HEAD
`c65c133c4eead64ac4c0cab0c3d4dc19dae4d558`.

The source repository was dirty, so the extraction is pinned by the current
file bytes rather than by commit alone. The new independent crate retains the
reviewed `ABW1` frame envelope and its SHA-256 framing rule. Its bounded JSON
operations and process ownership are implemented locally without Tauri,
`codeg_lib`, `HostBridge`, UI, or the old product state.

| Read-only source | SHA-256 |
| --- | --- |
| `src-tauri/src/bin/agent_box_worker.rs` | `17a59e80869af2bdf036c653f6b0b20ace1e904f57c3442453d94195e5f4a751` |
| `remote_worker/artifact.rs` | `5df070f662b6cd06e2e146003c79725ac3e9f7abd30aac019a114635ffb5fc89` |
| `remote_worker/broker.rs` | `7d37437acf7d0eee8670de9c987a821e4f007ee12b46a055d94cd329affb5507` |
| `remote_worker/materialization.rs` | `b6eafdff05e0f6c4ec4dad527c1a861f423cf1d7267bbe1daae3992b6eea03d8` |
| `remote_worker/mod.rs` | `94a5bd2790bf5f6cb729e8229ce8944de3643c2b465cd8a80c06add8b3ce1287` |
| `remote_worker/process.rs` | `5b8a364489bdd68dd36a20585509c257faca94215203c8fe13483ad2ccdb8122` |
| `remote_worker/process_table.rs` | `f0fbf890a6da14eb01564efa09a79b7f155fecef7546c1ce8980aa660c56190f` |
| `remote_worker/protocol.rs` | `9bef2fe4a3601ccc6ccd3f3b1b219cf35b17887aa775cb96a23a0263954e7001` |
| `remote_worker/secret.rs` | `2af446957ba02e09a10ca1939053e1e8dd1c35a5d8d34b6e174a3494689fb25a` |
| `remote_worker/spool.rs` | `0b4c542eead33ace2dd26ac2abd7ad89152443403eb2ea599d1aea00fe7cedf7` |
| `remote_worker/timeout.rs` | `b5be2c25126c034002209e634a1ec51c7fc44486f951c69dad58ffce1feb043c` |
| `remote_worker/view.rs` | `cef4359673eaab2975122c00dd44876112eab961a1426a2816e4e8baf41fb072` |
| `remote_worker/wsl_bootstrap.rs` | `c4fc3a56bcfc18e6fb2656da9e4ddd404a91fe7a173b937c4423584715b7bf2d` |

The source repository's Apache-2.0 `LICENSE` digest is
`c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`.
The extracted crate declares `Apache-2.0`. Its direct dependency closure is
limited to Tokio, Serde/JSON, SHA-256, Base64, libc, and thiserror.

## Final C/D bundle

The final locally built acceptance bundle is protocol wire `1`, Worker version
`0.1.0`, SHA-256
`08e4e057aef068997eb4efaa3717096a4f3fad54fd182a568853d8ed97a803c2`.
The C/D delta adds only bounded execution policy needed by this work order,
including the exact WSL resolver bind (`/etc/resolv.conf` to
`/mnt/wsl/resolv.conf`). The Worker rejects broader `/mnt` access. No further
source files were extracted from the read-only repository.
