import { describe, expect, it } from 'vitest'
import { shouldPersist, trimInfinite } from '../src/renderer/src/lib/queryPersist'

const q = (key: unknown[], status = 'success', data: unknown = { x: 1 }) => ({ queryKey: key, state: { status, data } }) as never

describe('Persistenz der Katalogdaten', () => {
  it('speichert nur Katalogabfragen mit Daten', () => {
    expect(shouldPersist(q(['release', 'abc']))).toBe(true)
    expect(shouldPersist(q(['track', 'abc']))).toBe(true)
    expect(shouldPersist(q(['tag-dist']))).toBe(true)
    expect(shouldPersist(q(['release', 'abc'], 'error'))).toBe(false)
    expect(shouldPersist({ queryKey: ['release', 'abc'], state: { status: 'success', data: undefined } } as never)).toBe(false)
  })

  it('speichert nichts Persönliches und keine Suchen', () => {
    for (const k of ['favorites', 'my-playlists', 'member-playlists', 'playlist', 'playlist-tracks', 'stats', 'names', 'ai', 'catalog']) {
      expect(shouldPersist(q([k, 'x']))).toBe(false)
    }
  })

  it('kürzt „Mehr laden“-Listen auf die erste Seite', () => {
    expect(trimInfinite({ pages: [1, 2, 3], pageParams: [0, 36, 72] })).toEqual({ pages: [1], pageParams: [0] })
    const single = { pages: [1], pageParams: [0] }
    expect(trimInfinite(single)).toBe(single)
    const plain = { Data: [1, 2] }
    expect(trimInfinite(plain)).toBe(plain)
  })
})
