import { useTranslation } from 'react-i18next'
import { usePlayer } from '../player/player'
import { IconX } from './Icons'

/** Einmalige Nachfrage, wenn die Wiedergabe zum ersten Mal endet und „Endlos hören“ noch nie eingestellt wurde. */
export function AutoplayPrompt() {
  const { t } = useTranslation()
  const show = usePlayer((s) => s.autoplayPrompt)
  const answer = usePlayer((s) => s.answerAutoplay)
  if (!show) return null
  return (
    <div className="prompt-card" role="dialog" aria-labelledby="autoplay-prompt-title">
      <button className="icon-btn close" onClick={() => answer(false)} aria-label={t('common.close')}><IconX size={14} /></button>
      <div id="autoplay-prompt-title" className="ap-title">{t('autoplay.promptTitle')}</div>
      <p>{t('autoplay.promptText')}</p>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={() => answer(true)}>{t('autoplay.promptYes')}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => answer(false)}>{t('autoplay.promptNo')}</button>
      </div>
      <div className="hint">{t('autoplay.promptHint')}</div>
    </div>
  )
}
