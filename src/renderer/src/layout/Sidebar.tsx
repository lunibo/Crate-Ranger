import { NavLink } from 'react-router-dom'
import logo from '../assets/icon-64.png'
import { useTranslation } from 'react-i18next'
import { openRelease, useUpdate } from '../lib/update'
import { useAuth, useDownloads } from '../lib/stores'
import { QuotaMeter } from '../components/QuotaMeter'
import {
  IconChart, IconCompass, IconDownload, IconHeart, IconHome, IconList, IconMic, IconSearch, IconSettings, IconSparkle, IconUser
} from '../components/Icons'

const Item = ({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: number }) => (
  <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
    {icon}
    <span>{label}</span>
    {badge ? <span className="nav-badge">{badge}</span> : null}
  </NavLink>
)

export function Sidebar() {
  const { t } = useTranslation()
  const upd = useUpdate((s) => s.state)
  const auth = useAuth((s) => s.state)
  const busy = useAuth((s) => s.busy)
  const openDialog = useAuth((s) => s.openDialog)
  const jobs = useDownloads((s) => s.queue.jobs)
  const active = jobs.filter((j) => ['queued', 'preparing', 'downloading', 'tagging'].includes(j.status)).length
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-icon" src={logo} alt="" width={36} height={36} />
        <div>
          <div className="brand-name">Crate Ranger</div>
          <div className="brand-sub">{t('brand.tagline')}</div>
        </div>
      </div>
      {upd?.status === 'available' && upd.latestVersion && (
        <button className="update-pill" onClick={() => openRelease(upd.url)} title={t('update.download')}>
          {t('update.availableShort', { version: upd.latestVersion })}
        </button>
      )}
      <nav className="nav">
        <Item to="/" icon={<IconHome />} label={t('nav.home')} />
        <Item to="/search" icon={<IconSearch />} label={t('nav.search')} />
        <Item to="/browse" icon={<IconSparkle />} label={t('nav.catalog')} />
        <Item to="/explore" icon={<IconCompass />} label={t('nav.explore')} />
        <Item to="/artists" icon={<IconMic />} label={t('nav.artists')} />
      </nav>
      <div className="nav-label">{t('nav.yourMusic')}</div>
      <nav className="nav">
        <Item to="/playlists" icon={<IconList />} label={t('nav.playlists')} />
        <Item to="/favorites" icon={<IconHeart />} label={t('nav.favorites')} />
        <Item to="/field-report" icon={<IconChart />} label={t('nav.report')} />
        <Item to="/downloads" icon={<IconDownload />} label={t('nav.downloads')} badge={active} />
        <Item to="/settings" icon={<IconSettings />} label={t('nav.settings')} />
      </nav>
      <div className="account">
        {auth?.loggedIn ? (
          <div className="account-card">
            <NavLink to="/settings" className="account-box" title={t('nav.accountSettings')}>
              <IconUser />
              <div>
                <div className="account-name">{t('auth.signedIn')}</div>
                <div className="account-plan">{auth.planName ?? auth.tier}</div>
              </div>
            </NavLink>
            {auth.downloadsAllowed && (
              <NavLink to="/downloads" className="quota-link" title={t('nav.downloads')}>
                <QuotaMeter compact />
              </NavLink>
            )}
          </div>
        ) : (
          <button className="btn btn-primary btn-full" onClick={() => openDialog(true)} disabled={busy}>
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        )}
      </div>
    </aside>
  )
}
