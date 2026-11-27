/** GitHub-Repository, dessen Releases auf neue Versionen geprüft werden (bei einem Fork hier anpassen). */
export const UPDATE_REPO = 'lunibo/Crate-Ranger'
export const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`

interface ParsedVersion {
  nums: [number, number, number]
  pre: string[]
}

/** „v1.2.3“, „1.2.3-beta.1“ → Bestandteile; ungültig → null. */
export function parseVersion(v: string): ParsedVersion | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim())
  if (!m) return null
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
}

/** Vergleicht zwei Versionen nach SemVer: < 0 wenn a älter ist, > 0 wenn a neuer ist, 0 bei Gleichstand. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i]
  // Version ohne Vorabkennung ist neuer als die gleiche mit (1.0.0 > 1.0.0-beta)
  if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

export const isNewerVersion = (latest: string, current: string): boolean => compareVersions(latest, current) > 0
