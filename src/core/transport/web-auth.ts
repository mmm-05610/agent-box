// Shared helpers for web-mode HTTP calls — the JSON transport in
// `web-transport.ts` and direct multipart/file callers in `lib/api.ts` both
// need consistent token retrieval and 401 redirect behavior. Keeping them in
// one place means a future move from `localStorage` to cookies (or rotation
// rules, multi-tenant prefixing, etc.) doesn't have to be remembered at every
// call site.

const TOKEN_KEY = "codeg_token"

export function getCodegToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ""
}

export function redirectToCodegLogin(): void {
  if (window.location.pathname.startsWith("/login")) return
  localStorage.removeItem(TOKEN_KEY)
  window.location.href = "/login"
}
