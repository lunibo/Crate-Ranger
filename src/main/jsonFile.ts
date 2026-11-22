import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Atomisch schreiben (tmp + rename), damit ein Absturz keine halbe Datei hinterlässt. */
export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8')
  renameSync(tmp, path)
}

/** Verzögertes Speichern, fasst viele Änderungen zusammen. */
export function debounced(fn: () => void, ms: number): { schedule(): void; flush(): void } {
  let timer: NodeJS.Timeout | null = null
  return {
    schedule() {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        fn()
      }, ms)
    },
    flush() {
      if (timer) clearTimeout(timer)
      timer = null
      fn()
    }
  }
}
