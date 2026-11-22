import type { SsBridge } from '../shared/types'

declare global {
  interface Window {
    ss: SsBridge
  }
}

export {}
