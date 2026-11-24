/** Whitelist der API-Pfade, die der Renderer direkt aufrufen darf. Downloads laufen nur über die Queue. */
const GET_ALLOWED: RegExp[] = [
  /^\/catalog(\/[\w-]+)?$/,
  /^\/release(\/[\w-]+(\/(tracks|artists))?)?$/,
  /^\/artist(\/[\w.%-]+(\/(catalog|releases|appears-on|cover-info))?)?$/,
  /^\/genres$/,
  /^\/genre\/[\w-]+$/,
  /^\/tags$/,
  /^\/search\/(tags|names)$/,
  /^\/(tag|genre|label|performance-type|audio-language)-distribution$/,
  /^\/audio-features\/distributions$/,
  /^\/(my|member|public)-playlists$/,
  /^\/playlist\/[\w-]+(\/tracks)?$/,
  /^\/me\/library$/
]

const POST_ALLOWED: RegExp[] = [
  /^\/search\/(prompt|by-id)$/,
  /^\/me\/library\/track\/[\w-]+(\/delete)?$/,
  // Playlist anlegen und Track hinzufügen (Track-Menü) – Löschen/Umbenennen bleibt gesperrt
  /^\/playlist$/,
  /^\/playlist\/[\w-]+\/track$/
]

export function assertAllowed(method: 'GET' | 'POST', path: unknown): string {
  if (typeof path !== 'string' || path.length > 300 || path.includes('..') || path.includes('?')) {
    throw new Error('Invalid API path')
  }
  const list = method === 'GET' ? GET_ALLOWED : POST_ALLOWED
  if (!list.some((r) => r.test(path))) throw new Error(`API path not allowed: ${method} ${path}`)
  return path
}

export function assertId(v: unknown): string {
  if (typeof v !== 'string' || !/^[\w-]{1,80}$/.test(v)) throw new Error('Invalid ID')
  return v
}
