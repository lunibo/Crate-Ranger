import { describe, expect, it } from 'vitest'
import { assertAllowed } from '../src/main/ipc'

describe('assertAllowed (Playlists)', () => {
  it('erlaubt Playlist anlegen, umbenennen, löschen und Track hinzufügen', () => {
    for (const p of ['/playlist', '/playlist/abc-123', '/playlist/abc-123/delete', '/playlist/abc-123/track']) {
      expect(assertAllowed('POST', p)).toBe(p)
    }
  })
  it('sperrt Tracks entfernen/verschieben und Mitglieder-Verwaltung', () => {
    for (const p of ['/playlist/abc/track/t1/delete', '/playlist/abc/track/t1/move/2', '/playlist/abc/member', '/playlist/abc/tracks', '/playlist/abc/follow']) {
      expect(() => assertAllowed('POST', p)).toThrow(/not allowed/)
    }
  })
})
