/**
 * Files API — Read/write files from WSL
 */

import { call } from '@/lib/bridge'

export async function readFile(path: string): Promise<string> {
  return call<string>((api) => api.read_file(path), '')
}

export async function saveFile(path: string, content: string): Promise<boolean> {
  return call<boolean>((api) => api.save_file(path, content), false)
}

/**
 * Replace a single key in a JSON file, preserving all other top-level keys.
 * Creates the file (and parent dirs) if it doesn't exist.
 */
export async function patchJsonFile(
  path: string, key: string, value: unknown,
): Promise<boolean> {
  return call<boolean>(
    (api) => api.patch_json_file(path, key, JSON.stringify(value)),
    false,
  )
}

export async function listDir(path: string): Promise<string> {
  return call<string>((api) => api.list_dir(path), '')
}

export interface EndpointTestResult {
  status: 'operational' | 'degraded' | 'failed'
  message: string
  response_time_ms: number
  http_status?: number
}

/** Connectivity check like cc-switch. Returns structured result with operational/degraded/failed. */
export async function testEndpoint(url: string): Promise<EndpointTestResult | null> {
  return call<EndpointTestResult | null>(
    (api) => api.test_endpoint(url, 5),
    null,
  )
}

/**
 * Return absolute paths of all files under *path* (find -type f).
 */
export async function findFiles(path: string): Promise<string[]> {
  return call<string[]>((api) => api.find_files(path), [])
}
