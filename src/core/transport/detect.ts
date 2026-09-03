export type TransportEnvironment = "tauri" | "web"

export function detectEnvironment(): TransportEnvironment {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return "tauri"
  }
  return "web"
}
