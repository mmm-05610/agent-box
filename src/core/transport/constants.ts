// WS wire-protocol constants shared by `WebTransport` and
// `RemoteDesktopTransport`. The string values MUST stay in sync with their
// Rust counterparts in `src-tauri/src/web/ws.rs` — drift will break the
// server→client handshake silently.
export const WS_READY_CHANNEL = "__ready__"
