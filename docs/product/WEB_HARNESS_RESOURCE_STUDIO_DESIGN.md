# Web Harness & Resource Studio design

## Product boundary

The clickable prototype adds a Harness Configuration Studio and a plugin-driven Resource Library to the Workbench shell. Work and Execution remain the only governance and execution concepts: objective, responsibility, Binding, Dispatch, activity, outputs, evidence, and human completion. A Harness/Profile or external Resource is not a Work Core entity.

Harness plugins own installation/type discovery, Profile CRUD, model/provider configuration, MCP, skills, plugins, hooks, permissions, instructions, memories, session overlay and runtime projection. ResourceProvider plugins own external objects such as Server, Repository, Credential source, Artifact, workflow identity, pane, CI definition, sandbox, and collaboration endpoint. The Web renders descriptors and exact references; it does not reinterpret them as Core records.

## Ownership and references

`ProfileRef` is created by a Harness plugin and includes its provider ID, native profile ID, revision/digest and (where useful) URI. `ServerRef` is created by `ssh-resources` and identifies a versioned server resource. `CredentialSourceRef` identifies a credential provider locator, for example `local-credential-store / deploy-key-7`; it never contains a key, token, or secret value.

The secret boundary is absolute: secret values are absent from Web forms, exact Ref presentation, Binding, Evidence, screenshots, and the prototype mock. A Harness plugin or credential provider may mount or resolve a locator at runtime, but Web can only show that it was referenced.

## Profile isolation and preview cut

The profile is immutable/shared at a selected revision. A session receives a writable session-local overlay with environment overrides and projected files. The projection preview makes this chain explicit:

`Profile configuration → resolved capability refs → provider-owned runtime manifest → files/env/mounts projected to Harness`

It lists projected files, shared resource references, session-local content, secret-reference-only behavior, and the exact ProfileRef digest. Execution may observe projected files, mounts, manifest acknowledgement and native correlation. It cannot prove that a model actually consumed an instruction, MCP endpoint, plugin, memory, or secret.

## cc-switch adapter

cc-switch is modelled as an `ExternalConfigSource` adapter, not as an Agent-Box database. The prototype path is: enumerate importable profiles, explicit user selection, visible import diff, copy only allowed configuration fields, convert credentials to `CredentialSourceRef` locators, confirm import-and-own, then show a newly created ProfileRef revision. A future external-reference mode is stated but not implemented as the primary path.

## Resource Library and Binding

Resources live under Integrations, not as top-level navigation and not under Harness. The Server example displays provider, health, revision/digest, validation time, mock use count/links, and exact Ref. Editing creates a new revision; disable/delete affects future resolution while frozen historical Bindings remain readable.

Binding Composer consumes a requested optional `ServerRef`, lets the user choose a saved resource or manage resources, resolves it to an exact `ServerRef`, then freezes it with the existing requested → exact ledger. Resource Library never launches a Harness.

## Web/plugin and Host boundary

Web owns route composition, user choice, local presentation state, i18n, and safe preview rendering. Harness and Resource plugins own configuration schemas, storage, validation, revisioning, native installation, projection, credential resolution, and diagnostics. Host owns authenticated local transport, plugin discovery, operation lifecycle, and Core/Work projections. Neither the Web nor Core should add Harness, Profile, Server, Credential, MCP, Plugin, or equivalent universal entities.

## Formal implementation gaps

This is a prototype. A production slice needs plugin descriptor APIs for installed Harnesses, profile list/detail/CRUD, profile projection preview, capability refs and overlay policy; ResourceProvider list/detail/create/edit/validate/disable APIs; safe CredentialSourceRef selector APIs; exact ref/revision contracts; cc-switch ExternalConfigSource enumeration/import-diff/import APIs; diagnostics and operation receipts. The current prototype does not connect real providers, secrets, Host APIs, or mutate Core.
