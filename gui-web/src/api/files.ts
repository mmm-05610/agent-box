/**
 * Files API — Read files from WSL
 */

import { call } from '@/lib/bridge'

export async function readFile(path: string): Promise<string> {
  return call<string>((api) => api.read_file(path), '')
}

export async function listDir(path: string): Promise<string> {
  return call<string>((api) => api.list_dir(path), '')
}
