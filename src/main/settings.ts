import { app } from 'electron'
import { join } from 'node:path'
import type { DownloadFormat, Settings } from '@shared/types'
import { DEFAULT_PATH_TEMPLATE } from '@shared/types'
import { isValidLanguageSetting, SYSTEM_LANGUAGE } from '@shared/i18n'
import { readJson, writeJsonAtomic } from './jsonFile'

const FORMATS: DownloadFormat[] = ['FLAC', 'MP3_320', 'WAV']

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function defaults(): Settings {
  return {
    downloadRoot: join(app.getPath('music'), 'SoundScout'),
    format: 'FLAC',
    pathTemplate: DEFAULT_PATH_TEMPLATE,
    concurrency: 2,
    skipExisting: true,
    saveCoverFile: true,
    volume: 0.8,
    language: SYSTEM_LANGUAGE,
    discordEnabled: false,
    statsEnabled: true
  }
}

let current: Settings | null = null

function validate(s: Settings): Settings {
  const d = defaults()
  return {
    downloadRoot: typeof s.downloadRoot === 'string' && s.downloadRoot.trim() ? s.downloadRoot : d.downloadRoot,
    format: FORMATS.includes(s.format) ? s.format : d.format,
    pathTemplate:
      typeof s.pathTemplate === 'string' && s.pathTemplate.includes('{') ? s.pathTemplate : d.pathTemplate,
    concurrency: Math.min(4, Math.max(1, Math.round(Number(s.concurrency) || d.concurrency))),
    skipExisting: typeof s.skipExisting === 'boolean' ? s.skipExisting : d.skipExisting,
    saveCoverFile: typeof s.saveCoverFile === 'boolean' ? s.saveCoverFile : d.saveCoverFile,
    volume: Math.min(1, Math.max(0, Number(s.volume ?? d.volume))),
    language: isValidLanguageSetting(s.language) ? s.language : d.language,
    discordEnabled: typeof s.discordEnabled === 'boolean' ? s.discordEnabled : d.discordEnabled,
    statsEnabled: typeof s.statsEnabled === 'boolean' ? s.statsEnabled : d.statsEnabled
  }
}

export function getSettings(): Settings {
  if (!current) current = validate({ ...defaults(), ...readJson<Partial<Settings>>(file(), {}) } as Settings)
  return current
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = validate({ ...getSettings(), ...patch })
  writeJsonAtomic(file(), current)
  return current
}
