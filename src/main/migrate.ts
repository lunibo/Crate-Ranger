import { app } from 'electron'
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Frühere Produktnamen, deren Datenordner beim ersten Start übernommen werden. */
const PREVIOUS_NAMES = ['SoundScout Desktop']

/**
 * Übernimmt Einstellungen, Bibliothek, Warteschlange, Download-Protokoll und die Anmeldung (Cookies)
 * aus dem Datenordner eines früheren App-Namens. Der alte Ordner bleibt als Sicherung erhalten.
 * Muss vor allen Zugriffen auf userData (Single-Instance-Lock, Sessions) laufen.
 */
export function migrateUserData(): void {
  try {
    const target = app.getPath('userData')
    if (existsSync(target) && readdirSync(target).length > 0) return
    for (const name of PREVIOUS_NAMES) {
      const source = join(app.getPath('appData'), name)
      if (source === target || !existsSync(source)) continue
      cpSync(source, target, {
        recursive: true,
        // Sperr-/Cache-Dateien der alten Instanz nicht mitnehmen
        filter: (src) => !/[\\/](SingletonLock|SingletonSocket|SingletonCookie|lockfile|Cache|Code Cache|GPUCache|DawnGraphiteCache|DawnWebGPUCache|GrShaderCache|ShaderCache)$/.test(src)
      })
      return
    }
  } catch (e) {
    console.error('Datenübernahme fehlgeschlagen:', e)
  }
}
