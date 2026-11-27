import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { IconChevronLeft, IconChevronRight, IconSearch, IconSparkle, IconX } from '../components/Icons'

/**
 * Zurück/Vor-Zustand aus der Router-History. Der Router legt den Index des aktuellen
 * Eintrags in history.state.idx ab; wie weit man vorwärts kann, merken wir uns selbst
 * (ein neuer Seitenaufruf verwirft die Vorwärts-Einträge, Zurück/Vor nicht).
 */
function useHistoryNav(): { canBack: boolean; canForward: boolean } {
  const loc = useLocation()
  const type = useNavigationType()
  const [pos, setPos] = useState({ idx: 0, max: 0 })
  useEffect(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    setPos((p) => ({ idx, max: type === 'PUSH' ? idx : Math.max(p.max, idx) }))
  }, [loc.key, type])
  return { canBack: pos.idx > 0, canForward: pos.idx < pos.max }
}

export function TitleBar() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const loc = useLocation()
  const { canBack, canForward } = useHistoryNav()
  const inputRef = useRef<HTMLInputElement>(null)
  const onSearch = loc.pathname === '/search'
  const [text, setText] = useState('')

  // Feld mit der URL abgleichen: auf der Suchseite zeigt es den Suchbegriff, sonst ist es leer
  useEffect(() => {
    setText(onSearch ? new URLSearchParams(loc.search).get('q') ?? '' : '')
  }, [onSearch, loc.search])

  // Beim Wechsel auf die Suchseite (z. B. über die Sidebar) direkt ins Feld springen
  useEffect(() => {
    if (onSearch) inputRef.current?.focus()
  }, [onSearch])

  // Zurück/Vor per Alt+←/→ und Maus-Seitentasten, Strg+K springt ins Suchfeld
  const canRef = useRef({ canBack, canForward })
  canRef.current = { canBack, canForward }
  useEffect(() => {
    const go = (dir: -1 | 1): void => {
      if (dir < 0 ? canRef.current.canBack : canRef.current.canForward) nav(dir)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && e.key === 'ArrowLeft') go(-1)
      else if (e.altKey && e.key === 'ArrowRight') go(1)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        go(e.button === 3 ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [nav])

  const change = (value: string): void => {
    setText(value)
    // Tippen führt immer zur normalen Namenssuche; auf der Suchseite ohne neuen History-Eintrag
    nav({ pathname: '/search', search: value ? `?q=${encodeURIComponent(value)}` : '' }, { replace: onSearch })
  }
  const submitAi = (): void => {
    const q = text.trim()
    if (q.length < 3) return
    window.ss.stats.event({ type: 'ai-search', ref: q })
    nav(`/search?mode=ai&q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="titlebar">
      <div className="titlebar-nav">
        <button className="titlebar-btn" onClick={() => nav(-1)} disabled={!canBack} title={t('nav.back')} aria-label={t('nav.back')}>
          <IconChevronLeft />
        </button>
        <button className="titlebar-btn" onClick={() => nav(1)} disabled={!canForward} title={t('nav.forward')} aria-label={t('nav.forward')}>
          <IconChevronRight />
        </button>
      </div>
      <div className="titlebar-search">
        <IconSearch size={16} />
        <input
          ref={inputRef}
          value={text}
          placeholder={t('search.placeholder')}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitAi()
            else if (e.key === 'Escape') {
              if (text) change('')
              else e.currentTarget.blur()
            }
          }}
          spellCheck={false}
        />
        {text && (
          <button className="titlebar-btn small" onClick={() => { change(''); inputRef.current?.focus() }} title={t('search.clear')} aria-label={t('search.clear')}>
            <IconX size={14} />
          </button>
        )}
        <button className="titlebar-btn small ai" onClick={submitAi} disabled={text.trim().length < 3} title={t('search.aiSearchHint')} aria-label={t('search.aiSearch')}>
          <IconSparkle size={15} />
        </button>
      </div>
    </header>
  )
}
