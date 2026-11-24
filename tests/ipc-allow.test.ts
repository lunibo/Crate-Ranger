import { describe, expect, it } from 'vitest'
import { assertAllowed } from '../src/main/ipc'

describe('assertAllowed (Playlists)', () => {
  it('erlaubt Playlist anlegen und Track hinzufügen', () => {
    expect(assertAllowed('POST', '/playlist')).toBe('/playlist')
    expect(assertAllowed('POST', '/playlist/abc-123/track')).toBe('/playlist/abc-123/track')
  })
  it('sperrt Löschen, Umbenennen und Mitglieder-Verwaltung', () => {
    for (const p of ['/playlist/abc/delete', '/playlist/abc', '/playlist/abc/track/t1/delete', '/playlist/abc/member', '/playlist/abc/tracks']) {
      expect(() => assertAllowed('POST', p)).toThrow(/not allowed/)
    }
  })
})
