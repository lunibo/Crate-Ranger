import { describe, expect, it } from 'vitest'
import { clearUpcoming, compact, firstAutoplayPos, insertAt, moveUpcoming, removeUpcoming } from '../src/renderer/src/player/queueOps'

type T = { id: string; autoplay?: boolean }
const tr = (id: string, autoplay = false): T => (autoplay ? { id, autoplay } : { id })
const seq = (s: { queue: T[]; order: number[] }): string => s.order.map((i) => s.queue[i].id).join('')

describe('Wiedergabe-Warteschlange', () => {
  const queue = ['a', 'b', 'c', 'd', 'e'].map((x) => tr(x))
  const order = [0, 1, 2, 3, 4]

  it('verschiebt kommende Tracks nach oben und unten', () => {
    // pos 1 = „b“ läuft
    expect(seq(moveUpcoming(queue, order, 1, 4, 2, false)!)).toBe('abecd')
    expect(seq(moveUpcoming(queue, order, 1, 2, 4, false)!)).toBe('abdec')
  })

  it('lässt den aktuellen und bereits gespielte Tracks nicht verschieben', () => {
    expect(moveUpcoming(queue, order, 1, 1, 3, false)).toBeNull()
    expect(moveUpcoming(queue, order, 1, 3, 1, false)).toBeNull()
    expect(moveUpcoming(queue, order, 1, 0, 3, false)).toBeNull()
    expect(moveUpcoming(queue, order, 1, 3, 3, false)).toBeNull()
  })

  it('entfernt einzelne kommende Tracks und hält queue/order konsistent', () => {
    const r = removeUpcoming(queue, order, 1, 3, false)!
    expect(seq(r)).toBe('abce')
    expect(r.queue).toHaveLength(4)
    expect(r.order).toEqual([0, 1, 2, 3])
    expect(removeUpcoming(queue, order, 1, 1, false)).toBeNull() // aktueller Track
  })

  it('leert nur die kommenden Tracks', () => {
    const r = clearUpcoming(queue, order, 2, false)!
    expect(seq(r)).toBe('abc')
    expect(clearUpcoming(queue, order, 4, false)).toBeNull()
  })

  it('übernimmt manuelle Reihenfolge ohne Zufall in die queue (Zufall aus/an verliert sie nicht)', () => {
    const r = moveUpcoming(queue, order, 0, 4, 1, false)!
    expect(r.queue.map((x) => x.id).join('')).toBe('aebcd')
    expect(r.order).toEqual([0, 1, 2, 3, 4])
  })

  it('behält bei Zufall die queue-Reihenfolge und nummeriert order neu', () => {
    const shuffledOrder = [3, 0, 4, 1, 2] // d a e b c, pos 0 = „d“
    const r = removeUpcoming(queue, shuffledOrder, 0, 2, true)! // „e“ raus
    expect(seq(r)).toBe('dabc')
    expect(r.queue.map((x) => x.id).join('')).toBe('abcd')
    const m = moveUpcoming(queue, shuffledOrder, 0, 4, 1, true)!
    expect(seq(m)).toBe('dcaeb')
    expect(compact(queue, shuffledOrder, true).order).toEqual(shuffledOrder)
  })

  it('reiht neue Tracks vor „Endlos hören“-Tracks ein', () => {
    const q = [tr('a'), tr('b'), tr('x', true), tr('y', true)]
    const o = [0, 1, 2, 3]
    expect(firstAutoplayPos(q, o, 0)).toBe(2)
    expect(seq(insertAt(q, o, firstAutoplayPos(q, o, 0), [tr('n')]))).toBe('abnxy')
    expect(firstAutoplayPos([tr('a')], [0], 0)).toBe(1)
  })

  it('ordnet verschobene Tracks dem Abschnitt zu, in dem sie landen', () => {
    const q = [tr('a'), tr('b'), tr('x', true), tr('y', true)]
    const o = [0, 1, 2, 3]
    // „y“ (Endlos hören) direkt hinter den aktuellen Track → gehört jetzt zur eigenen Warteschlange
    const up = moveUpcoming(q, o, 0, 3, 1, false)!
    expect(seq(up)).toBe('aybx')
    expect(up.queue[1].autoplay).toBe(false)
    // „b“ (eigener) hinter „x“ → landet im Endlos-hören-Abschnitt
    const down = moveUpcoming(q, o, 0, 1, 2, false)!
    expect(seq(down)).toBe('axby')
    expect(down.queue[2].autoplay).toBe(true)
  })
})
