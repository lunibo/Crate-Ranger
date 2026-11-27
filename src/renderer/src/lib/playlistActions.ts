import type { Playlist } from '@shared/types'
import { allPlaylistTracks, deletePlaylist, errorMessage, renamePlaylist, type TrackLite } from './api'
import { t } from './i18n'
import { queryClient } from './queryClient'
import { toast } from './stores'
import { usePlayer } from '../player/player'

/** Alle Tracks einer Playlist laden (für Abspielen/Warteschlange); meldet leere Playlists und Fehler. */
async function loadTracks(id: string): Promise<TrackLite[] | null> {
  try {
    const tracks = await allPlaylistTracks(id)
    if (!tracks.length) toast('info', t('playlist.empty'))
    return tracks.length ? tracks : null
  } catch (e) {
    toast('error', errorMessage(e))
    return null
  }
}

export async function playPlaylist(id: string): Promise<void> {
  const tracks = await loadTracks(id)
  if (tracks) usePlayer.getState().playList(tracks)
}

export async function queuePlaylist(id: string): Promise<void> {
  const tracks = await loadTracks(id)
  if (tracks) usePlayer.getState().addToQueue(tracks)
}

/** Umbenennen inkl. Cache-Aktualisierung und Meldung. `true` bei Erfolg (oder nichts zu tun). */
export async function renameOwnPlaylist(p: Playlist, newName: string): Promise<boolean> {
  const name = newName.trim()
  if (!name || name === p.Name) return true
  try {
    await renamePlaylist(p.ID, name, p.Public)
    queryClient.setQueryData<Playlist>(['playlist', p.ID], (old) => (old ? { ...old, Name: name } : old))
    void queryClient.invalidateQueries({ queryKey: ['playlist', p.ID] })
    void queryClient.invalidateQueries({ queryKey: ['my-playlists'] })
    void queryClient.invalidateQueries({ queryKey: ['member-playlists'] })
    toast('success', t('playlist.renamed', { name }), 2500)
    return true
  } catch (e) {
    toast('error', t('playlist.renameFailed', { error: errorMessage(e) }))
    return false
  }
}

/** Löschen inkl. Cache-Aufräumen und Meldung. `true` bei Erfolg. */
export async function deleteOwnPlaylist(p: Playlist): Promise<boolean> {
  try {
    await deletePlaylist(p.ID)
    toast('success', t('playlist.deleted', { name: p.Name }), 2500)
    void queryClient.invalidateQueries({ queryKey: ['my-playlists'] })
    void queryClient.invalidateQueries({ queryKey: ['member-playlists'] })
    queryClient.removeQueries({ queryKey: ['playlist', p.ID] })
    queryClient.removeQueries({ queryKey: ['playlist-tracks', p.ID] })
    return true
  } catch (e) {
    toast('error', t('playlist.deleteFailed', { error: errorMessage(e) }))
    return false
  }
}
