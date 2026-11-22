import { create } from 'zustand'
import type { UpdateState } from '@shared/types'

interface UpdateStore {
  state: UpdateState | null
  /** in dieser Sitzung weggeklickte Version („Später“) */
  dismissed: string | null
  init(): void
  check(): Promise<void>
  dismiss(): void
}

let started = false

export const useUpdate = create<UpdateStore>((set, get) => ({
  state: null,
  dismissed: null,
  init() {
    if (started) return
    started = true
    void window.ss.update.state().then((state) => set({ state }))
    window.ss.update.onState((state) => set({ state }))
  },
  async check() {
    set({ state: await window.ss.update.check() })
  },
  dismiss() {
    set({ dismissed: get().state?.latestVersion ?? null })
  }
}))

export const openRelease = (url?: string): void => {
  if (url) void window.ss.shell.openExternal(url)
}
