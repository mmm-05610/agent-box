# Security and supply chain

| Risk/control | Observed industry state | Agent-Box comparison |
|---|---|---|
| remote provenance | Git URL/source records common; publisher/signature uncommon | provenance metadata exists, signature does not |
| scripts | allowed by spec and several harnesses; install usually copies without execution | import does not execute; projector must preserve policy |
| activation consent | Gemini explicitly documents install and activation consent; others vary | preview/confirm import exists in adjacent product loop |
| traversal/symlink escape | often undocumented; manager behavior varies | SkillStore rejects symlink, escape, unsafe refs |
| limits | native clients rarely publish bounded limits | SkillStore bounds files, bytes, depth and names |
| license | optional spec field; registry license checks uncommon | record license/provenance, do not infer approval |
| overwrite | Codeg blocks; Agent Harness refuses unmanaged output; simple installers may overwrite | projection should use ownership manifest and collision diagnostics |
| credentials | skill config can request secrets (Hermes); arbitrary commands can read files | credentials must remain locators, never skill content |
| atomicity | Agent Harness plan/apply; Codeg links; most installers unclear | SkillStore atomic revision install; projection receipt exists |

Threats include malicious Markdown social engineering, scripts/assets with payloads, symlink escape, path traversal, dependency confusion, compromised Git branches, and an activated skill reading credentials. Recommended guardrails for discussion: canonicalize and bound input trees, reject symlinks by default, show provenance/digest before activation, explicit trust per source/project, atomic ownership-checked projection, and no automatic execution during import.
