export const CODEG_WS_PROTOCOL = "codeg-events"
const CODEG_WS_TOKEN_PROTOCOL_PREFIX = "codeg-token."

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function buildCodegWebSocketProtocols(token: string): string[] {
  const trimmed = token.trim()
  if (!trimmed) return [CODEG_WS_PROTOCOL]
  return [
    CODEG_WS_PROTOCOL,
    `${CODEG_WS_TOKEN_PROTOCOL_PREFIX}${base64UrlEncode(trimmed)}`,
  ]
}
