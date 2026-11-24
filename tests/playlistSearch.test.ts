import { describe, expect, it } from 'vitest'
import { filterPlaylists } from '@shared/playlistSearch'

const lists = [{ Name: 'Late Night Chill' }, { Name: 'Gym Bangers' }, { Name: 'Café Morning' }, { Name: 'Chillstep' }]
const names = (q: string): string[] => filterPlaylists(lists, q).map((p) => p.Name)

describe('filterPlaylists', () => {
  it('liefert ohne Suchtext alle Playlists', () => {
    expect(names('  ')).toHaveLength(4)
  })
  it('sucht ohne Groß-/Kleinschreibung und Akzente', () => {
    expect(names('CHILL')).toEqual(['Late Night Chill', 'Chillstep'])
    expect(names('cafe')).toEqual(['Café Morning'])
  })
  it('verlangt alle Wörter, egal in welcher Reihenfolge', () => {
    expect(names('chill late')).toEqual(['Late Night Chill'])
    expect(names('chill gym')).toEqual([])
  })
})
