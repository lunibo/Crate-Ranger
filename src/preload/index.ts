import { contextBridge, ipcRenderer } from 'electron'
import type { LibraryRefreshProgress, LibrarySnapshot, PresenceStatus, UpdateState, QueueState, QuotaInfo, SsBridge } from '@shared/types'

const on = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const bridge: SsBridge = {
  api: {
    get: (path, params) => ipcRenderer.invoke('api:get', path, params),
    post: (path, body, params) => ipcRenderer.invoke('api:post', path, body, params)
  },
  auth: {
    state: () => ipcRenderer.invoke('auth:state'),
    login: () => ipcRenderer.invoke('auth:login'),
    importSession: (v) => ipcRenderer.invoke('auth:importSession', v),
    openBrowserLogin: () => ipcRenderer.invoke('auth:openBrowserLogin'),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  player: {
    resolve: (trackId, force) => ipcRenderer.invoke('player:resolve', trackId, force),
    localUrl: (path) => `media://local/${encodeURIComponent(path)}`
  },
  downloads: {
    enqueueTracks: (tracks, format, force) => ipcRenderer.invoke('downloads:enqueueTracks', tracks, format, force),
    enqueueRelease: (id, format, force) => ipcRenderer.invoke('downloads:enqueueRelease', id, format, force),
    enqueuePlaylist: (id, format, force) => ipcRenderer.invoke('downloads:enqueuePlaylist', id, format, force),
    state: () => ipcRenderer.invoke('downloads:state'),
    pause: () => ipcRenderer.invoke('downloads:pause'),
    resume: () => ipcRenderer.invoke('downloads:resume'),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    retry: (id) => ipcRenderer.invoke('downloads:retry', id),
    clearFinished: () => ipcRenderer.invoke('downloads:clearFinished'),
    onUpdate: (cb) => on<QueueState>('downloads:update', cb),
    quota: () => ipcRenderer.invoke('downloads:quota'),
    onQuota: (cb) => on<QuotaInfo>('downloads:quota', cb)
  },
  cache: {
    info: () => ipcRenderer.invoke('cache:info'),
    clear: () => ipcRenderer.invoke('cache:clear')
  },
  stats: {
    play: (record, final) => ipcRenderer.send('stats:play', record, final),
    event: (e) => ipcRenderer.send('stats:event', e),
    get: () => ipcRenderer.invoke('stats:get'),
    clear: () => ipcRenderer.invoke('stats:clear')
  },
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    onState: (cb) => on<UpdateState>('update:state', cb)
  },
  presence: {
    update: (track) => ipcRenderer.send('presence:update', track),
    status: () => ipcRenderer.invoke('presence:status'),
    onStatus: (cb) => on<PresenceStatus>('presence:status', cb)
  },
  library: {
    snapshot: () => ipcRenderer.invoke('library:snapshot'),
    verify: () => ipcRenderer.invoke('library:verify'),
    scan: () => ipcRenderer.invoke('library:scan'),
    remove: (trackId, deleteFiles) => ipcRenderer.invoke('library:remove', trackId, deleteFiles),
    refresh: () => ipcRenderer.invoke('library:refresh'),
    onRefreshProgress: (cb) => on<LibraryRefreshProgress>('library:refreshProgress', cb),
    onUpdate: (cb) => on<LibrarySnapshot>('library:update', cb)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    chooseFolder: () => ipcRenderer.invoke('settings:chooseFolder'),
    previewPath: (template) => ipcRenderer.invoke('settings:previewPath', template)
  },
  shell: {
    showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  }
}

contextBridge.exposeInMainWorld('ss', bridge)
