/** Für die Suche: klein, ohne Akzente („Café“ → „cafe“) */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** Alle Suchwörter müssen im Namen vorkommen, Reihenfolge egal. */
export function filterPlaylists<T extends { Name: string }>(lists: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return lists
  return lists.filter((p) => {
    const name = fold(p.Name)
    return words.every((w) => name.includes(w))
  })
}
