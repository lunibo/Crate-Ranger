import { protocol, type Protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

export const MEDIA_SCHEME = 'media'

const MIME: Record<string, string> = { '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true } }
  ])
}

/**
 * media://local/<encodeURIComponent(absoluter Pfad)> – nur Audiodateien innerhalb erlaubter Wurzeln.
 * Unterstützt HTTP-Range, damit im Player gespult werden kann.
 */
export function handleMediaProtocol(target: Protocol, isAllowed: (absPath: string) => boolean): void {
  target.handle(MEDIA_SCHEME, (req) => {
    try {
      const url = new URL(req.url)
      const path = resolve(decodeURIComponent(url.pathname.replace(/^\//, '')))
      const mime = MIME[extname(path).toLowerCase()]
      if (!mime || !isAllowed(path)) return new Response('forbidden', { status: 403 })
      const size = statSync(path).size
      const range = req.headers.get('range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m?.[1] ? Number(m[1]) : 0
        let end = m?.[2] ? Number(m[2]) : size - 1
        if (!m?.[1] && m?.[2]) {
          start = Math.max(0, size - Number(m[2]))
          end = size - 1
        }
        end = Math.min(end, size - 1)
        if (start > end || start >= size) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }
        const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes'
          }
        })
      }
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': mime, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

export function isInside(child: string, root: string): boolean {
  const c = resolve(child).toLowerCase()
  const r = resolve(root).toLowerCase()
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep)
}
