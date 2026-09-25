import { loadExtensions, type Catalog } from '@ordessa/extension-loader'
declare global { interface Window { extensionCatalog: { read(): Promise<Catalog> } } }
export async function installedExtensions() {
  return loadExtensions(await window.extensionCatalog.read())
}
