# Pi RPC client reuse

`rpc-client.js` and `jsonl.js` are copied from the installed
`@earendil-works/pi-coding-agent` **0.86.1** package, paths
`dist/modes/rpc/rpc-client.js` and `dist/modes/rpc/jsonl.js`. That package is
published from [earendil-works/pi](https://github.com/earendil-works/pi)
under the included MIT license. Package metadata and the installed files were
checked on 2026-09-22. These are the versioned fork files, not the current
`@mariozechner` upstream package.

Changes to `rpc-client.js`:

- Drain stderr without forwarding or retaining it, because diagnostics can
  contain project paths and account details.
- Notify event subscribers when the owned RPC process exits or errors.
- Add `sendExtensionUIResponse` for the documented Pi extension UI response
  sub-protocol. The packaged client exposes request events but no public
  response method.

The protocol framing, request ID correlation, timeouts, command API and
process ownership remain the package implementation. Re-check these changes
against any future Pi upgrade.
