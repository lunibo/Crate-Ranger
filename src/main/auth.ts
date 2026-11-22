import { BrowserWindow, type Session } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import { t } from './i18n'
import type { AuthState } from '@shared/types'
import { ApiError, SITE, type SoundScoutApi } from './api/client'

interface Me {
  ID: string
  Tier: string
  DownloadUpgradeRequired?: boolean
}
interface SubStatus {
  Tier?: string
  PlanName?: string
  SubscriptionStatus?: string
  Finish?: string
}

const PAID_TIERS = ['personal', 'creator', 'legacy', 'welcome_back', 'personal_trial', 'creator_trial', 'legacy_trial', 'welcome_back_trial']

export async function getAuthState(api: SoundScoutApi): Promise<AuthState> {
  try {
    const me = await api.get<Me>('/me', { columns: ['tier', 'tier_ignoring_free'] })
    let sub: SubStatus = {}
    try {
      sub = await api.get<SubStatus>('/subscribe/status')
    } catch {
      /* kein Abo */
    }
    const tier = me.Tier || sub.Tier || 'free'
    return {
      loggedIn: true,
      tier,
      planName: sub.PlanName,
      subscriptionStatus: sub.SubscriptionStatus,
      periodEnd: sub.Finish,
      downloadsAllowed: PAID_TIERS.includes(tier) && !me.DownloadUpgradeRequired
    }
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return { loggedIn: false, downloadsAllowed: false }
    return { loggedIn: false, downloadsAllowed: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Öffnet die echte SoundScout-Anmeldeseite (Captcha/2FA werden dort erledigt).
 * Gleiche Session wie der API-Client – das Session-Cookie goldloginz landet direkt dort.
 */
export function openLoginWindow(parent: BrowserWindow | null, ses: Session, api: SoundScoutApi): Promise<AuthState> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: false,
      title: t('login.title'),
      autoHideMenuBar: true,
      backgroundColor: '#0a0e18',
      icon: appIcon,
      webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    // Externe Links (Google/Twitch-OAuth etc.) im selben Fenster lassen, Popups unterbinden
    win.webContents.setWindowOpenHandler(({ url }) => {
      void win.loadURL(url)
      return { action: 'deny' }
    })
    let finished = false
    const finish = async (): Promise<void> => {
      if (finished) return
      const state = await getAuthState(api)
      if (state.loggedIn) {
        finished = true
        await ses.cookies.flushStore().catch(() => undefined)
        resolve(state)
        if (!win.isDestroyed()) win.close()
      }
    }
    const onNav = (_e: unknown, url: string): void => {
      try {
        const u = new URL(url)
        if (u.origin === SITE && u.pathname.startsWith('/player')) void finish()
      } catch {
        /* ignore */
      }
    }
    win.webContents.on('did-navigate', onNav)
    win.webContents.on('did-navigate-in-page', onNav)
    win.on('closed', () => {
      if (!finished) {
        finished = true
        void getAuthState(api).then(resolve)
      }
    })
    void win.loadURL(`${SITE}/sign-in?next=%2Fplayer`)
  })
}

export async function logout(api: SoundScoutApi, ses: Session): Promise<AuthState> {
  try {
    await api.post('/sign-out')
  } catch {
    /* Session evtl. schon abgelaufen */
  }
  await ses.clearStorageData({ storages: ['cookies'], origin: SITE })
  return { loggedIn: false, downloadsAllowed: false }
}

const SESSION_COOKIE = 'goldloginz'

/**
 * Ausweichweg, falls die Captcha-Prüfung im eingebetteten Fenster scheitert:
 * Der Wert des Cookies „goldloginz“ aus einer normalen Browser-Anmeldung wird übernommen.
 */
export async function importSession(api: SoundScoutApi, ses: Session, raw: unknown): Promise<AuthState> {
  let value = typeof raw === 'string' ? raw.trim() : ''
  value = value.replace(/^goldloginz\s*=\s*/i, '').replace(/;.*$/, '').replace(/^"|"$/g, '')
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_\-=.%+/]+$/.test(value)) {
    return { loggedIn: false, downloadsAllowed: false, error: t('errors.invalidSessionValue') }
  }
  await ses.cookies.set({
    url: SITE,
    name: SESSION_COOKIE,
    value,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'no_restriction',
    expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 3600
  })
  const state = await getAuthState(api)
  await ses.cookies.flushStore().catch(() => undefined)
  if (!state.loggedIn) {
    await ses.cookies.remove(SITE, SESSION_COOKIE)
    return { ...state, error: state.error ?? t('errors.sessionRejected') }
  }
  return state
}
