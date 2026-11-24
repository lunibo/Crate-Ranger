import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type MenuPos = { x: number; y: number }

/**
 * Gerüst für Menüs: mit `at` als Kontextmenü an der Mausposition (per Portal, im Fenster gehalten),
 * sonst als Ausklapp-Menü unter dem auslösenden Button (`row-menu`).
 * Schließt bei Klick daneben, Escape, Scrollen, Größenänderung und Fokusverlust.
 * `relayout`: Werte, bei deren Änderung neu ausgemessen wird (z.B. wenn der Inhalt wechselt).
 */
export function PopupMenu({ at, onClose, relayout = [], children }: { at?: MenuPos; onClose: () => void; relayout?: unknown[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = (e: Event): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    if (at) window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose, at])
  // Im Fenster halten (nach rechts/unten nicht abschneiden) – auch wenn sich der Inhalt ändert
  useLayoutEffect(() => {
    if (!at || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const m = 8
    setPos({
      x: Math.max(m, Math.min(at.x, window.innerWidth - width - m)),
      y: at.y + height + m > window.innerHeight ? Math.max(m, at.y - height) : at.y
    })
  }, [at, ...relayout])

  const body = (
    <div
      className={`menu ${at ? 'context-menu' : 'row-menu'}`}
      ref={ref}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
      role="menu"
    >
      {children}
    </div>
  )
  return at ? createPortal(body, document.body) : body
}
